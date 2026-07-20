-- Cost governor foundation: per-model spend ledger and budget limits.
--
-- Additive only. Does not touch existing tables, RLS, or storage.
-- No backfill; the ledger starts empty and is populated going forward by
-- server-side API routes (fan-reply, generate, avatar) recording each
-- paid OpenAI/Modal call.

create table public.cost_ledger (
  id uuid not null default gen_random_uuid(),
  model_id uuid,
  category text not null,
  provider text not null,
  estimated_cost_usd numeric(10, 4) not null default 0,
  request_ref text,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  constraint cost_ledger_pkey primary key (id),
  constraint cost_ledger_model_id_fkey
    foreign key (model_id) references public.ai_models(id) on delete set null,
  constraint cost_ledger_created_by_fkey
    foreign key (created_by) references auth.users(id),
  constraint cost_ledger_category_check
    check (category = any (array[
      'openai_text'::text,
      'openai_chat'::text,
      'modal_image'::text,
      'modal_video'::text
    ])),
  constraint cost_ledger_provider_check
    check (provider = any (array['openai'::text, 'modal'::text]))
);

create table public.budget_limits (
  id uuid not null default gen_random_uuid(),
  model_id uuid,
  period text not null,
  limit_usd numeric(10, 2) not null,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint budget_limits_pkey primary key (id),
  constraint budget_limits_model_id_fkey
    foreign key (model_id) references public.ai_models(id) on delete cascade,
  constraint budget_limits_created_by_fkey
    foreign key (created_by) references auth.users(id),
  constraint budget_limits_period_check
    check (period = any (array['daily'::text, 'weekly'::text, 'monthly'::text])),
  constraint budget_limits_model_period_unique unique (model_id, period)
);

create index cost_ledger_model_id_idx on public.cost_ledger(model_id);
create index cost_ledger_created_at_idx on public.cost_ledger(created_at);
create index budget_limits_model_id_idx on public.budget_limits(model_id);

alter table public.cost_ledger enable row level security;
alter table public.budget_limits enable row level security;

create policy "team reads cost ledger"
  on public.cost_ledger
  for select
  to authenticated
  using (true);

create policy "team writes own cost ledger entries"
  on public.cost_ledger
  for insert
  to authenticated
  with check (auth.uid() = created_by);

create policy "team reads budget limits"
  on public.budget_limits
  for select
  to authenticated
  using (true);

create policy "team manages own budget limits"
  on public.budget_limits
  for all
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- Returns spend for a model within the current period window.
create or replace function public.spend_for_period(
  target_model_id uuid,
  target_period text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(estimated_cost_usd), 0)
  from public.cost_ledger
  where model_id = target_model_id
    and created_at >= case target_period
      when 'daily' then date_trunc('day', now())
      when 'weekly' then date_trunc('week', now())
      when 'monthly' then date_trunc('month', now())
      else date_trunc('day', now())
    end;
$$;

-- Returns true only if the model has an active budget limit AND spend for
-- the current period has reached or exceeded it. A model with no
-- configured limit is never blocked here — "no limit set" is treated as
-- an explicit choice by the operator, not a bypass; callers should warn
-- in the UI when no budget_limits row exists for a model.
create or replace function public.is_over_budget(target_model_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.budget_limits bl
    where bl.model_id = target_model_id
      and public.spend_for_period(bl.model_id, bl.period) >= bl.limit_usd
  );
$$;

revoke all on function public.spend_for_period(uuid, text) from public;
revoke all on function public.is_over_budget(uuid) from public;
grant execute on function public.spend_for_period(uuid, text) to authenticated;
grant execute on function public.is_over_budget(uuid) to authenticated;
