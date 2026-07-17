# Atlas Production Migration History Reconciliation

Статус: **05 — проверяемый runbook, выполнение не разрешено**

Область: **05 — Backend и инфраструктура**

Дата: **2026-07-17**

## 1. Цель и границы

Этот документ описывает безопасный способ привести migration history существующего production Supabase Atlas в соответствие с repository chain:

1. `202607120600_core_schema_baseline.sql`;
2. `202607120700_avatar_generation.sql`;
3. `202607120800_character_scenes.sql`.

Цель reconciliation — зарегистрировать уже существующее эквивалентное состояние, **не исполняя DDL clean-only baseline и не повторяя DDL migrations `0700`/`0800`**.

Это не change ticket и не разрешение на production-действия. В рамках подготовки runbook:

- production не подключался и повторно не проверялся;
- `supabase link`, `db push`, `migration repair`, `db pull` и SQL-запись не выполнялись;
- migrations, policies, Storage, runtime, API и UI не изменялись;
- credentials, project ref, connection strings и backup-файлы не сохранялись;
- Modal GPU и OpenAI API не запускались.

## 2. Источники и версия инструмента

Repository source of truth на `main`:

- `PRODUCTION_SCHEMA_INVENTORY.md` — обезличенный read-only production snapshot от 2026-07-16;
- `BASELINE_SCHEMA.md` — происхождение и clean-only ограничения migration `0600`;
- migrations `0600`, `0700`, `0800`;
- `supabase/tests/database/atlas_schema.sql` — 16 pgTAP assertions;
- `.github/workflows/supabase-migrations.yml` — изолированный migration CI;
- `supabase/config.toml` — PostgreSQL 17 и local-only settings.

Для rehearsal и production change window должна использоваться та же закреплённая версия Supabase CLI `2.109.1`, которая прошла migration CI. Смена CLI или Supabase Postgres image требует нового rehearsal.

Официальная документация Supabase:

