-- Funnel analytics, first slice: trackable links and click events.
--
-- Additive only. The redirect endpoint that logs these clicks is public
-- (no auth) on purpose: the people clicking a bio link on Instagram/
-- TikTok/Reddit/Telegram are anonymous visitors, not logged-in Atlas
-- users. Reading the destination URL and inserting a click therefore
-- both have to work for the anon role, but only for exactly what's
-- needed — see get_tracking_destination() below, which returns a single
-- text value instead of granting anon a SELECT policy on content_items
-- (which would expose captions, prompts, and everything else in that
-- table to unauthenticated requests).

alter table public.content_items
  add column tracking_destination_url text;

create table public.link_clicks (
  id uuid not null default gen_random_uuid(),
  content_item_id uuid not null references public.content_items(id) on delete cascade,
  clicked_at timestamp with time zone not null default now(),
  referrer text,
  user_agent text,
  constraint link_clicks_pkey primary key (id)
);

create index link_clicks_content_item_id_idx on public.link_clicks(content_item_id);
create index link_clicks_clicked_at_idx on public.link_clicks(clicked_at);

alter table public.link_clicks enable row level security;

create policy "team reads link clicks"
  on public.link_clicks
  for select
  to authenticated
  using (true);

-- Anonymous visitors following a bio link generate these rows; the FK on
-- content_item_id is the only real constraint on what they can insert.
create policy "anyone can record a link click"
  on public.link_clicks
  for insert
  to anon, authenticated
  with check (true);

create or replace function public.get_tracking_destination(target_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select tracking_destination_url from public.content_items where id = target_id;
$$;

revoke all on function public.get_tracking_destination(uuid) from public;
grant execute on function public.get_tracking_destination(uuid) to anon, authenticated;
