# Atlas Production Supabase Schema Inventory

Статус: **05 — read-only production inventory, снимок 2026-07-16**

Область: **05 — Backend и инфраструктура**

Этот документ фиксирует фактическую схему production Supabase Atlas на момент снимка. Он не является migration-файлом и не меняет production, RLS, Storage, runtime, API, Modal или интерфейс.

## 1. Источник и ограничения

- Снимок получен 2026-07-16 в `15:10:44 UTC` (`18:10:44 Europe/Tallinn`) на PostgreSQL `17.0.6` (`server_version_num = 170006`).
- Владелец выполнил в Supabase SQL Editor один transaction-scoped read-only запрос: `BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK;`.
- Отчёт содержит только metadata и агрегаты. Email, UUID пользователей, содержимое доменных строк, prompts, captions, URL, object names и Storage paths не читались в результат и не сохранены.
- Количество строк получено через `count(*)`, а integrity/ownership checks — через агрегированные join/group queries.
- В отчёте нет `supabase_migrations` relation. Поэтому нельзя по production migration history доказать, какие repository migrations применялись; ниже сравнивается только конечная схема.
- Точный cross-owner анализ невозможен до появления `owner_id`. Проверки `created_by` ниже являются только legacy proxy: различие автора дочерней строки и автора модели может быть нормальной работой помощника, но при текущей схеме не позволяет доказать tenant boundary.

## 2. Relations и количество строк

### 2.1. Atlas и Auth

| Relation | Тип | Строк | Назначение |
| --- | --- | ---: | --- |
| `auth.users` | table | 2 | Supabase Auth; содержимое не читалось |
| `public.profiles` | table | 2 | Роль пользователя в Atlas |
| `public.ai_models` | table | 43 | AI-персонажи и legacy `visual_passport` |
| `public.content_items` | table | 3 | Контент и lifecycle legacy runtime |
| `public.generation_jobs` | table | 34 | Очередь Modal avatar/scene |
| `public.model_references` | table | 22 | Референсы и результаты моделей |

### 2.2. Supabase Storage system relations

Обнаружены `storage.buckets`, `storage.objects`, `storage.migrations`, `storage.s3_multipart_uploads`, `storage.s3_multipart_uploads_parts`, `storage.buckets_analytics`, `storage.buckets_vectors` и `storage.vector_indexes`. Это управляемые Supabase relations, а не Atlas domain tables.

В `storage.buckets` находится 1 bucket, в `storage.objects` — 90 объектов. Имена и paths объектов не извлекались.

## 3. Public columns: типы, defaults и nullable

`NULL` в колонке Default означает отсутствие default. `Да` в Nullable означает, что production допускает `NULL`.

### 3.1. `profiles`

| Колонка | Тип | Default | Nullable |
| --- | --- | --- | --- |
| `id` | `uuid` | — | Нет |
| `email` | `text` | — | Нет |
| `role` | `text` | `'editor'` | Нет |
| `created_at` | `timestamptz` | `now()` | Да |

### 3.2. `ai_models`

| Колонка | Тип | Default | Nullable |
| --- | --- | --- | --- |
| `id` | `uuid` | `gen_random_uuid()` | Нет |
| `name` | `text` | — | Нет |
| `handle` | `text` | — | Да |
| `niche` | `text` | — | Да |
| `bio` | `text` | — | Да |
| `status` | `text` | `'draft'` | Да |
| `visual_passport` | `jsonb` | `'{}'::jsonb` | Да |
| `created_by` | `uuid` | — | Да |
| `created_at` | `timestamptz` | `now()` | Да |
| `updated_at` | `timestamptz` | `now()` | Да |

### 3.3. `content_items`

| Колонка | Тип | Default | Nullable |
| --- | --- | --- | --- |
| `id` | `uuid` | `gen_random_uuid()` | Нет |
| `model_id` | `uuid` | — | Да |
| `title` | `text` | — | Нет |
| `platform` | `text` | — | Да |
| `format` | `text` | — | Да |
| `status` | `text` | `'draft'` | Да |
| `caption` | `text` | — | Да |
| `visual_prompt` | `text` | — | Да |
| `shot_list` | `jsonb` | `'[]'::jsonb` | Да |
| `publish_at` | `timestamptz` | — | Да |
| `created_by` | `uuid` | — | Да |
| `created_at` | `timestamptz` | `now()` | Да |
| `updated_at` | `timestamptz` | `now()` | Да |

Production **не содержит** `asset_url` и `review_comment`, хотя текущий `dashboard.tsx` выполняет UPDATE этих полей. Это подтверждённое расхождение runtime/schema; inventory не проверял пользовательский сценарий и ничего не исправлял.

### 3.4. `generation_jobs`

