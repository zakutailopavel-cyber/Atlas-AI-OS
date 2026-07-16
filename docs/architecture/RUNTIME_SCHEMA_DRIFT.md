# Atlas Runtime / Schema Drift — `content_items`

Статус: **05 — decision record, documentation only**

Область: **05 — Backend и инфраструктура**

Дата: **2026-07-16**

Этот документ фиксирует расхождение между текущим runtime-контрактом `content_items` и фактической production-схемой. Он не добавляет колонки, не меняет production, migrations, RLS, Storage, runtime, API, Modal или интерфейс.

## 1. Решение

1. `asset_url` и `review_comment` считаются **nullable legacy bridge-полями**, которые ожидает текущий клиент, но которых ещё нет в production.
2. Их будущее добавление допускается только отдельной additive migration после появления воспроизводимого baseline для существующей схемы `content_items`.
3. `review_comment` — простой legacy editor note. Он не является подтверждённым approval, не фиксирует actor/revision/payload hash и не разрешает публикацию.
4. `asset_url` — legacy locator для текущего предпросмотра. Он не является Storage identity, asset lineage, подтверждением прав, approval или доказательством публикации.
5. До migration runtime не может считать сохранение этих полей успешным. Текущий UI не проверяет Supabase error и поэтому создаёт ложное впечатление успеха.

## 2. Проверенные источники

Анализ выполнен по `main` на commit `37d4735` после слияния production inventory. Открытых PR на момент начала работы не было.

Проверены:

- `docs/PROJECT_STATE.md`;
- `docs/architecture/DATA_MODEL.md`;
- `docs/architecture/PRODUCTION_SCHEMA_INVENTORY.md`;
- `docs/architecture/CONTENT_PIPELINE.md`;
- все обращения runtime к `content_items` в `src`;
- отдельно полный lifecycle `asset_url` и `review_comment` в `src/app/dashboard.tsx`.

Production повторно не опрашивался. Источник физического состояния — уже проверенный `PRODUCTION_SCHEMA_INVENTORY.md`.

## 3. Фактическое расхождение

Production `public.content_items` содержит:

```text
id, model_id, title, platform, format, status, caption,
visual_prompt, shot_list, publish_at, created_by, created_at, updated_at
```

Production не содержит `asset_url` и `review_comment`.

Клиентский TypeScript type `Item` при этом объявляет оба поля optional:

```ts
asset_url?: string | null;
review_comment?: string | null;
```

`select('*')` не запрашивает отсутствующие колонки по имени и возвращает существующие поля. Поэтому загрузка списка `content_items` продолжает работать, а оба bridge-поля оказываются `undefined` в клиентском объекте. Ошибка проявляется только когда runtime отправляет отсутствующую колонку в UPDATE с фактическим значением.

## 4. Lifecycle `asset_url`

### 4.1. Где записывается

Есть два write-path.

#### A. Окно публикации → «Материалы»

Пользователь:

1. открывает строку в «Контент-студии»;
2. переходит на вкладку «Материалы»;
3. вводит «Ссылку на готовое изображение»;
4. нажимает «Сохранить изменения».

`PublicationDialog` меняет только локальный `draft.asset_url`. Затем `updateItem()` отправляет его в:

```text
UPDATE content_items SET ..., asset_url = <value>, review_comment = <value>
```

#### B. Студия сцен → «Сохранить и прикрепить»

Пользователь выбирает публикацию и готовую scene output, после чего runtime последовательно:

1. сохраняет URL как `model_references.storage_path`, если такого locator ещё нет в локально загруженной библиотеке;
2. вызывает `attach(itemId, url)`;
3. выполняет UPDATE `content_items.asset_url`;
4. перезагружает данные.

Первый шаг и второй UPDATE — независимые Supabase requests. Поэтому reference может успешно попасть в библиотеку, даже если attach к `content_items` не выполнен.

### 4.2. Где читается

`asset_url` читается только клиентским dashboard:

- на главной странице в блоке ближайшей публикации: truthy value показывает «Визуал прикреплён — Готово»;
- в `PublicationDialog` на вкладке «Предпросмотр»: truthy value используется как `<img src>`;
- в `PublicationDialog` на вкладке «Материалы»: value заполняет input для ручного редактирования.

Server API `/api/generate`, `/api/plan-week` и `/api/avatar` не читают `content_items.asset_url`. Автоматическая публикация, provider receipt и analytics также отсутствуют.

### 4.3. Какие действия зависят от поля

- визуальный индикатор готовности ближайшей публикации;
- социальный предпросмотр изображения;
- ручное связывание URL с публикацией;
- попытка прикрепить созданную сцену к выбранному content item.

Статусы `ready` и `published` от `asset_url` не зависят. Пользователь может выбрать их без прикреплённого изображения. Поле не является approval gate или publication gate.

### 4.4. Что происходит сейчас при ошибке

`attach()` игнорирует возвращаемый Supabase `error`, после чего вызывает `load()`. Пользователь не получает error message или подтверждение фактической записи. После перезагрузки `asset_url` снова отсутствует, но scene reference мог уже сохраниться отдельным первым запросом.

`updateItem()` также не проверяет `{ error }`. Если `asset_url` с введённым значением попал в request, PostgREST отклоняет UPDATE из-за неизвестной колонки. Такой request не сохраняет и остальные переданные изменения (`title`, `caption`, `visual_prompt`, `status`, `publish_at`, `review_comment`). Несмотря на это, runtime закрывает окно через `setSelectedItem(null)` и вызывает `load()` без уведомления.

