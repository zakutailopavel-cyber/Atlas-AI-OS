-- Content Pipeline v1, first slice: hash-bound manual approval.
--
-- This does not implement the full lifecycle from
-- docs/architecture/CONTENT_PIPELINE.md (idea/material_pending/scheduled/
-- publishing/publish_failed/archived, content_revisions snapshots,
-- publish_payload_hash for the actual publish attempt). It implements
-- just enough to make "ready" mean something: an approval record bound
-- to the exact payload hash and revision at the moment a human approved
-- it, with the approval implicitly invalidated (status reverted to
-- 'review') if the payload changes afterwards.
--
-- Known gap left for a follow-up PR: the top-level status <select> in
-- PublicationDialog and any other UI still let a user directly pick
-- other statuses; this migration only makes 'ready' unreachable without
-- going through the new /api/approve route from PublicationDialog's
-- approval tab. A full sweep of every status-setting entry point in the
-- UI (e.g. the quick-status dropdown in the content list) is out of
-- scope here.

alter table public.content_items
  add column content_revision integer not null default 1;

create table public.content_approvals (
  id uuid not null default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  content_revision integer not null,
  payload_hash text not null,
  decision text not null default 'approved',
  approved_by uuid not null references auth.users(id),
  approved_at timestamp with time zone not null default now(),
  constraint content_approvals_pkey primary key (id),
  constraint content_approvals_decision_check
    check (decision = any (array['approved'::text, 'revoked'::text]))
);

create index content_approvals_content_item_id_idx
  on public.content_approvals(content_item_id);

alter table public.content_approvals enable row level security;

create policy "team reads content approvals"
  on public.content_approvals
  for select
  to authenticated
  using (true);

create policy "team creates own content approvals"
  on public.content_approvals
  for insert
  to authenticated
  with check (auth.uid() = approved_by);

-- Canonical payload hash for the fields an approval actually binds to.
-- Excludes status, timestamps, and administrative fields on purpose:
-- those can change without invalidating an existing approval.
create or replace function public.content_payload_hash(item public.content_items)
returns text
language sql
stable
as $$
  select md5(
    coalesce(item.title, '') || '|' ||
    coalesce(item.platform, '') || '|' ||
    coalesce(item.format, '') || '|' ||
    coalesce(item.caption, '') || '|' ||
    coalesce(item.visual_prompt, '') || '|' ||
    coalesce(item.disclosure, '') || '|' ||
    coalesce(item.asset_url, '')
  );
$$;

create or replace function public.content_payload_hash_by_id(target_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select public.content_payload_hash(ci) from public.content_items ci where ci.id = target_id;
$$;

revoke all on function public.content_payload_hash_by_id(uuid) from public;
grant execute on function public.content_payload_hash_by_id(uuid) to authenticated;

-- Bump content_revision whenever an approval-relevant field changes, and
-- if the item was 'ready' at the time, drop it back to 'review' since
-- the previously recorded approval no longer matches the new payload.
create or replace function public.bump_content_revision()
returns trigger
language plpgsql
as $$
begin
  if (new.title, new.platform, new.format, new.caption, new.visual_prompt, new.disclosure, new.asset_url)
     is distinct from
     (old.title, old.platform, old.format, old.caption, old.visual_prompt, old.disclosure, old.asset_url)
  then
    new.content_revision := old.content_revision + 1;
    if old.status = 'ready' and new.status = 'ready' then
      new.status := 'review';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists content_items_bump_revision on public.content_items;
create trigger content_items_bump_revision
  before update on public.content_items
  for each row execute function public.bump_content_revision();

-- Helper for future UI/reporting: true only if there is an approval that
-- matches the item's current revision and hash exactly.
create or replace function public.is_content_approved(target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.content_approvals ca
    join public.content_items ci on ci.id = ca.content_item_id
    where ca.content_item_id = target_id
      and ca.decision = 'approved'
      and ca.content_revision = ci.content_revision
      and ca.payload_hash = public.content_payload_hash(ci)
  );
$$;

revoke all on function public.is_content_approved(uuid) from public;
grant execute on function public.is_content_approved(uuid) to authenticated;