| Колонка | Тип | Default | Nullable |
| --- | --- | --- | --- |
| `id` | `uuid` | `gen_random_uuid()` | Нет |
| `model_id` | `uuid` | — | Нет |
| `prompt` | `text` | — | Нет |
| `style` | `text` | `'photorealistic'` | Нет |
| `count` | `integer` | `4` | Нет |
| `status` | `text` | `'queued'` | Нет |
| `output_urls` | `text[]` | — | Да |
| `provider` | `text` | `'modal'` | Нет |
| `provider_job_id` | `text` | — | Да |
| `error` | `text` | — | Да |
| `created_by` | `uuid` | — | Нет |
| `created_at` | `timestamptz` | `now()` | Нет |
| `started_at` | `timestamptz` | — | Да |
| `completed_at` | `timestamptz` | — | Да |
| `kind` | `text` | `'avatar'` | Нет |

### 3.5. `model_references`

| Колонка | Тип | Default | Nullable |
| --- | --- | --- | --- |
| `id` | `uuid` | `gen_random_uuid()` | Нет |
| `model_id` | `uuid` | — | Нет |
| `storage_path` | `text` | — | Нет |
| `kind` | `text` | `'candidate'` | Нет |
| `generation_job_id` | `uuid` | — | Да |
| `created_by` | `uuid` | — | Нет |
| `created_at` | `timestamptz` | `now()` | Нет |

Inventory подтверждает только тип `storage_path = text`. Он намеренно не читал значения и поэтому не определяет, какие строки являются public URL, а какие относительными paths.

## 4. Constraints и indexes

### 4.1. Primary, foreign и unique constraints

| Table | Constraints |
| --- | --- |
| `profiles` | PK (`id`); FK `id → auth.users(id) ON DELETE CASCADE`; UNIQUE (`email`); CHECK `role IN ('owner','editor')` |
| `ai_models` | PK (`id`); FK `created_by → auth.users(id)` |
| `content_items` | PK (`id`); FK `model_id → ai_models(id) ON DELETE CASCADE`; FK `created_by → auth.users(id)` |
| `generation_jobs` | PK (`id`); FK `model_id → ai_models(id) ON DELETE CASCADE`; FK `created_by → auth.users(id)`; CHECK `count BETWEEN 1 AND 4`; CHECK `status IN ('queued','processing','completed','failed')`; CHECK `kind IN ('avatar','scene')` |
| `model_references` | PK (`id`); FK `model_id → ai_models(id) ON DELETE CASCADE`; FK `generation_job_id → generation_jobs(id) ON DELETE SET NULL`; FK `created_by → auth.users(id)`; CHECK `kind IN ('candidate','primary','reference')` |

Все перечисленные constraints validated и не deferrable. Composite tenant FK и unique (`owner_id`, `id`) отсутствуют.

### 4.2. Public indexes

Production имеет только indexes, созданные PK/UNIQUE constraints:

- `ai_models_pkey (id)`;
- `content_items_pkey (id)`;
- `generation_jobs_pkey (id)`;
- `model_references_pkey (id)`;
- `profiles_pkey (id)`;
- `profiles_email_key (email)`.

Отдельных indexes на `model_id`, `created_by`, `generation_job_id`, status/time, fingerprint или idempotency нет. Нет partial unique index, гарантирующего один `model_references.kind = 'primary'` на модель.

### 4.3. Storage integrity и indexes

- `storage.buckets`: PK (`id`), UNIQUE index (`name`).
- `storage.objects`: PK (`id`), FK `bucket_id → storage.buckets(id)`, UNIQUE (`bucket_id`, `name`) и search indexes по bucket/name.
- Multipart tables имеют PK, bucket FK и `upload_id → s3_multipart_uploads(id) ON DELETE CASCADE`.
- Vector tables имеют PK, bucket FK и UNIQUE (`name`, `bucket_id`).

Это Supabase-managed indexes. Их нельзя воспроизводить или изменять Atlas migration без отдельной необходимости.

## 5. RLS и policies

RLS включена на всех 14 обнаруженных relations, но `FORCE ROW LEVEL SECURITY` не включён ни на одной. Для Atlas public tables фактические policies такие:

