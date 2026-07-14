# UI Modules — план декомпозиции интерфейса

Статус: **04-A, контракт v1.0 (documentation only)**

Область: **04 — Интерфейс Atlas**

Дата: **2026-07-14**

Этот документ задаёт целевые границы интерфейсных модулей и безопасный порядок разбиения `src/app/dashboard.tsx`. Он не меняет текущий дизайн, runtime, Supabase-схему, API, Modal, маршруты или CSS. Имена каталогов и TypeScript-интерфейсов являются контрактом для будущих узких PR, а не описанием уже работающей структуры.

## 1. Цели и ограничения

Декомпозиция должна:

- сохранить текущую русскую терминологию, DOM-структуру, классы, размеры, цвета и responsive breakpoints;
- отделить shell приложения от feature-модулей и бизнес-действий;
- дать областям 01–04 независимые файлы вместо совместного редактирования `dashboard.tsx`;
- представить статусы контента, материала/render и публикации как три разных состояния;
- сделать ручное подтверждение отдельным auditable действием, а не значением обычного dropdown;
- свести одинаковые действия к одной команде при сохранении нескольких понятных entry points;
- не переносить Supabase-запросы и API-вызовы во время первого механического разбиения;
- позволять проверять каждый этап через `npm ci`, `npm run build` и визуальное сравнение без OpenAI и GPU.

Вне scope этого контракта:

- редизайн экранов и карточек;
- изменение URL-маршрутизации;
- реализация новых статусов, миграций, RLS или server actions;
- изменение payload OpenAI/Modal и запуск генераций;
- выбор новой библиотеки компонентов или state manager.

## 2. Фактическое состояние `main`

На снимке `01946f9` файл `src/app/dashboard.tsx` содержит 1332 строки и объединяет:

- создание Supabase client и загрузку `ai_models`, `content_items`, `profiles`, `model_references`;
- root state текущей страницы и всех открытых modal;
- client-side insert/update для моделей, контента, статусов и материалов;
- Dashboard/Home, AI-модели, Character Brain, Studio, Calendar, Team и Settings;
- портреты, Scene Studio, attach в публикацию, polling и retry render jobs;
- одиночную и недельную OpenAI-генерацию;
- preview, редактирование и согласование публикации;
- общий `Modal` и `Empty`.

CSS уже тематически разделён, но все файлы импортируются глобально через `layout.tsx`, большинство из них записано одной длинной строкой, а selectors опираются на общие классы. Текущие responsive границы: `1050px`, `800px`, `720px` и `650px`.

Текущий UI не соответствует целевым lifecycle-контрактам полностью:

- status dropdown позволяет напрямую выбрать `published`;
- `publish_at` одновременно используется как suggestion и подтверждённое расписание;
- transport status `generation_jobs` показывается как итоговая готовность материала;
- ручной URL и attach результата сцены являются разными путями прикрепления визуала;
- approval не хранит revision/hash и меняется вместе с обычным update публикации.

Первый этап декомпозиции обязан сохранить это legacy-поведение без расширения. Исправление lifecycle выполняется отдельными PR после появления backend-контрактов.

## 3. Целевая структура

```text
src/
  app/
    page.tsx
    dashboard.tsx                 # временный совместимый facade, затем удаляется
    atlas-app.tsx                 # композиция shell, providers и feature routes
  components/
    ui/
      modal/
        Modal.tsx
        ModalHost.tsx
        modal.types.ts
      navigation/
        DesktopNavigation.tsx
        CompactNavigation.tsx
      StatusBadge.tsx
      StatusStack.tsx
      EmptyState.tsx
      ImageLightbox.tsx
  features/
    dashboard/
      ui/HomeDashboard.tsx
      model/dashboard.view-model.ts
    ai-models/
      ui/AiModelsPage.tsx
      ui/ModelCard.tsx
      model/ai-model.types.ts
    character-brain/
      ui/CharacterBrainDialog.tsx
      ui/IdentityFields.tsx
      ui/VisualIdentityFields.tsx
      ui/MemoryFields.tsx
      model/character-brain.types.ts
      model/legacy-character.adapter.ts
    scene-studio/
      ui/SceneStudioDialog.tsx
      ui/RenderJobList.tsx
      ui/RenderResultCard.tsx
      model/scene-studio.types.ts
      api/scene-studio.client.ts
    reference-library/
      ui/ReferenceLibraryPanel.tsx
      ui/ReferencePickerDialog.tsx
      ui/ReferenceCard.tsx
      model/reference-library.types.ts
    content-factory/
      ui/ContentFactoryPage.tsx
      ui/ContentList.tsx
      ui/CreateContentDialog.tsx
      ui/WeekPlannerDialog.tsx
      ui/PublicationDialog.tsx
      ui/ApprovalPanel.tsx
      model/content.types.ts
      model/content-status.ts
      api/content.client.ts
    calendar/
      ui/CalendarPage.tsx
      ui/CalendarEntry.tsx
      model/calendar.types.ts
    team/ui/TeamPage.tsx
    settings/ui/SettingsPage.tsx
  shared/
    atlas.types.ts
    atlas-actions.ts
    modal-state.ts
    status-presenters.ts
```

