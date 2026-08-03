-- Face-swap manual upload (PR #100) needs authenticated users to upload
-- their own base photo client-side from AvatarStudio's "Загрузить фото"
-- tab, directly to Supabase Storage. The existing "service uploads atlas
-- assets" policy (202607120700) only allows service_role (the Modal
-- worker) to write to atlas-assets -- authenticated browser uploads were
-- rejected by RLS.
create policy "authenticated uploads faceswap base photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'atlas-assets' and (storage.foldername(name))[1] = 'faceswap-uploads');

-- This migration has not yet been applied to production. The scoped Agent
-- API therefore adds its append-only audit table in the same pending schema
-- step, keeping the recorded migration chain stable until production deploy.
create table if not exists public.agent_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id),
  action text not null check (char_length(action) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id uuid,
  model_id uuid references public.ai_models(id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists agent_audit_log_created_at_idx on public.agent_audit_log(created_at desc);
create index if not exists agent_audit_log_model_id_created_at_idx on public.agent_audit_log(model_id, created_at desc);
create index if not exists agent_audit_log_actor_id_created_at_idx on public.agent_audit_log(actor_id, created_at desc);

alter table public.agent_audit_log enable row level security;

comment on table public.agent_audit_log is 'Append-only audit trail for scoped Atlas Agent API writes. Service role inserts; browser clients have no policies.';

-- Queue for image work delegated to a custom GPT/Claude/external agent.
-- Browser clients have no direct policy; the scoped service-role API is the
-- only writer. This prevents a normal user session from claiming or completing
-- another model's task outside the Atlas UI.
create table if not exists public.agent_image_tasks (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.ai_models(id) on delete cascade,
  content_item_id uuid references public.content_items(id) on delete set null,
  title text not null check (char_length(title) between 1 and 180),
  instructions text not null check (char_length(instructions) between 1 and 12000),
  status text not null default 'queued' check (status in ('queued','claimed','completed','failed','cancelled')),
  reference_ids uuid[] not null default '{}'::uuid[],
  result_url text,
  result_storage_path text,
  result_notes text,
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agent_image_tasks_status_created_at_idx on public.agent_image_tasks(status, created_at);
create index if not exists agent_image_tasks_model_id_created_at_idx on public.agent_image_tasks(model_id, created_at desc);
create index if not exists agent_image_tasks_content_item_id_idx on public.agent_image_tasks(content_item_id);

alter table public.agent_image_tasks enable row level security;

comment on table public.agent_image_tasks is 'Image tasks delegated to scoped external agents. Service role only; no direct browser policies.';
