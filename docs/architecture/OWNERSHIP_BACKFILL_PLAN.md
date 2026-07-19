# Atlas Ownership Backfill Plan

Статус: **05-K — documentation-only plan; backfill не разрешён и не выполнялся**

Область: **05 — Backend и инфраструктура**

## 1. Цель и границы

Этот runbook определяет безопасный будущий порядок заполнения nullable `owner_id` в `ai_models`, `content_items`, `generation_jobs` и `model_references`. Он не является migration, SQL-скриптом или разрешением на production-запись.

План начинается только после отдельного подтверждения фактической схемы целевой среды, наличия `workspaces` и nullable bridge-полей, успешного rehearsal, доступного проверенного backup/restore и ручного разрешения владельца. Текущий production inventory — исторический read-only снимок 2026-07-16 до tenant migrations; он не доказывает, что migrations `0900` и `1000` применены в production.

В рамках 05-K не выполняются production/Supabase Cloud, SQL, migrations, backfill, RLS cutover, runtime/API/UI, OpenAI или Modal. В GitHub нельзя сохранять пользовательские UUID, email, названия/содержимое пользовательских строк или Storage paths.

## 2. Источники истины

Для будущего backfill действуют следующие правила:

1. `owner_id` — identity workspace и ссылается на `workspaces.id`.
2. Владелец вручную назначает ровно один workspace каждой `ai_models` row.
3. `content_items.owner_id` наследуется только от связанной `ai_models.owner_id`.
4. `generation_jobs.owner_id` наследуется только от связанной `ai_models.owner_id`.
5. `model_references.owner_id` наследуется только от связанной `ai_models.owner_id`.
6. `created_by` остаётся actor/audit identity: оно не предлагается как owner, не используется как fallback и никогда автоматически не копируется в `owner_id`.
7. Уже заполненный `owner_id` не перезаписывается пакетным backfill. Любое расхождение отправляется на ручное расследование.

Это правило намеренно строже старой формулировки DATA_MODEL о возможном backfill моделей по `created_by`: для 05-K авторитетным является только явное ручное решение владельца по каждой модели.

## 3. Ручной Model Ownership Manifest

До любых записей уполномоченный оператор формирует закрытый Model Ownership Manifest вне GitHub и публичных CI artifacts. Для каждой модели владелец выбирает один существующий активный workspace либо решение `quarantine`.

Manifest должен содержать в защищённой операционной среде:

- стабильный идентификатор строки модели и выбранного workspace;
- решение владельца и reason code;
- время, автора решения и вторую ручную проверку;
- версию manifest и криптографический hash всего файла;
- ожидаемое количество назначений и quarantine-строк.

В репозиторий и обычные логи разрешено переносить только version/hash, общие counts и reason-code counts. UUID, email, model names, prompts и иное содержимое строк не публикуются.

Допустимые reason codes:

- `assigned_by_owner` — владелец однозначно выбрал workspace;
- `missing_parent_model` — дочерняя строка не имеет существующей parent model;
- `model_not_mapped` — для parent model ещё нет ручного решения;
- `multiple_workspace_candidates` — владелец не подтвердил единственный workspace;
- `existing_owner_conflict` — уже заполненное значение расходится с manifest или parent;
- `inactive_or_missing_workspace` — выбранный workspace нельзя использовать;
- `concurrent_change` — строка изменилась после preflight/watermark;
- `other_manual_review` — требуется отдельное решение владельца.

Любая неоднозначность означает quarantine, а не угадывание. Quarantine не удаляет и не изменяет пользовательскую строку.

## 4. Counts-only preflight

Preflight выполняется отдельной будущей read-only проверкой сначала на rehearsal/staging, затем — только после нового разрешения — в production. Результат содержит только counts, reason codes, hashes и schema metadata.

Обязательные агрегаты:

| Группа | Counts-only проверка |
| --- | --- |
| Schema readiness | Наличие четырёх таблиц и nullable `owner_id`; наличие FK на `workspaces`; отсутствие NOT NULL/RLS cutover в этом этапе |
| Workspace readiness | Количество active workspaces и количество manifest assignments к существующему active workspace |
| Models | Всего; `owner_id IS NULL`; уже заполнено; совпадает с manifest; конфликтует; без решения; неоднозначно |
| Content | Всего; с/без parent model; parent mapped/quarantined; owner null; owner отличается от parent |
| Jobs | Всего; с/без parent model; parent mapped/quarantined; owner null; owner отличается от parent |
| References | Всего; с/без parent model; parent mapped/quarantined; owner null; owner отличается от parent |
| Actor preservation | Counts nullable/non-null `created_by` и агрегированный hash actor-полей до операции |
| Mutation scope | Ожидаемое число обновлений для каждой таблицы и число quarantine по reason code |

Preflight не возвращает UUID, email, названия моделей, prompts, captions, URL, object names/paths или содержимое JSON/строк. Mismatch автора дочерней строки и автора модели может быть нормальной работой помощника и не влияет на выбор workspace.

## 5. Порядок будущих batches

Каждый batch имеет собственные manifest version/hash, preflight evidence, ожидаемый count и rollback manifest. Между batches повторяются counts и invariants.