Правила зависимости:

1. `app` собирает feature-модули, но feature-модули не импортируют `app`.
2. `components/ui` не знает Supabase, OpenAI, Modal GPU или Atlas lifecycle.
3. Feature UI получает read models и callbacks через props; прямые Supabase-вызовы после последнего этапа остаются в feature client/controller, а не в presentational components.
4. Область 03 может зависеть от публичных summary/ref типов областей 01 и 02, но не от их UI.
5. Общие типы не должны превращаться в новый монолит: feature-specific type остаётся внутри feature.
6. CSS сначала остаётся в существующих глобальных файлах и переносится только отдельными механическими PR после стабилизации компонентов.

## 4. Shell и граница Dashboard

`AtlasApp`/`Dashboard` отвечает только за:

- получение уже авторизованного `UserSummary`;
- создание общего data/controller слоя на время перехода;
- выбор активного top-level view;
- layout: navigation, header, content viewport;
- регистрацию единого набора команд и `ModalHost`;
- передачу read models и actions в feature entry components.

Dashboard не должен:

- содержать поля форм Character Brain или контента;
- рисовать карточки моделей, render jobs, публикации или календарь;
- самостоятельно определять допустимые status transitions;
- собирать OpenAI/Modal payload;
- выполнять feature-specific insert/update после завершения миграции controllers.

```ts
type AtlasSection =
  | "home"
  | "ai_models"
  | "content_factory"
  | "calendar"
  | "team"
  | "settings";

type AtlasAppProps = {
  user: UserSummary;
  initialSection?: AtlasSection;
};
```

`HomeDashboard` является обзором, а не вторым местом редактирования. Его CTA вызывают общие команды `openCreateContent`, `openAiModels` и `openCalendar`; он не реализует собственные save/status actions.

## 5. Границы feature-модулей

### 5.1. AI-модели

Отвечает за список и summary персонажей:

- карточки, avatar, name, handle, niche и activation status;
- создание новой записи и открытие существующей;
- переход в Character Brain или Scene Studio через общие actions.

Не редактирует память, не запускает render и не хранит поля публикации.

```ts
type AiModelsPageProps = {
  models: AiModelSummary[];
  loading: boolean;
  onCreate: () => void;
  onOpenCharacter: (characterId: string) => void;
  onOpenSceneStudio: (characterId?: string) => void;
};
```

### 5.2. Character Brain

Отвечает за отображение и ручное редактирование контракта `CharacterBrainV1`:

- identity, audience и voice;
- immutable facts и forbidden topics;
- visual identity, seed, primary reference summary;
- versioned memory и storyline;
- readiness/validation перед `draft -> active`.

Не создаёт сцены, контент-пакеты и расписание. Эталонный портрет выбирается через ссылку/команду области 02, а Character Brain получает только reference summary.

```ts
type CharacterBrainDialogProps = {
  mode: "create" | "edit";
  character: CharacterBrainEditorData;
  validation: CharacterValidationSummary;
  saving: boolean;
  onSave: (draft: CharacterBrainDraft) => Promise<void>;
  onChoosePrimaryReference: (characterId: string) => void;
  onClose: () => void;
};
```

До появления `CharacterBrainV1` в runtime `legacy-character.adapter.ts` формирует editor data из плоского `visual_passport`; UI не должен знать обе схемы одновременно.

