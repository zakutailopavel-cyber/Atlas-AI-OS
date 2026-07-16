-- Atlas core schema baseline for a NEW, CLEAN Supabase environment only.
--
-- DO NOT run this migration on the existing Atlas production project.
-- Production already contains these tables and requires a separate migration
-- history reconciliation procedure after schema equivalence is verified.
--
-- This file intentionally has no idempotent existence guards: an unexpected
-- existing object must fail loudly instead of hiding schema drift.

create table public.profiles (
  id uuid not null,
  email text not null,
  role text not null default 'editor'::text,
  created_at timestamp with time zone default now(),
  constraint profiles_pkey primary key (id),
  constraint profiles_email_key unique (email),
  constraint profiles_id_fkey
    foreign key (id) references auth.users(id) on delete cascade,
  constraint profiles_role_check
    check (role = any (array['owner'::text, 'editor'::text]))
);

create table public.ai_models (
  id uuid not null default gen_random_uuid(),
  name text not null,
  handle text,
  niche text,
  bio text,
  status text default 'draft'::text,
  visual_passport jsonb default '{}'::jsonb,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint ai_models_pkey primary key (id),
  constraint ai_models_created_by_fkey
    foreign key (created_by) references auth.users(id)
);

create table public.content_items (
  id uuid not null default gen_random_uuid(),
  model_id uuid,
  title text not null,
  platform text,
  format text,
  status text default 'draft'::text,
  caption text,
  visual_prompt text,
  shot_list jsonb default '[]'::jsonb,
  publish_at timestamp with time zone,
  created_by uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint content_items_pkey primary key (id),
  constraint content_items_model_id_fkey
    foreign key (model_id) references public.ai_models(id) on delete cascade,
  constraint content_items_created_by_fkey
    foreign key (created_by) references auth.users(id)
);

alter table public.profiles enable row level security;
alter table public.ai_models enable row level security;
alter table public.content_items enable row level security;

create policy "team can view profiles"
  on public.profiles
  for select
  to authenticated
  using (true);

create policy "team can view models"
  on public.ai_models
  for select
  to authenticated
  using (true);

create policy "team can create models"
  on public.ai_models
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "team can update models"
  on public.ai_models
  for update
  to authenticated
  using (true);

create policy "team can view content"
  on public.content_items
  for select
  to authenticated
  using (true);

create policy "team can create content"
  on public.content_items
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "team can update content"
  on public.content_items
  for update
  to authenticated
  using (true);