Если optional bridge-поле остаётся `undefined`, сериализация request может не включить его; тогда изменение только существующих полей способно пройти. Это не делает сохранение `asset_url` работоспособным.

## 5. Lifecycle `review_comment`

### 5.1. Где записывается

Единственный write-path:

1. пользователь открывает публикацию;
2. переходит на вкладку «Согласование»;
3. вводит «Комментарий редактора»;
4. нажимает «Сохранить изменения»;
5. `updateItem()` пытается записать `review_comment` вместе с другими mutable полями.

Кнопки «Вернуть на проверку» и «Согласовать» изменяют только локальный `draft.status`. Они не создают approval record и не сохраняют комментарий отдельной операцией.

### 5.2. Где читается

`review_comment` читается только в textarea того же `PublicationDialog`. Оно не отображается:

- в списке контента;
- на главной странице;
- в календаре;
- в server API;
- в Modal worker;
- в какой-либо approval history.

### 5.3. Какие действия зависят от поля

Ни один status transition технически не зависит от комментария. `draft`, `review`, `ready` и `published` выбираются независимо. Комментарий — необязательная заметка для текущей командной работы и не является условием согласования.

### 5.4. Что происходит сейчас при ошибке

При введённом `review_comment` `updateItem()` отправляет отсутствующую колонку, игнорирует Supabase error, закрывает окно и перезагружает данные. Весь UPDATE request не сохраняется, включая status и другие изменения из того же нажатия. Пользователь не видит причину и может ошибочно считать комментарий и решение сохранёнными.

## 6. Текущий пользовательский риск

| Действие | Что видит пользователь | Фактический результат до migration |
| --- | --- | --- |
| Ввести image URL и сохранить | Окно закрывается | UPDATE с `asset_url` неуспешен; URL не сохранён |
| Ввести review comment и сохранить | Окно закрывается | UPDATE с `review_comment` неуспешен; comment не сохранён |
| Вместе изменить status и bridge-поле | Окно закрывается | Весь UPDATE request отклонён; status также может не сохраниться |
| Сохранить scene и прикрепить | Нет сообщения об ошибке | `model_references` может сохраниться, `content_items.asset_url` — нет |
| Выбрать `ready` без комментария/asset | UI показывает согласование | Сохраняется только legacy status; это не approval |
| Выбрать `published` | UI показывает опубликованный status | Нет provider dispatch или publication receipt |

Следовательно, до migration UI-событие «нажата кнопка» или закрытие окна нельзя трактовать как подтверждение сохранения bridge-поля.

## 7. Нужны ли поля текущему MVP

### `asset_url`

Поле нужно как минимальный nullable bridge для уже существующих сценариев предпросмотра и scene-to-content attach до внедрения нормализованных assets/revisions. Но оно не должно становиться канонической Storage identity:

- это произвольный text locator без bucket/path decomposition;
- нет content hash, lineage, rights metadata или FK на reference/asset;
- наличие URL не доказывает доступность объекта;
- наличие URL не означает approval, schedule или publication.

### `review_comment`

Поле не является обязательным для текущих status transitions и не заменяет целевой `content_approvals`. Оно допустимо как nullable legacy bridge, чтобы сохранить текущую редакторскую заметку до перехода на revisions/reviews. Пустой comment не блокирует MVP, а заполненный comment не подтверждает approval.

Итого: оба поля входят только в compatibility surface текущего MVP. Они не расширяют доверенную модель данных и не должны использоваться для новых server-side инвариантов.

## 8. Порядок будущего исправления

### Шаг 1. Воспроизводимый baseline

Сначала отдельный schema PR должен зафиксировать фактическую существующую DDL `profiles`, `ai_models`, `content_items`, constraints и legacy RLS без изменения production. Нельзя строить additive migration поверх неполного baseline и затем считать новую среду воспроизводимой.

### Шаг 2. Отдельная additive migration bridge-полей

После проверки baseline отдельная reversible migration может добавить:

```text
content_items.asset_url text null
content_items.review_comment text null
```

Требования:

- без default и без `NOT NULL`;
- без эвристического backfill из `model_references` или статусов;
- preflight подтверждает отсутствие колонок и сохраняет row counts;
- migration не меняет status, approval, Storage bucket или существующие rows;
- rollback описан, но не должен удалять уже записанные пользовательские значения без отдельного решения.

### Шаг 3. Runtime error handling отдельным PR

Runtime должен считать операцию успешной только при `error == null` и подтверждённом ответе Supabase. При ошибке окно остаётся открытым, пользователь получает понятное сообщение, а частичный workflow «reference сохранён, attach не выполнен» показывается явно.

Этот шаг не реализуется данным documentation-only PR.

### Шаг 4. Переход к целевой модели

- `asset_url` заменяется связью с versioned asset/reference и immutable content revision; legacy locator сохраняется только для read compatibility до cutover.
- `review_comment` переносится в versioned review/history, если такой сценарий остаётся нужен.
- Approval создаётся отдельной доверенной операцией для точной immutable revision и payload hash.
- Publication подтверждается provider attempt/receipt, а не status или URL.

## 9. Инварианты до и после migration

- До появления колонок нельзя сообщать, что `asset_url` или `review_comment` сохранены.
- Нельзя выводить approval из `review_comment`, `status = ready` или закрытия модального окна.
- Нельзя выводить publication из `asset_url`, `status = published` или `publish_at`.
- `asset_url` не используется как Storage object identity, cache key или доказательство прав.
- Additive bridge migration не должна запускать OpenAI или Modal GPU.
- Revisions/approval cutover выполняется отдельными PR после baseline и tenant boundary.