### 5.3. Scene Studio

Отвечает за создание портрета/сцены и наблюдение за render request:

- character/reference context summary;
- prompt/constraints, framing, style и refine source;
- cache/preflight/cost summary, когда backend их предоставит;
- transport progress, QA decision и render results;
- retry того же logical request и явное создание нового variant.

Не меняет `content_items` напрямую. Связь принятого output с публикацией выполняется командой Content Factory через Reference Picker/Asset Picker.

```ts
type SceneStudioDialogProps = {
  characters: CharacterOption[];
  initialCharacterId?: string;
  request: SceneRequestDraft;
  jobs: RenderJobView[];
  cost?: CostEstimate;
  onChangeRequest: (patch: Partial<SceneRequestDraft>) => void;
  onSubmit: (request: SceneRequestDraft) => Promise<void>;
  onRetry: (renderRequestId: string) => Promise<void>;
  onCreateVariant: (renderRequestId: string) => Promise<void>;
  onAcceptOutput: (outputId: string) => Promise<void>;
  onOpenReferenceLibrary: () => void;
  onClose: () => void;
};
```

### 5.4. Reference Library

Отвечает за поиск и выбор versioned reference/output:

- search query, filters, tags и ranking explanation;
- preview, source/license/attribution и allowed change summary;
- lineage, rights/availability, QA и usage summary;
- выбор допустимого reference или accepted publish asset.

Не запускает GPU скрыто, не меняет Character Brain и не назначает публикацию.

```ts
type ReferenceLibraryPanelProps = {
  query: ReferenceQueryView;
  results: ReferenceCardView[];
  selectedId: string | null;
  mode: "browse" | "select_scene_reference" | "select_publish_asset";
  onQueryChange: (query: ReferenceQueryView) => void;
  onSelect: (referenceVersionId: string) => void;
  onConfirm: () => Promise<void>;
  onClose?: () => void;
};
```

`restricted`, неизвестная лицензия или несовместимые change regions блокируют confirm и показывают причину, а не скрывают карточку без объяснения.

### 5.5. Content Factory

Отвечает за редакционный lifecycle:

- idea/brief, одиночный content package и week plan;
- список публикаций и фильтрацию;
- текстовую revision, visual intent и material summary;
- review, explicit approval, schedule и publication receipt;
- открытие Reference Picker и Scene Studio с `content_item_id` context.

Не реализует diffusion/render и не редактирует Character Brain.

```ts
type ContentFactoryPageProps = {
  items: ContentItemListRow[];
  characters: CharacterOption[];
  filters: ContentFilters;
  onFiltersChange: (filters: ContentFilters) => void;
  onCreateOne: () => void;
  onCreateWeek: () => void;
  onOpenItem: (contentItemId: string) => void;
  onPerformAction: (action: ContentAction) => Promise<void>;
};

type PublicationDialogProps = {
  item: PublicationEditorData;
  status: ContentStatusView;
  material: MaterialStatusView;
  publication: PublishAttemptStatusView | null;
  approval: ApprovalView | null;
  allowedActions: ContentActionName[];
  onSaveDraft: (draft: PublicationDraft) => Promise<void>;
  onChooseAsset: () => void;
  onApprove: (command: ApproveContentCommand) => Promise<void>;
  onReject: (command: RejectContentCommand) => Promise<void>;
  onSchedule: (command: ScheduleContentCommand) => Promise<void>;
  onClose: () => void;
};
```

### 5.6. Calendar

Отвечает за временное представление, а не за второй редактор статуса:

- confirmed `scheduled` entries;
- отдельно обозначенные schedule suggestions/drafts;
- timezone, date/time, platform и approval validity;
- открытие одной и той же Publication Dialog через `content_item_id`.

```ts
type CalendarPageProps = {
  entries: CalendarEntryView[];
  timezone: string;
  range: CalendarRange;
  onRangeChange: (range: CalendarRange) => void;
  onOpenItem: (contentItemId: string) => void;
  onReschedule: (command: RescheduleContentCommand) => Promise<void>;
};
```

Calendar не считает любой `publish_at` подтверждённым расписанием и не позволяет обходить approval.

## 6. Общие read models и действия

UI получает минимальные presentation models, а не сырые Supabase rows. Обязательный общий минимум:

