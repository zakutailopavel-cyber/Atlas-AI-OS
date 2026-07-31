-- ============================================================
-- Область 03 (контент-фабрика) + 01 (аккаунты персонажа).
-- Добавляет:
--   1) social_accounts — вручную заводимые связки "модель -> площадка/handle",
--      используются как список площадок для генерации недели и как
--      источник контекста для инструкций по загрузке. Это НЕ OAuth-подключение
--      и не даёт Atlas прав на публикацию — только метаданные для команды.
--   2) content_items.trend_note — короткий срез "что было популярно" на момент
--      генерации батча, для прозрачности при ручной проверке.
-- ============================================================

create table public.social_accounts (
  id uuid not null default gen_random_uuid(),
  model_id uuid not null,
  platform text not null,
  handle text not null,
  upload_notes text,
  created_by uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint social_accounts_pkey primary key (id),
  constraint social_accounts_model_id_fkey
    foreign key (model_id) references public.ai_models(id) on delete cascade,
  constraint social_accounts_created_by_fkey
    foreign key (created_by) references auth.users(id),
  constraint social_accounts_platform_check
    check (platform = any (array[
      'instagram'::text,
      'tiktok'::text,
      'reddit'::text,
      'x'::text,
      'telegram'::text,
      'youtube_shorts'::text,
      'fanvue'::text
    ]))
);

create index social_accounts_model_id_idx on public.social_accounts(model_id);

alter table public.social_accounts enable row level security;

create policy "team reads social accounts"
  on public.social_accounts
  for select
  to authenticated
  using (true);

create policy "team manages own social accounts"
  on public.social_accounts
  for all
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

alter table public.content_items
  add column trend_note text;