| Table | Command | Policy | Role | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| `profiles` | SELECT | `team can view profiles` | `authenticated` | `true` | — |
| `ai_models` | SELECT | `team can view models` | `authenticated` | `true` | — |
| `ai_models` | INSERT | `team can create models` | `authenticated` | — | `auth.uid() = created_by` |
| `ai_models` | UPDATE | `team can update models` | `authenticated` | `true` | — |
| `content_items` | SELECT | `team can view content` | `authenticated` | `true` | — |
| `content_items` | INSERT | `team can create content` | `authenticated` | — | `auth.uid() = created_by` |
| `content_items` | UPDATE | `team can update content` | `authenticated` | `true` | — |
| `generation_jobs` | SELECT | `team reads generation jobs` | `authenticated` | `true` | — |
| `generation_jobs` | INSERT | `team creates generation jobs` | `authenticated` | — | `auth.uid() = created_by` |
| `generation_jobs` | UPDATE | `team updates own generation jobs` | `authenticated` | `auth.uid() = created_by` | `auth.uid() = created_by` |
| `generation_jobs` | DELETE | `team deletes own generation jobs` | `authenticated` | `auth.uid() = created_by` | — |
| `model_references` | SELECT | `team reads model references` | `authenticated` | `true` | — |
| `model_references` | INSERT | `team creates model references` | `authenticated` | — | `auth.uid() = created_by` |
| `model_references` | UPDATE | `team updates own model references` | `authenticated` | `auth.uid() = created_by` | `auth.uid() = created_by` |

Следствия:

- любой authenticated пользователь видит все profiles, models, content, jobs и references;
- любой authenticated пользователь может UPDATE любую `ai_models` и `content_items` row; policy не ограничивает owner/creator;
- jobs/references изменяет только их legacy creator, но читает вся команда;
- `created_by` является actor/audit полем и не образует надёжный tenant boundary;
- roles `owner/editor` хранятся в `profiles`, но policies их не проверяют;
- production пока соответствует модели общей доверенной команды, а не owner/helper isolation из `DATA_MODEL.md`.

## 6. Functions и triggers

Atlas-specific functions в `public` и Atlas-specific triggers не обнаружены. Обнаружены только Supabase Storage objects:

| Function | Security definer | Runtime config | Назначение по trigger metadata |
| --- | --- | --- | --- |
| `storage.enforce_bucket_name_length()` | Нет | Нет | BEFORE INSERT/UPDATE `storage.buckets` |
| `storage.protect_delete()` | Нет | Нет | BEFORE DELETE buckets/objects |
| `storage.update_updated_at_column()` | Нет | Нет | BEFORE UPDATE `storage.objects` |

Function bodies не извлекались. Triggers:

- `enforce_bucket_name_length_trigger` — BEFORE INSERT/UPDATE on `storage.buckets`;
- `protect_buckets_delete` — BEFORE DELETE on `storage.buckets`;
- `protect_objects_delete` — BEFORE DELETE on `storage.objects`;
- `update_objects_updated_at` — BEFORE UPDATE on `storage.objects`.

## 7. Storage buckets и policies

| Bucket | Public | Limit | MIME | Objects | Recorded bytes |
| --- | --- | ---: | --- | ---: | ---: |
| `atlas-assets` | Да | 10 MiB/object | JPEG, PNG, WebP | 90 | 11,427,827 |

Policies на `storage.objects`:

- authenticated SELECT для `bucket_id = 'atlas-assets'`;
- service-role INSERT для `bucket_id = 'atlas-assets'`.

Нет Atlas policy для authenticated INSERT/UPDATE/DELETE. Bucket остаётся public legacy Storage, как описано в `DATA_MODEL.md`. Снимок не проверял доступность конкретных URL и не читал object paths.

## 8. Агрегированная целостность и ownership risks

### 8.1. Подтверждённо чистые проверки

Все следующие counts равны нулю:

- Auth user без profile и profile без Auth user;
- `created_by`, не существующий в Auth, для models/content/jobs/references;
- content/job/reference без существующей parent model;
- reference с отсутствующим generation job;
- reference, связанный с job другой model;
- reference/job creator mismatch.

Это подтверждает referential consistency текущих строк в пределах проверенных legacy FK.

### 8.2. Неоднозначное владение

- Ни одна из 4 Atlas domain tables (`ai_models`, `content_items`, `generation_jobs`, `model_references`) не содержит `owner_id`.
- Во всех четырёх tables присутствуют строки двух разных legacy creators.
- `content_items.created_by != ai_models.created_by`: 0 rows.
- `generation_jobs.created_by != ai_models.created_by`: 23 rows из 34.
- `model_references.created_by != ai_models.created_by`: 16 rows из 22.

Эти mismatch не являются доказанным нарушением: помощник вправе генерировать материал для модели владельца. Но без workspace membership и `owner_id` невозможно отличить разрешённую совместную работу от cross-owner связи. Поэтому автоматический backfill зависимых rows по их `created_by` небезопасен; `owner_id` jobs/references нужно наследовать через parent model, как уже требует `DATA_MODEL.md`.

### 8.3. Reference uniqueness

- 1 model имеет несколько primary references;
- найден 1 лишний primary row сверх допустимого одного на model;
- найдено 5 duplicate locator groups в пределах model + `storage_path`;
- точные locator values намеренно не выводились.