```ts
type UserSummary = {
  id: string;
  email: string;
  role: "owner" | "editor" | "reviewer";
};

type StatusView = {
  code: string;
  label: string;
  tone: "neutral" | "info" | "warning" | "success" | "danger";
  detail?: string;
};

type AtlasActions = {
  openCreateContent: (preset?: CreateContentPreset) => void;
  openCharacter: (characterId?: string) => void;
  openSceneStudio: (context?: SceneStudioContext) => void;
  openReferencePicker: (context: ReferencePickerContext) => void;
  openPublication: (contentItemId: string) => void;
  openCalendar: (focus?: CalendarFocus) => void;
};
```

Callbacks используют IDs и command payload, а не передают mutable row между feature-модулями. `owner_id`, trusted approval fields, rights verdict, Storage path и provider receipt никогда не принимаются из UI как доверенные значения.

## 7. Единые modal и устранение дублирующих действий

Несколько кнопок могут оставаться в понятных местах, но они обязаны вызывать одну semantic command.

| Entry points сейчас | Единая команда | Один целевой сценарий |
| --- | --- | --- |
| глобальная «Создать», CTA главной, «Один материал» | `openCreateContent()` | `CreateContentDialog` |
| карточка модели, «Новая AI-модель» | `openCharacter(id?)` | `CharacterBrainDialog` create/edit |
| «Студия аватаров», переход из Character Brain | `openSceneStudio(context)` | `SceneStudioDialog` с preset |
| ручной URL, attach сцены | `openReferencePicker({ mode: "select_publish_asset" })` | один asset selection workflow |
| dropdown статуса, кнопки согласования | `performContentAction(command)` | только разрешённые lifecycle actions |
| дата в create/edit/calendar | `scheduleContent(command)` | единый schedule workflow после approval |
| lightbox сцены и будущие preview | `openImagePreview(asset)` | общий `ImageLightbox` |

Целевой `ModalHost` хранит только одно discriminated union состояние:

```ts
type ModalState =
  | { type: "character"; characterId?: string }
  | { type: "scene_studio"; context?: SceneStudioContext }
  | { type: "reference_picker"; context: ReferencePickerContext }
  | { type: "create_content"; preset?: CreateContentPreset }
  | { type: "week_planner"; characterId?: string }
  | { type: "publication"; contentItemId: string }
  | { type: "image_preview"; asset: ImagePreviewData }
  | { type: "confirm_cost"; command: CostedCommand }
  | null;
```

Общий `Modal` обеспечивает `role="dialog"`, `aria-modal`, заголовок через `aria-labelledby`, focus trap, закрытие Escape, возврат focus, блокировку scroll и единообразный backdrop. Эти улучшения внедряются отдельным UI PR; механическое извлечение сначала сохраняет текущее поведение.

## 8. Три независимых статуса в интерфейсе

`StatusStack` показывает три строки/бейджа и никогда не сворачивает их в одно слово «Готово».

| Слой | Канонические значения | Пример русской подписи | Что определяет |
| --- | --- | --- | --- |
| Контент | `idea`, `draft`, `material_pending`, `review`, `ready`, `scheduled`, `publishing`, `published`, `publish_failed`, `archived` | «На проверке», «Согласовано», «Запланировано» | редакционный lifecycle |
| Материал/render | `not_requested`, `selecting_reference`, `reference_ready`, `queued`, `processing`, `needs_review`, `accepted`, `rejected`, `failed`, `restricted` | «Подбираем референс», «Нужна проверка», «Материал принят» | подбор, GPU и QA |
| Отправка | `pending`, `dispatching`, `succeeded`, `failed_retryable`, `failed_terminal`, `unknown` | «Ожидает отправки», «Опубликовано», «Статус неизвестен» | попытка публикации и receipt |

Правила presentation:

1. `generation_jobs.completed` отображается как «Рендер завершён», но не как `accepted` и не как `ready`.
2. `content.ready` означает действующий manual approval текущей revision, а не наличие `asset_url`.
3. `published` показывается только при provider/manual receipt; обычного editable option не существует.
4. `restricted` и terminal failure всегда видимы и блокируют зависимые CTA.
5. `unknown` не превращается в «Ошибка — повторить» без provider lookup.
6. На legacy runtime presenter честно маркирует отсутствующие данные как «Не отслеживается», а не выводит выдуманный успешный status.