1. **Freeze/watermark.** Остановить конкурирующие domain writes либо зафиксировать согласованный watermark и механизм повторной классификации новых строк. Без этого gate backfill не начинается.
2. **Batch A — `ai_models`.** Заполнить только строки с null `owner_id`, для которых владелец вручную подтвердил один active workspace. Неизвестные и конфликтующие модели остаются null и попадают в quarantine counts.
3. **Verify A.** Подтвердить соответствие Model Ownership Manifest, неизменность `created_by` и отсутствие перезаписанных owner values.
4. **Batch B — `content_items`.** Заполнить null `owner_id` только значением подтверждённой parent `ai_models.owner_id`. Строки без parent, с quarantined parent или конфликтующим существующим owner не обновлять.
5. **Verify B.** Для каждой обновлённой строки owner равен owner parent model; counts таблицы и не-owner hashes неизменны.
6. **Batch C — `generation_jobs`.** Применить те же правила наследования только через parent `ai_models`; `created_by` задания не участвует.
7. **Verify C.** Проверить parent equality, quarantine и actor preservation.
8. **Batch D — `model_references`.** Применить те же правила наследования только через parent `ai_models`; ни `created_by`, ни связанный generation job не являются источником owner.
9. **Verify D.** Дополнительно считать, но не исправлять в этом этапе, orphan job links, model/job mismatch, duplicate locators и multiple-primary groups.
10. **Delta pass.** Повторить counts для строк после watermark. Новые/изменённые строки проходят тот же manifest и quarantine процесс, а не автоматический fallback.

Размер batch выбирается на rehearsal по времени блокировок и rollback window. Начинать следует с малого canary batch; увеличение допускается только после успешной сверки invariants. Точные размеры и команды утверждаются отдельным execution runbook.

## 6. Invariants и критерии остановки

После каждого batch обязательны все invariants:

- количество строк каждой таблицы не изменилось;
- primary keys, foreign keys и legacy relation counts не изменились;
- `created_by` и все не-owner поля не изменились по counts/hash;
- изменялись только null `owner_id`, перечисленные в утверждённом manifest;
- ни один уже заполненный `owner_id` не перезаписан;
- каждый non-null owner ссылается на существующий разрешённый workspace;
- для content/jobs/references `child.owner_id = parent ai_model.owner_id`;
- orphan, ambiguous и conflict rows остались неизменными и отражены в quarantine counts;
- фактическое число изменений равно ожидаемому числу manifest;
- повтор того же batch является no-op;
- legacy RLS policies не изменены.

Остановить процесс немедленно при любом count/hash mismatch, неожиданном non-null owner, parent-owner mismatch, FK error, изменении actor/non-owner данных, concurrent delta вне согласованного окна, отсутствии backup/restore или невозможности объяснить хотя бы одну обновлённую строку manifest-решением.

## 7. Quarantine и отчёт

Quarantine report содержит только:

- manifest version/hash и batch identifier;
- таблицу как техническое имя;
- reason code;
- count до/после;
- статус `blocked`, `resolved` или `carried_forward`;
- агрегированный hash закрытого набора строк для доказательства стабильности.

Сами row IDs и пользовательские данные хранятся только в защищённом restricted artifact, доступном владельцу и назначенному оператору. Они не попадают в GitHub, PR, CI logs или общий чат. Разрешение quarantine всегда является новым ручным решением владельца и новой версией manifest.

## 8. Rollback

До записи для каждого batch создаётся проверенный backup/restore point и закрытый rollback manifest с исходным owner-состоянием и hash. На текущем Supabase Free Plan отсутствие доступного backup/PITR остаётся блокером production execution.

Rollback ограничивается строками конкретного batch и допускается только если их текущее состояние всё ещё совпадает с записанным post-batch manifest. Он восстанавливает прежнее значение `owner_id` и не затрагивает `created_by` или другие поля. Если после batch строка изменилась, автоматический rollback запрещён: процесс останавливается, строка quarantined, дальнейшее решение принимает владелец совместно с оператором восстановления.

После rollback повторяются все preflight counts/hashes. Полным возвратом считается только совпадение с pre-batch manifest и подтверждённый restore evidence; простое уменьшение числа non-null owners недостаточно.

## 9. Ручные gates и ответственность

| Gate | Требование | Ручное разрешение |
| --- | --- | --- |
| G0 — schema | Фактическая целевая схема подтверждена read-only; migrations/history reconciliation решены отдельно | Владелец + область 05 |
| G1 — workspace | Workspaces/memberships проверены; владелец завершил Model Ownership Manifest | Владелец Atlas |
| G2 — rehearsal | Полная копия/rehearsal прошла с теми же counts/invariants и rollback test | Область 05, затем владелец |
| G3 — recovery | Доступен проверенный backup/PITR и назначен rollback operator | Владелец + оператор Supabase |
| G4 — canary | Counts-only preflight совпал с manifest; freeze/watermark активен | Владелец непосредственно перед записью |
| G5 — batches | Каждый следующий batch разрешается только после evidence предыдущего | Владелец + область 05 |
| G6 — acceptance | Финальные invariants и quarantine report приняты | Владелец Atlas |

Отсутствие любого gate означает запрет на execution. Этот документ сам по себе не открывает ни один gate.

## 10. Явно отложено

Не входят в ownership backfill и требуют отдельных будущих задач/PR:

- `owner_id NOT NULL`;
- composite unique/FK tenant integrity;
- owner-scoped RLS policies, shadow/canary и удаление legacy broad policies;
- runtime/API/UI tenant context и write enforcement;
- revisions, approval, idempotency, cache fingerprint и Storage cutover;
- устранение duplicate reference locators или multiple-primary references;
- production migration-history reconciliation.

Следующий безопасный шаг после принятия плана — подготовить отдельный counts-only read-only preflight specification и rehearsal dataset без production-подключения. Никакой backfill до прохождения G0–G4 не разрешён.