- [`migration list`](https://supabase.com/docs/reference/cli/supabase-migration-list) сравнивает local и remote history;
- [`migration repair`](https://supabase.com/docs/reference/cli/supabase-migration-repair) помечает version как `applied` вставкой history record или как `reverted` удалением record;
- [`db push --dry-run`](https://supabase.com/docs/reference/cli/supabase-db-push) показывает migrations, которые CLI считает pending, без их применения;
- [Database Backups](https://supabase.com/docs/guides/platform/backups) описывает доступные backup/restore варианты и downtime при restore;
- [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) отдельно предупреждает о сохранении migration history;
- [Restore to a new project](https://supabase.com/docs/guides/platform/clone-project) подходит для изолированного rehearsal, если plan проекта поддерживает эту функцию.

Официальная документация подтверждает механику CLI, но не подтверждает состояние Atlas production. Источником фактов Atlas остаются повторяемые catalog checks.

## 3. Подтверждённое состояние

### 3.1. Production snapshot

Read-only inventory от 2026-07-16 подтвердил:

- PostgreSQL `17.0.6`;
- пять Atlas tables: `profiles`, `ai_models`, `content_items`, `generation_jobs`, `model_references`;
- production columns, defaults, nullable, PK/FK/UNIQUE/CHECK constraints и legacy RLS policies;
- `generation_jobs.kind text not null default 'avatar'` с CHECK `avatar|scene`;
- public bucket `atlas-assets`, его metadata и две Storage policies;
- отсутствие `asset_url`, `review_comment`, `owner_id`, workspace и approval tables;
- отсутствие Atlas-specific public functions и triggers;
- нулевые агрегированные orphan/FK integrity counts в выполненном наборе проверок.

На момент снимка было 2 `profiles`, 43 `ai_models`, 3 `content_items`, 34 `generation_jobs`, 22 `model_references` и 90 Storage objects. Эти counts являются историческим снимком, а не ожидаемыми значениями для будущего change window.

### 3.2. Repository/local chain

Изолированный GitHub runner с Supabase CLI `2.109.1` и PostgreSQL major version 17:

1. создал чистую local Supabase database;
2. применил `0600 → 0700 → 0800` в filename order;
3. зарегистрировал ровно эти три versions в local `supabase_migrations.schema_migrations`;
4. успешно выполнил 16 pgTAP assertions по таблицам, ключевым columns, constraints, RLS, policy names, `generation_jobs.kind` и отсутствию будущих entities;
5. удалил local volumes после проверки.

Раздел 8 `BASELINE_SCHEMA.md` фиксирует более раннее ограничение среды PR #39, когда Docker не был доступен. Это историческое ограничение закрыто последующим Supabase migration CI из PR #40; сам clean-only запрет для production остаётся в силе.

### 3.3. Наблюдаемая эквивалентность

По сохранённому inventory конечная Atlas schema production совпадает с результатом repository chain для проверенных объектов. Это **state equivalence**, а не доказательство provenance:

- наличие объекта не доказывает, что его создал конкретный migration-файл;
- migrations могли выполняться вручную или через другой инструмент;
- timestamps и порядок production DDL неизвестны;
- migration history нельзя восстанавливать только по конечному состоянию без повторного preflight.


### 3.4. Diagnostic evidence 2026-07-17

Documentation-only task 05-I records the confirmed diagnostic evidence without adding workflows, SQL files, raw inventory, full GitHub Actions logs, credentials, UUIDs, emails, Storage paths, or user data. The temporary draft PR #43 that produced the diagnostic workflow was closed without merge, and the temporary workflow itself is intentionally not part of the repository.

Confirmed facts:

- GitHub Actions diagnostic run `29589401343` completed successfully.
- The clean chain `0600 → 0700 → 0800` was applied in an isolated Supabase/PostgreSQL 17 environment.
- Local migration history contained exactly these versions and no others:
  - `202607120600`;
  - `202607120700`;
  - `202607120800`.
- All 16 pgTAP checks passed.
- All eight production/local component hashes matched.
- The production/local overall hash matched: `667f8e50aa43b29e9accc2928b03aafa`.
- Three functions and four triggers were classified as Supabase Storage-managed objects, not Atlas-specific schema.
- Production was not connected to or changed during the diagnostic workflow.
- Schema equivalence between the production snapshot and the clean migration chain is confirmed for the compared manifests.

This evidence confirms schema equivalence only; it does not authorize production migration-history reconciliation. Production repair remains prohibited. The next gate is a separate rehearsal that bootstraps the missing migration history without connecting to production.


### 3.5. Isolated history-bootstrap rehearsal workflow

Issue #56 / draft PR #57 adds a repository workflow for the next gate without authorizing production access. The workflow `migration-history-rehearsal.yml` runs only in an ephemeral GitHub Actions/local Supabase runner with Supabase CLI `2.109.1`; it does not use `supabase link`, `--linked`, repository secrets, production credentials, remote database URLs, OpenAI API, Modal GPU, or social publishing.

The rehearsal script creates a disposable copy of `supabase/config.toml` and only migrations `0600 → 0700 → 0800`, starts local Supabase, removes only the local `supabase_migrations` schema to reproduce the missing-history pre-state, and then uses supported local CLI commands `supabase migration repair ... --status applied --local` for exactly:

- `202607120600`;
- `202607120700`;
- `202607120800`.

It records an Atlas schema manifest hash before and after repair and fails if the hash changes. After repair it copies `202607170900_tenant_foundation.sql` into the disposable migration directory and requires `supabase db push --local --dry-run` to show `202607170900` pending while `public.workspaces` and `public.workspace_members` remain absent. This proves the rehearsal does not apply `0900` and does not alter Atlas schema while bootstrapping history.

Confirmed GitHub Actions rehearsal run `29614156122` passed with Atlas schema hash `f6671afc61a6441dc0be4c793070a4e1e84f0ea5da3127f572ecfa1e88469bee` before and after repair. The resulting history contained exactly `202607120600`, `202607120700`, and `202607120800`; `202607170900` remained pending; production and Supabase Cloud were not connected.

Limitations: this is a local Supabase/PostgreSQL rehearsal, not a production or staging clone. It proves the supported CLI path and expected invariants in an isolated runner, but production reconciliation remains forbidden until all manual gates in this runbook are completed.

## 4. Что известно и не известно о production migration history

### Известно

- Проверенный production SQL завершался `42P01` для fully-qualified relation `supabase_migrations.schema_migrations`.
- В обезличенном inventory relation из schema `supabase_migrations` не зафиксирована.
- `storage.migrations` существует, но относится к Supabase Storage и **не является** CLI migration history Atlas.
- Конечная production schema содержит результаты, совместимые со всеми тремя repository migrations.

### Не подтверждено

- отсутствует ли schema `supabase_migrations` целиком или только `schema_migrations`;
- была ли history table когда-либо создана, удалена или находилась в другом состоянии;
- применялись ли `0700` и `0800` через Supabase CLI, SQL Editor, Dashboard или иной процесс;
- существуют ли скрытые/непрочитанные history records, доступные другой database role;
- создаст ли CLI `2.109.1` отсутствующую history table при `migration repair` или завершится ошибкой;
- как CLI отобразит production до rehearsal через `migration list`;
- не изменился ли production после снимка 2026-07-16.

Любой из этих неизвестных пунктов запрещает немедленный production repair.

## 5. Роли и ручные gates

| Gate | Ответственный | Разрешает |
| --- | --- | --- |
| G0 — runbook review | Координатор области 00 и владелец Atlas | Слияние documentation-only PR; production-доступ не разрешает |
| G1 — read-only preflight | Владелец Atlas вручную | Однократное read-only подключение/SQL inventory без содержимого строк |
| G2 — backup и staging cost | Владелец Atlas | Создание/использование backup или staging clone и связанные расходы |
| G3 — rehearsal sign-off | Область 05 и независимый reviewer | Признание rehearsal воспроизводимым; production repair ещё не разрешает |
| G4 — production change window | Владелец Atlas вручную непосредственно перед окном | Временный доступ operator и строго заданная последовательность repair |
| G5 — продолжение после каждой version | Operator области 05 + reviewer | Переход `0600 → 0700 → 0800` только после успешной проверки предыдущего шага |
| G6 — закрытие окна | Владелец Atlas | Принятие post-checks, отзыв временного доступа и переход к следующей migration task |

Один человек не должен одновременно быть operator и независимым reviewer. Credentials передаются вне repository и удаляются/отзываются после G6.

## 6. Read-only preflight перед reconciliation

Эти проверки выполняются только после G1. Они не выполнялись в рамках данного runbook PR.

### 6.1. History metadata

В одной read-only transaction без DDL:

1. проверить наличие schema через `pg_namespace`;
2. проверить `to_regclass('supabase_migrations.schema_migrations')`;
3. если relation существует — получить только column metadata, constraints/indexes и список migration versions/names без SQL contents;
4. проверить grants/owner metadata, необходимые для понимания результата `42P01`;
5. отдельно подтвердить отсутствие неожиданных Atlas migration versions.

Если relation отсутствует, это фиксируется как pre-state. Нельзя создавать её прямым SQL.

### 6.2. Повторный Atlas inventory

Повторить обезличенный inventory тем же read-only подходом:

- tables, columns, types, defaults и nullable;
- constraint definitions и indexes;
- RLS flags, policy names, commands, roles, `USING` и `WITH CHECK`;
- Atlas-related functions/triggers;
- bucket metadata и Storage policy metadata;
- row counts и агрегированные orphan/ownership checks;
- отсутствие будущих fields/tables.

Не извлекать email, Auth UUID, prompts, captions, URLs, Storage object names/paths или содержимое rows.

### 6.3. Version и operational checks

- подтвердить PostgreSQL major 17 и записать exact server version;
- зафиксировать commit SHA с неизменёнными `0600/0700/0800`;
- подтвердить CLI `2.109.1` checksum/version output;
- убедиться, что нет параллельного schema deployment;
- согласовать короткое окно остановки application writes для production repair;
- зафиксировать новый pre-change row-count snapshot после остановки writes.

## 7. Schema-equivalence contract

До и после rehearsal/production repair строятся три обезличенных canonical manifests.

### History Manifest — migration history

Включает детерминированно отсортированные:

- наличие или отсутствие schema `supabase_migrations`;
- наличие или отсутствие table `supabase_migrations.schema_migrations`;
- если table существует — columns, normalized types/defaults/nullable, constraints и indexes;
- migration versions и names без SQL contents.

Если preflight подтвердит отсутствие history table, её bootstrap поддерживаемым `migration repair` является ожидаемым изменением **только после успешного staging rehearsal и ручных gates G3/G4**. Rehearsal должен заранее подтвердить точную структуру создаваемой CLI table. Прямое создание или исправление history schema/table SQL-командами не допускается.

### Manifest A — Atlas schema

Включает детерминированно отсортированные:

- пять table names;
- все columns с normalized type, default и nullable;
- named constraints и index definitions;
- RLS enabled/forced flags;
- policy schema/table/name, command, roles и normalized expressions;
- Atlas-specific functions/triggers;
- `atlas-assets` bucket metadata и две Atlas Storage policies;
- список запрещённых future fields/tables, ожидаемо пустой.

### Manifest B — operational aggregates

Включает:

- row counts пяти Atlas tables и Storage objects;
- проверенные orphan/FK aggregate counts;
- число buckets и Atlas policies;
- duplicate/ambiguous ownership aggregates без locator values или user identifiers.

### Правило сравнения

- Manifest A до и после repair должен быть byte-equivalent после normalization.
- Manifest B должен быть идентичен при остановленных writes.
- History Manifest изменяется только по подтверждённому rehearsal-сценарию: при необходимости CLI создаёт history schema/table, затем versions последовательно становятся `0600`, `0600+0700`, `0600+0700+0800`.
- Если history table существовала до repair, её structure должна остаться идентичной; меняется только ожидаемый набор versions.
- Любое другое изменение означает STOP и rollback/incident review.

## 8. Staging/rehearsal

Rehearsal обязателен и выполняется только после G2.

1. Создать изолированный staging clone из максимально свежего production backup либо восстановить backup в новый проект. Не использовать live production как rehearsal.
2. Не сохранять backup, credentials или user data в repository/CI artifacts. Ограничить доступ и retention staging.
3. Подтвердить на staging History Manifest, Manifest A/B и исходное состояние migration history.
4. Если staging restore уже переносит history, отдельно воспроизвести сценарий production pre-state в disposable копии; не удалять history на единственном staging.
5. Закрепить CLI `2.109.1` и repository commit.
6. Выполнить кандидатный repair последовательно: `0600`, verify; `0700`, verify; `0800`, verify.
7. После каждого шага сравнить History Manifest, Manifest A/B и history versions.
8. После `0800` выполнить только dry-run pending-migration check: ожидается ноль migrations к применению.
9. Выполнить обычные Auth/runtime smoke checks без Modal GPU, OpenAI API и новых Storage uploads.
10. Проверить удаление history records в reverse order на отдельной disposable копии, зафиксировать оставшееся состояние history schema/table, затем повторить forward rehearsal. Это не считается полным возвратом к pre-state, если history table изначально отсутствовала.

Если `migration repair` не умеет создать отсутствующую history table на staging, rehearsal останавливается. Следующий шаг — официальный Supabase Support/документированный способ bootstrap history; прямой `CREATE SCHEMA/TABLE` или ручной `INSERT` не допускается.

## 9. Предлагаемый production порядок

Раздел является планом после успешных G1–G4, а не разрешением на выполнение.

### Phase 0 — freeze и контрольная точка

1. Остановить application writes и schema deployments.
2. Зафиксировать время, operator, reviewer, commit и CLI version.
3. Подтвердить restorable backup и его timestamp.
4. Снять pre-change History Manifest, Manifest A/B и history snapshot.
5. Повторить все stop criteria.

### Phase 1 — зарегистрировать `0600`

1. Пометить только version `202607120600` как applied через поддерживаемый CLI history repair.
2. Не исполнять содержимое migration `0600`.
3. Подтвердить history set `{202607120600}`.
4. Сравнить History Manifest и Manifest A/B с pre-change contract.
5. Reviewer даёт G5 для продолжения.

### Phase 2 — зарегистрировать `0700`

1. Пометить только version `202607120700` как applied.
2. Не исполнять DDL/policies/bucket insert migration `0700`.
3. Подтвердить history set `{202607120600, 202607120700}`.
4. Повторить History Manifest и Manifest A/B comparison.
5. Reviewer даёт G5 для продолжения.

### Phase 3 — зарегистрировать `0800`

1. Пометить только version `202607120800` как applied.
2. Не исполнять ALTER/policies migration `0800`.
3. Подтвердить history set `{202607120600, 202607120700, 202607120800}`.
4. Повторить History Manifest и Manifest A/B comparison.
5. Проверить, что dry-run не предлагает ни одну repository migration.

### Phase 4 — закрытие

1. Выполнить final read-only inventory и Auth/runtime smoke checks.
2. Возобновить writes только после review результатов.
3. Отозвать temporary credentials и удалить local link metadata/operator artifacts.
4. Сохранить только обезличенный change report: timestamps, versions, manifest hashes и результаты checks.
5. Владелец даёт G6.

## 10. Потенциальные команды — **ЗАПРЕЩЕНО ВЫПОЛНЯТЬ СЕЙЧАС**

Ниже приведён только будущий operator checklist. Placeholder нельзя заменять production-значениями до G4.

```bash
# ЗАПРЕЩЕНО СЕЙЧАС: создаёт связь local checkout с production.
supabase link --project-ref <PRODUCTION_PROJECT_REF>

# ЗАПРЕЩЕНО СЕЙЧАС: подключается к production history.
supabase migration list --linked

# ЗАПРЕЩЕНО СЕЙЧАС: записи history выполняются строго по одной и после G5.
supabase migration repair 202607120600 --status applied --linked
supabase migration repair 202607120700 --status applied --linked
supabase migration repair 202607120800 --status applied --linked

# ЗАПРЕЩЕНО СЕЙЧАС: допустимо только как post-repair dry-run после staging proof.
supabase db push --linked --dry-run
```

Всегда запрещены в рамках reconciliation:

```bash
# Могут исполнять DDL или разрушать remote state.
supabase db push --linked

# Может создать новый local migration и интерактивно обновить remote history.
supabase db pull
```

Также запрещено:

- запускать SQL-файлы `0600`, `0700`, `0800` в production SQL Editor;
- направлять на production любую команду, исполняющую migration SQL;
- создавать `supabase_migrations` schema/table прямым SQL;
- вручную выполнять `DROP TABLE` или `DROP SCHEMA` для migration history;
- делать `INSERT`, `UPDATE` или `DELETE` history records вручную;
- использовать `--include-all`, `--yes` или automation без межшаговых gates;
- печатать credentials/connection strings в shell history, logs или PR;
- выполнять repair из GitHub Actions.

## 11. Backup и rollback

### Backup gate

Перед G4 владелец и operator должны подтвердить:

- тип backup: daily/physical/PITR/manual logical согласно доступному plan;
- exact recovery point и что он предшествует change window;
- успешный restore rehearsal в отдельный проект;
- ожидаемые RPO/RTO и допустимый downtime;
- что database backup не содержит сами Storage object binaries и план восстановления учитывает это ограничение.

### History-record rollback

`migration repair --status reverted` удаляет зарегистрированные records, но не гарантирует удаление созданной history table или schema. Удаление records выполняется поддерживаемым CLI в reverse order и с теми же gates:

1. `0800`;
2. `0700`;
3. `0600`.

После каждого reverted record проверяются History Manifest и Manifest A/B. Эти команды также запрещены до отдельного решения владельца.

Если history table отсутствовала в pre-state, пустая table/schema после удаления records означает, что исходное состояние восстановлено не полностью. Ручной `DROP TABLE`/`DROP SCHEMA` запрещён. Возврат к отсутствующей table выполняется только через согласованный с Supabase Support способ либо восстановление проверенного backup по отдельному решению владельца. До такого решения состояние обозначается как частично reconciled/rolled back, а не как pre-state.

### Restore rollback

Если обнаружено любое изменение Atlas schema/data, history-only rollback недостаточен:

- остановить writes;
- не выполнять ad-hoc исправления;
- сохранить обезличенные diagnostics;
- привлечь Supabase Support;
- по решению владельца восстановить проверенный backup/PITR с учётом downtime и RPO.

## 12. Критерии немедленной остановки

STOP до первой записи, если:

- backup не подтверждён или restore rehearsal не прошёл;
- production Manifest A отличается от ожидаемого chain;
- history содержит неизвестные versions или противоречит preflight;
- отсутствующая history table не была безопасно воспроизведена на staging;
- CLI/PostgreSQL version отличается от rehearsal;
- migrations изменились после зафиксированного commit;
- нельзя остановить concurrent writes/schema deployments;
- operator и reviewer не назначены или нет G4.

STOP между versions, если:

- history set не равен ожидаемому промежуточному set;
- Manifest A изменился хотя бы в одном Atlas/Storage metadata field;
- Manifest B изменился при frozen writes;
- CLI предлагает исполнить migration вместо history-only repair;
- возникает prompt, ошибка permission/lock/network, timeout или неожиданный SQL;
- dry-run после `0800` показывает pending migration.

После STOP нельзя «дожимать» оставшиеся versions. Сначала удалить только безопасно подтверждённые history records, зафиксировать фактическое состояние, оформить incident note и получить новое ручное решение. Полный возврат к pre-state нельзя заявлять, если изначально отсутствовавшая history table осталась после repair.

## 13. Критерии успешного завершения

Reconciliation считается завершённой только когда:

- `supabase_migrations.schema_migrations` существует, её structure соответствует успешно rehearsed CLI bootstrap и она содержит ровно `202607120600`, `202607120700`, `202607120800` в ожидаемом порядке;
- Atlas Manifest A до/после идентичен;
- operational aggregates не изменились при frozen writes;
- pending-migration dry-run пуст;
- Auth/runtime smoke checks успешны;
- temporary access отозван;
- владелец Atlas дал G6;
- обезличенный отчёт сохранён, а production secrets и row contents — нет.

Только после этого можно создавать отдельную additive migration для nullable `asset_url`/`review_comment`. Owner/workspace, RLS cutover, revisions и approval остаются отдельными последующими задачами.