В списке на desktop отображается компактный основной status и раскрываемый status stack; на mobile все три статуса доступны в карточке/детальном modal без hover-only информации.

## 9. Ручной approval как hard gate

`ApprovalPanel` является самостоятельным блоком в Publication Dialog и показывает:

- content revision и время последнего изменения;
- совпадает ли текущий publish payload hash с подтверждённым;
- approver, approved time и comment;
- checklist текста, accepted asset, rights, disclosure и platform account;
- причины блокировки;
- отдельные действия «Вернуть на доработку» и «Согласовать эту версию».

UI-инварианты:

1. Status dropdown не создаёт approval и не содержит `published`.
2. `Согласовать` вызывает отдельную backend command и требует явного клика человека.
3. OpenAI/Modal completion не открывает schedule автоматически.
4. Изменение текста, asset, platform/account, disclosure или rights показывает approval как revoked/stale и возвращает workflow в review.
5. Schedule controls disabled, пока backend не вернул valid approval для текущих revision/hash.
6. Advertising дополнительно показывает brand/disclosure/rights blockers.
7. Bulk approval недели не является скрытым default: требуется явный review scope и список revision каждого материала.

До появления server-side approval API UI не должен имитировать этот контракт только локальным state. Legacy кнопки переносятся без изменения поведения, а hard gate внедряется совместным PR областей 03/05 и отдельным UI PR области 04.

## 10. Desktop и mobile navigation

Источник истины — единый массив `NavigationItem[]` с stable `id`, русским label, icon, permission и target section.

### Desktop

- `DesktopNavigation` сохраняет текущую фиксированную панель шириной 238px;
- header и content сохраняют существующие размеры и breakpoints;
- active section определяется одним `AtlasSection`, а не строкой заголовка;
- CTA header вызывает общий action registry;
- feature-модули не рисуют собственную top-level navigation.

### Mobile/compact

- на первом этапе `CompactNavigation` воспроизводит текущую панель 72px при `max-width: 800px` без визуального изменения;
- каждая icon-only кнопка получает доступный русский `aria-label` и active state;
- модальные формы остаются scrollable, primary action не зависит от hover;
- tabs допускают горизонтальный scroll и сохраняют visible focus;
- длинные status/detail данные переходят в карточку/детальный view, а не исчезают без замены;
- переход на bottom navigation или drawer считается отдельным редизайном и не входит в механическую декомпозицию.

Оба представления используют один navigation state и не монтируют разные feature trees, поэтому переключение viewport не теряет draft/modal state.

## 11. Безопасный порядок разбиения `dashboard.tsx`

Каждый пункт выполняется отдельным узким PR или самостоятельным проверяемым коммитом. Следующий пункт начинается только после clean build и визуального сравнения предыдущего.

1. **Зафиксировать baseline.** Сохранить screenshots desktop/compact основных экранов и modal; выполнить `npm ci` и `npm run build`. Не запускать API/GPU.
2. **Извлечь только типы.** Перенести `User`, `Model`, `Item`, `AvatarJob`, `Asset` без переименования полей и без adapters.
3. **Извлечь UI primitives.** `Empty`, `Modal`, `ImageLightbox`; сохранить JSX, className и import order CSS дословно.
4. **Извлечь shell.** Navigation/header/content viewport; `dashboard.tsx` остаётся facade с тем же state.
5. **Извлечь read-only экраны.** Home, Team, Settings, затем ModelCards/AI Models и Calendar. Props передаются без новых запросов.
6. **Извлечь Character Brain.** Сначала весь `ModelDialog` одним компонентом, затем tabs/field groups. Save callback остаётся прежним.
7. **Извлечь Content Factory views.** Studio и ContentList, затем PublicationDialog, ContentDialog и WeekPlanner без изменения lifecycle.
8. **Извлечь Scene Studio.** Перенести polling/local state/API calls целиком; только после parity разделить controls, jobs и results.
9. **Ввести единый ModalHost/actions.** Заменять boolean states по одному modal, сохраняя entry points и поведение.
10. **Разделить controllers.** Перенести Supabase/API operations из root в feature client/controller только после component parity; backend контракты меняются отдельными PR.
11. **Внедрить новые lifecycle UI.** StatusStack, Reference Picker, approval/schedule gates подключаются только к реализованным server-side контрактам.
12. **Удалить facade.** `dashboard.tsx` удаляется лишь когда не содержит state, query, mutation, JSX или compatibility adapters.
13. **Механически разделить CSS.** Перенести selectors в feature-файлы без изменения declarations/specificity; сохранять порядок подключения до screenshot parity.

