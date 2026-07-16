# Atlas Core Schema Baseline

Статус: **05 — clean-environment baseline v1**

Область: **05 — Backend и инфраструктура**

Дата: **2026-07-16**

## 1. Назначение

Migration `202607120600_core_schema_baseline.sql` воспроизводит на новой чистой Supabase-среде три production tables, которые раньше отсутствовали в repository migrations:

- `public.profiles`;
- `public.ai_models`;
- `public.content_items`.

Она фиксирует только подтверждённое production-состояние: колонки, типы, defaults, nullable, PK/FK/UNIQUE/CHECK constraints, RLS enablement и существующие legacy policies.

Baseline не является целевой tenant-моделью и не исправляет существующие архитектурные риски. Его задача — сделать начальную физическую схему воспроизводимой до любых additive изменений.

## 2. Критическое предупреждение для production

> **Не запускать `202607120600_core_schema_baseline.sql` на существующем production Atlas.**

Production уже содержит `profiles`, `ai_models` и `content_items`. Baseline предназначен только для новой чистой Supabase-среды. В нём намеренно нет `IF NOT EXISTS`: повторное или ошибочное применение должно завершиться ошибкой, а не скрыть schema drift.

Production inventory не обнаружил доступную relation `supabase_migrations.schema_migrations`, поэтому migration history нельзя безопасно «догадать» или отметить применённой в рамках этого PR. Reconciliation production migration history будет отдельной задачей с повторной проверкой schema equivalence, backup/rollback plan и явным способом регистрации baseline без исполнения его DDL.

Этот PR:

- не подключается к production;
- не выполняет SQL в Supabase SQL Editor;
- не создаёт и не изменяет production migration history;
- не меняет runtime, API, UI, Storage или RLS production.

## 3. Происхождение DDL

Источник истины — обезличенный read-only inventory production от 2026-07-16, зафиксированный в `PRODUCTION_SCHEMA_INVENTORY.md`:

- PostgreSQL `17.0.6`;
- `information_schema`/`pg_catalog` metadata для колонок, defaults и nullable;
- catalog definitions для constraints, indexes, RLS status и policies;
- без чтения email, UUID пользователей или содержимого доменных строк.

Дополнительные источники использовались только для проверки границ:

- `DATA_MODEL.md` — будущая модель не должна попасть в baseline;
- `RUNTIME_SCHEMA_DRIFT.md` — `asset_url` и `review_comment` отсутствуют в production;
- существующие migrations `202607120700` и `202607120800` — baseline должен создать их prerequisites и сортироваться раньше;
- runtime обращения к `profiles`, `ai_models` и `content_items` — проверка используемых relation names, не источник неподтверждённых колонок.

DDL не восстановлен по предположениям runtime. Если runtime ожидает поле, которого нет в production inventory, оно не добавляется в baseline.

## 4. Порядок полного migration chain

| Порядок | Migration | Результат |
| ---: | --- | --- |
| 1 | `202607120600_core_schema_baseline.sql` | `profiles`, `ai_models`, `content_items`, их legacy constraints и RLS policies |
| 2 | `202607120700_avatar_generation.sql` | `generation_jobs`, `model_references`, `atlas-assets` и начальные policies |
| 3 | `202607120800_character_scenes.sql` | `generation_jobs.kind`, delete/update policies для scene/reference flow |

Имя `202607120600` лексикографически и хронологически сортируется перед `202607120700` и `202607120800`. Это необходимо, потому что migration `0700` создаёт FK `generation_jobs.model_id → ai_models.id` и `model_references.model_id → ai_models.id`.

## 5. Воспроизводимая baseline-схема

### 5.1. `profiles`

| Column | Type | Default | Nullable |
| --- | --- | --- | --- |
| `id` | `uuid` | — | Нет |
| `email` | `text` | — | Нет |
| `role` | `text` | `'editor'::text` | Нет |
| `created_at` | `timestamptz` | `now()` | Да |

Constraints:

- `profiles_pkey`: PK (`id`);
- `profiles_email_key`: UNIQUE (`email`);
- `profiles_id_fkey`: `id → auth.users(id) ON DELETE CASCADE`;
- `profiles_role_check`: `role IN ('owner', 'editor')`.

Legacy RLS:

- RLS enabled, not forced;
- authenticated SELECT with `USING (true)`;
- no authenticated INSERT/UPDATE/DELETE policy in confirmed production inventory.

### 5.2. `ai_models`

