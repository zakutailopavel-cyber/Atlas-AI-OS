begin;

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

commit;