Запрещённые сочетания в одном PR:

- перенос компонента плюс редизайн;
- перенос компонента плюс смена Supabase query/payload;
- переименование status плюс внедрение новых transitions;
- перенос CSS плюс изменение breakpoints;
- извлечение Scene Studio плюс изменение polling/retry/GPU count;
- декомпозиция плюс массовое lint-исправление несвязанных файлов.

## 12. Файловые границы областей 01–04

После декомпозиции ownership разделяется по model/controller и UI, а изменения публичного контракта проходят через отдельный согласованный PR.

| Область | Самостоятельно меняет | Не меняет без согласования |
| --- | --- | --- |
| 01 — Character Brain | `features/character-brain/model/**`, adapters и contract tests; `docs/architecture/CHARACTER_BRAIN.md` | `character-brain/ui/**`, Scene/Content UI, shared modal/navigation |
| 02 — Сцены и референсы | `features/scene-studio/model/**`, `scene-studio/api/**`, `reference-library/model/**`; `REFERENCE_LIBRARY.md` | `scene-studio/ui/**`, `reference-library/ui/**`, content lifecycle |
| 03 — Контент-фабрика | `features/content-factory/model/**`, `content-factory/api/**`, `calendar/model/**`; `CONTENT_PIPELINE.md` | feature UI, shared modal/navigation, Character Brain/Scene internals |
| 04 — Интерфейс | `components/ui/**`, `features/*/ui/**`, shell/navigation, feature presentation CSS | domain contracts, Supabase migrations, API/Modal payload и lifecycle permissions |

Совместные точки с повышенным риском конфликтов:

- `shared/atlas.types.ts` содержит только truly shared IDs/summaries; изменение требует согласования владельцев потребителей;
- `shared/atlas-actions.ts` меняется областью 04 при добавлении UI entry point и владельцем domain action при изменении command payload;
- `app/atlas-app.tsx` принадлежит области 04; области 01–03 экспортируют feature entry component и controller, но не редактируют композицию параллельно;
- `layout.tsx` и глобальный порядок CSS принадлежат области 04;
- migration/API route/runtime остаются вне области 04.

Если область 01–03 требует новое поле UI, она сначала обновляет versioned type/read model и описывает состояние loading/error/empty/permission. Область 04 затем меняет только соответствующий `ui/**` файл. Это позволяет не редактировать один компонент одновременно.

## 13. Definition of Done декомпозиции

Декомпозиция считается завершённой, когда:

- `dashboard.tsx` больше не является feature-монолитом;
- каждый крупный экран и modal имеет отдельный entry component и typed props;
- feature UI не выполняет чужие domain actions и не импортирует UI другого feature напрямую;
- одинаковые CTA используют общие semantic commands;
- существует один modal host и единые accessibility guarantees;
- content/material/publication statuses отображаются раздельно;
- schedule/publish controls зависят от server-validated manual approval;
- desktop и compact navigation используют один state и список пунктов;
- области 01–04 имеют независимые каталоги согласно ownership matrix;
- каждый этап прошёл build и screenshot parity без OpenAI/GPU вызовов;
- production visual language и русские labels не изменились без отдельного design decision.

## 14. Следующие узкие PR

Этот контракт не реализует следующие этапы:

1. `04-B`: baseline screenshots и механическое извлечение типов + UI primitives без изменения DOM/CSS.
2. `04-C`: shell/navigation и read-only screens с сохранением текущего data loading.
3. `04-D`: Character Brain и Content Factory modal extraction без lifecycle changes.
4. `04-E`: Scene Studio/Reference Library extraction без изменения render runtime.
5. Совместно `03/04/05`: StatusStack, manual approval и schedule gates после server-side revisions/approval API.
6. `04-F`: механическое разделение CSS и удаление compatibility facade после полной parity.
