-- Additive tenant foundation for Atlas workspaces.
--
-- This migration is intentionally safe for the pre-cutover phase:
-- - it does not replace existing broad policies on legacy content tables;
-- - it does not backfill owner_id from created_by or any other legacy actor;
-- - it keeps content_items.owner_id nullable;
-- - nullable owner_id is only a bridge and does not provide tenant isolation
--   until a separate backfill, canary verification, and RLS cutover complete.

create table public.workspaces (
  id uuid not null default gen_random_uuid(),
  name text not null,
  status text not null default 'active'::text,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint workspaces_pkey primary key (id),
  constraint workspaces_created_by_fkey
    foreign key (created_by) references auth.users(id),
  constraint workspaces_status_check
    check (status = any (array['active'::text, 'suspended'::text, 'archived'::text]))
);

create table public.workspace_members (
  owner_id uuid not null,
  user_id uuid not null,
  role text not null,
  status text not null default 'active'::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint workspace_members_pkey primary key (owner_id, user_id),
  constraint workspace_members_owner_id_fkey
    foreign key (owner_id) references public.workspaces(id) on delete cascade,
  constraint workspace_members_user_id_fkey
    foreign key (user_id) references auth.users(id) on delete cascade,
  constraint workspace_members_role_check
    check (role = any (array['owner'::text, 'editor'::text, 'viewer'::text])),
  constraint workspace_members_status_check
    check (status = any (array['active'::text, 'invited'::text, 'disabled'::text]))
);

alter table public.content_items
  add column owner_id uuid,
  add constraint content_items_owner_id_fkey
    foreign key (owner_id) references public.workspaces(id);

create index workspaces_status_idx on public.workspaces(status);
create index workspaces_created_by_idx on public.workspaces(created_by);
create index workspace_members_user_id_idx on public.workspace_members(user_id);
create index workspace_members_active_owner_role_idx
  on public.workspace_members(owner_id, role)
  where status = 'active';
create index content_items_owner_id_idx on public.content_items(owner_id);

create or replace function public.is_workspace_member(target_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.owner_id = target_owner_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
  );
$$;

create or replace function public.has_workspace_role(target_owner_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.owner_id = target_owner_id
      and wm.user_id = auth.uid()
      and wm.status = 'active'
      and wm.role = any (allowed_roles)
  );
$$;

revoke all on function public.is_workspace_member(uuid) from public;
revoke all on function public.has_workspace_role(uuid, text[]) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

create policy "workspace members can view workspaces"
  on public.workspaces
  for select
  to authenticated
  using (public.is_workspace_member(id));

create policy "workspace creators can view own workspaces"
  on public.workspaces
  for select
  to authenticated
  using (auth.uid() = created_by);

create policy "authenticated users can create own workspace"
  on public.workspaces
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "workspace owners can update workspaces"
  on public.workspaces
  for update
  to authenticated
  using (public.has_workspace_role(id, array['owner'::text]))
  with check (public.has_workspace_role(id, array['owner'::text]));

create policy "workspace members can view memberships"
  on public.workspace_members
  for select
  to authenticated
  using (public.is_workspace_member(owner_id));

create policy "workspace creators can create owner membership"
  on public.workspace_members
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'::text
    and status = 'active'::text
    and exists (
      select 1
      from public.workspaces w
      where w.id = owner_id
        and w.created_by = auth.uid()
    )
  );

create policy "workspace owners can manage memberships"
  on public.workspace_members
  for all
  to authenticated
  using (public.has_workspace_role(owner_id, array['owner'::text]))
  with check (public.has_workspace_role(owner_id, array['owner'::text]));