До добавления unique primary constraint требуется ручное, tenant-safe решение о каноническом primary. Дубли нельзя удалять автоматически: одинаковый locator может отражать legacy историю или разные назначения.

## 9. Сравнение с `supabase/migrations`

| Объект | Production | Repository migrations | Вывод |
| --- | --- | --- | --- |
| `profiles` | Есть, 4 columns, constraints/RLS | Нет базовой DDL | Невоспроизводимо из repo |
| `ai_models` | Есть, 10 columns, constraints/RLS | Нет базовой DDL | Невоспроизводимо из repo |
| `content_items` | Есть, 13 columns, constraints/RLS | Нет базовой DDL | Невоспроизводимо из repo |
| `generation_jobs` | Соответствует двум migrations, включая `kind` и policies | `202607120700`, `202607120800` | Конечная схема совпадает с видимым DDL |
| `model_references` | Соответствует migrations и update policy | `202607120700`, `202607120800` | Конечная схема совпадает с видимым DDL |
| `atlas-assets` | Bucket и две object policies есть | Создаются в `202607120700` | Конечное состояние совпадает |
| Migration history | `supabase_migrations` relations не обнаружены | Два SQL-файла в repo | Нельзя доказать историю применения |

Repository всё ещё не может поднять новую эквивалентную Supabase среду: отсутствуют baseline DDL/RLS для profiles/models/content и сведения о способе их создания.

## 10. Сравнение с `DATA_MODEL.md` и runtime

### Подтверждено production inventory

- legacy tables и публичный `atlas-assets` существуют;
- `visual_passport` — nullable JSONB с default `{}`;
- `created_by` используется как legacy actor, tenant columns отсутствуют;
- broad team read policies существуют;
- нет revisions, approvals, idempotency/fingerprint/cache/cost columns;
- нет unique primary reference constraint;
- безопасный additive tenant rollout из `DATA_MODEL.md` остаётся необходимым.

### Расхождения и уточнения

1. `DATA_MODEL.md` перечисляет `content_items.asset_url` и `review_comment` как наблюдаемые production fields, но inventory доказал, что их нет.
2. Runtime UPDATE этих двух fields не совместим с production schema. Это требует отдельной диагностики/решения; данный documentation-only PR runtime не меняет.
3. В `profiles.role` production разрешает только `owner|editor`; целевой `viewer` ещё не реализован.
4. `ai_models.created_by` и `content_items.created_by` nullable, поэтому они не подходят для строгого owner backfill без проверки каждой зависимости.
5. `content_items.model_id` nullable: orphan count нулевой считает только non-null invalid FK, но rows без model допустимы схемой и требуют отдельного решения при tenant/content backfill.
6. Production не имеет public triggers для автоматического `updated_at`; наличие defaults не означает автоматическое обновление timestamp после UPDATE.
7. `storage_path` format не подтверждён, поскольку значения не читались. План миграции должен классифицировать locators отдельным privacy-safe шагом.

## 11. Безопасный следующий порядок

Inventory не даёт разрешения сразу менять production. Следующий schema PR должен оставаться additive и начинаться только после backup/staging rehearsal:

1. Зафиксировать воспроизводимую baseline migration для существующих `profiles`, `ai_models`, `content_items`, их constraints и legacy policies без применения к production.
2. Отдельно решить расхождение `content_items.asset_url/review_comment` между runtime и production; не добавлять поля вслепую и не скрывать ошибки.
3. Создать tenant core (`workspaces`, `workspace_members`) и только nullable `owner_id` additions.
4. Seed одного внутреннего Atlas workspace и memberships для двух существующих profiles с явным owner/editor mapping.
5. Backfill `ai_models.owner_id` по проверенному membership; dependent content/jobs/references наследуют owner через parent model, а не через `created_by`.
6. Поместить ambiguous rows в отчёт, не удалять и не перепривязывать автоматически; отдельно разрешить duplicate primary/locator groups.
7. Добавить composite tenant constraints и indexes сначала без destructive cutover; validate, затем `NOT NULL`.
8. Провести two-owner negative RLS tests и только после них атомарно заменить broad policies.
9. В последующих PR добавить revisions/approval/idempotency/fingerprint и private Storage adapter в порядке `DATA_MODEL.md`.

Никакой шаг inventory не требует Modal GPU, OpenAI API или копирования Storage objects.

## 12. Решение по MVP

Фактический production inventory не расширяет MVP. Приоритет остаётся минимальным:

- воспроизводимый baseline;
- внутренний workspace + owner/helper membership;
- owner-scoped rows, constraints и RLS;
- устранение подтверждённого runtime/schema drift;
- затем revisions, manual approval, idempotency и private source Storage.

Нормализованный Character Brain, vector search, полная reference graph, публикационные adapters и analytics остаются отложенными согласно `DATA_MODEL.md`.