| Column | Type | Default | Nullable |
| --- | --- | --- | --- |
| `id` | `uuid` | `gen_random_uuid()` | Нет |
| `name` | `text` | — | Нет |
| `handle` | `text` | — | Да |
| `niche` | `text` | — | Да |
| `bio` | `text` | — | Да |
| `status` | `text` | `'draft'::text` | Да |
| `visual_passport` | `jsonb` | `'{}'::jsonb` | Да |
| `created_by` | `uuid` | — | Да |
| `created_at` | `timestamptz` | `now()` | Да |
| `updated_at` | `timestamptz` | `now()` | Да |

Constraints:

- `ai_models_pkey`: PK (`id`);
- `ai_models_created_by_fkey`: `created_by → auth.users(id)`.

Legacy RLS:

- authenticated SELECT with `USING (true)`;
- authenticated INSERT with `WITH CHECK (auth.uid() = created_by)`;
- authenticated UPDATE with `USING (true)` and no explicit `WITH CHECK`;
- no authenticated DELETE policy.

### 5.3. `content_items`

| Column | Type | Default | Nullable |
| --- | --- | --- | --- |
| `id` | `uuid` | `gen_random_uuid()` | Нет |
| `model_id` | `uuid` | — | Да |
| `title` | `text` | — | Нет |
| `platform` | `text` | — | Да |
| `format` | `text` | — | Да |
| `status` | `text` | `'draft'::text` | Да |
| `caption` | `text` | — | Да |
| `visual_prompt` | `text` | — | Да |
| `shot_list` | `jsonb` | `'[]'::jsonb` | Да |
| `publish_at` | `timestamptz` | — | Да |
| `created_by` | `uuid` | — | Да |
| `created_at` | `timestamptz` | `now()` | Да |
| `updated_at` | `timestamptz` | `now()` | Да |

Constraints:

- `content_items_pkey`: PK (`id`);
- `content_items_model_id_fkey`: `model_id → ai_models(id) ON DELETE CASCADE`;
- `content_items_created_by_fkey`: `created_by → auth.users(id)`.

Legacy RLS:

- authenticated SELECT with `USING (true)`;
- authenticated INSERT with `WITH CHECK (auth.uid() = created_by)`;
- authenticated UPDATE with `USING (true)` and no explicit `WITH CHECK`;
- no authenticated DELETE policy.

## 6. Намеренно исключено

Baseline не добавляет:

- `asset_url` и `review_comment`;
- `owner_id`, `workspaces` или membership;
- revisions, review/approval history или publication receipts;
- idempotency/fingerprint/cache/cost fields;
- новые indexes, triggers, functions, grants или policies;
- `updated_at` trigger, которого нет в production inventory;
- data rows, users, profiles seed или backfill.

Baseline также не исправляет broad legacy RLS. Он воспроизводит её буквально, чтобы последующий tenant/RLS cutover был отдельным проверяемым изменением.

## 7. Зависимости чистой Supabase-среды

Migration предполагает, что стандартная чистая Supabase-среда уже предоставляет:

- schema/table `auth.users`;
- database role `authenticated`;
- function `auth.uid()`;
- function `gen_random_uuid()`;
- schemas/tables Supabase Storage, необходимые migration `0700`.

Baseline не пытается воспроизводить Supabase-managed Auth/Storage internals.

## 8. Проверка и ограничения

В рабочей среде задачи отсутствуют Supabase CLI, Docker daemon и `psql`. Поэтому изолированная база не поднималась и migration chain не исполнялся.

Выполнены статические проверки:

- SQL parsing всех statements baseline-файла;
- ровно три `CREATE TABLE` для подтверждённых core tables;
- migration filename сортируется первым;
- отсутствие `IF NOT EXISTS` в baseline;
- отсутствие запрещённых target fields/entities;
- сверка колонок, defaults, nullable, constraint names и policies с production inventory;
- неизменность migrations `202607120700` и `202607120800`;
- `npm ci`, `npm run build` и GitHub Actions CI.

Ограничение: static parse не доказывает, что Supabase-managed Auth/Storage dependencies конкретной локальной версии полностью совпадают с production. Перед признанием chain полностью проверенным его нужно выполнить с нуля в изолированном Supabase-проекте и повторить schema inventory/diff. Production для такой проверки не используется.

## 9. Следующие отдельные задачи

1. Поднять чистую staging/local Supabase, выполнить полный chain и сравнить schema inventory с production.
2. Подготовить безопасную production migration-history reconciliation без исполнения baseline DDL.
3. Только затем добавить nullable `asset_url`/`review_comment` отдельной additive migration.
4. После bridge migration исправить runtime error handling отдельным PR.
5. Tenant/workspace, owner-scoped RLS, revisions и approval внедрять последующими additive/cutover migrations.
