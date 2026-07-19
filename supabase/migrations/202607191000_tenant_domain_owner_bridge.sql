-- Additive nullable tenant bridge for legacy Atlas domain tables.
--
-- This migration intentionally performs no ownership inference or backfill:
-- created_by identifies an actor and must not be copied into owner_id.
-- Existing legacy RLS policies remain unchanged until a separately approved
-- backfill, verification, and RLS cutover.

alter table public.ai_models
  add column owner_id uuid,
  add constraint ai_models_owner_id_fkey
    foreign key (owner_id) references public.workspaces(id);

alter table public.generation_jobs
  add column owner_id uuid,
  add constraint generation_jobs_owner_id_fkey
    foreign key (owner_id) references public.workspaces(id);

alter table public.model_references
  add column owner_id uuid,
  add constraint model_references_owner_id_fkey
    foreign key (owner_id) references public.workspaces(id);

create index ai_models_owner_id_idx on public.ai_models(owner_id);
create index generation_jobs_owner_id_idx on public.generation_jobs(owner_id);
create index model_references_owner_id_idx on public.model_references(owner_id);
