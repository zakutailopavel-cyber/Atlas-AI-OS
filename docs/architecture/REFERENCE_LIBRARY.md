# Reference-first библиотека сцен — архитектурный контракт

Статус: **02-A, контракт v1.0 (documentation only)**

Область: **02 — Сцены и референсы**

Дата: **2026-07-14**

Этот документ задаёт источник истины, типы данных, инварианты и поток reference-first генерации сцен Atlas AI OS. Он не меняет runtime, Modal, API, Supabase, Storage, интерфейс или `dashboard.tsx` и не создаёт миграций. Предлагаемые таблицы и payload фиксируют цель для следующих узких PR.

## 1. Цель и принцип reference-first

Reference-first означает, что Atlas сначала выбирает существующий исходный кадр с подходящей композицией, светом, действием и локацией, а затем внедряет в разрешённую область AI-модель. Исходный кадр, его версия и карта допустимых изменений являются обязательными входами render plan.

Основные инварианты:

1. Неизменяемые области исходника важнее текстового prompt.
2. Лицо и постоянные признаки персонажа берутся только из versioned Character Brain и его primary identity reference.
3. Изменять можно только явно разрешённые семантические зоны или mask.
4. Оригинал никогда не перезаписывается; каждый результат образует новую версию с полной lineage.
5. Рендер запрещён без подтверждённого источника и достаточных прав на AI-обработку.
6. Одинаковый render fingerprint не должен запускать GPU повторно.
7. Один пользовательский запрос по умолчанию создаёт один результат.

Text-to-image без исходного кадра остаётся отдельным режимом `from_scratch` и не считается reference-first.

## 2. Границы ответственности

Библиотека сцен отвечает за:

- исходные изображения, их версии, provenance и лицензию;
- структурированное описание сцены и поиск;
- композицию, свет, одежду, действие, локацию и объекты;
- зоны `locked`, `preserve`, `adjust` и `replace`;
- подбор сцены под запрос контент-фабрики;
- render plan, дедупликацию, кэш и lineage;
- автоматические и ручные критерии сохранения лица и сцены.

Библиотека сцен не отвечает за:

- биографию, память, seed и визуальные инварианты персонажа — область 01;
- идеи публикаций, caption, календарь и статусы — область 03;
- формы, галерею и UX подтверждения — область 04;
- физические миграции, RLS, Storage policies и учёт расходов — область 05.

## 3. Фактическое состояние `main`

На снимке `673d66a`:

- `generation_jobs` хранит `model_id`, `kind`, prompt, style, count, status, output URLs, provider, ошибку и timestamps;
- `model_references` хранит `model_id`, `storage_path`, один из типов `candidate | primary | reference`, связь с job и автора;
- bucket `atlas-assets` принимает JPEG, PNG и WebP до 10 MB; Modal загружает туда готовые JPEG;
- scene job получает `reference_url` лица и необязательный `source_url` исходной сцены;
- SDXL использует IP-Adapter face с scale `0.58`;
- при наличии `source_url` применяется full-frame img2img с strength `0.32`, 20 steps и без mask;
- при отсутствии `source_url` создаётся новая сцена text-to-image;
- референсное лицо кэшируется только в памяти прогретого Modal container по URL;
- повтор failed job создаёт новый `generation_jobs` и новый GPU-запуск;
- отсутствуют content hash, idempotency key, лицензия, structured tags, зоны изменения и автоматическая оценка качества.

Текущий runtime является совместимым legacy-путём, но не удовлетворяет этому контракту полностью.

## 4. Типы референсов

`reference_type` — закрытый enum. Один asset может иметь несколько ролей, но одна версия и один источник истины.

| Тип | Назначение | Может быть исходной сценой | Обязательные данные |
| --- | --- | --- | --- |
| `scene_source` | Полный исходный кадр для reference-first преобразования | Да | license, composition, lighting, location, change regions |
| `identity_primary` | Каноническое лицо персонажа | Нет | `character_id`, Character Brain revision, face quality |
| `identity_support` | Дополнительные ракурсы того же персонажа | Нет | `character_id`, angle, expression, approval |
| `pose_composition` | Поза, framing и положение субъекта | Только после назначения зон | pose, subject slot, camera |
| `canonical_location` | Повторяемая локация и её постоянные детали | Да | location identity, locked anchors, continuity revision |
| `lighting_style` | Схема света и цветовая атмосфера | Нет | light sources, direction, softness, temperature |
| `wardrobe` | Одежда, сочетание и материалы | Нет | garments, colors, materials, change policy |
| `action_object` | Действие, реквизит и взаимодействие рук | Нет | action, object, hand/pose constraints |
| `generated_variant` | Принятый результат Atlas, доступный для повторного использования | Да, после review | parent lineage, QA, synthetic disclosure |
| `rejected_output` | Результат для анализа ошибок, не доступный подбору | Нет | rejection reasons, metrics |

`generated_variant` не становится автоматически `identity_primary`, canonical location или новым источником истины. Такое повышение требует отдельного ручного решения.

## 5. Контракт reference asset

Логическая модель версии референса:

```ts
type ReferenceAssetVersionV1 = {
  contract_version: "1.0";
  reference_id: string;
  version_id: string;
  version: number;
  type: ReferenceType;
  status: "draft" | "ready" | "restricted" | "archived" | "rejected";
  owner_id: string;
  character_id: string | null;
  parent_version_id: string | null;

  media: {
    storage_bucket: string;
    storage_path: string;
    mime_type: "image/jpeg" | "image/png" | "image/webp";
    width: number;
    height: number;
    aspect_ratio: number;
    sha256: string;
    perceptual_hash: string;
    exif_removed: boolean;
  };

  description: string;
  tags: SceneTagsV1;
  regions: ChangeRegionV1[];
  provenance: ProvenanceV1;
  quality: ReferenceQualityV1;
  created_at: string;
  created_by: string;
};
```

`sha256` идентифицирует точные байты, `perceptual_hash` обнаруживает визуальные дубликаты после resize или перекодирования. Version record неизменяем; исправление metadata создаёт следующую версию.

## 6. Структурированные теги сцены

Свободное описание обязательно для семантического поиска, но не заменяет структурированные поля.

```ts
type SceneTagsV1 = {
  composition: {
    orientation: "portrait" | "landscape" | "square";
    shot: "extreme_close_up" | "close_up" | "waist_up" | "three_quarter" | "full_body" | "wide";
    camera_angle: "eye_level" | "high" | "low" | "top_down" | "over_shoulder";
    subject_count: number;
    subject_slot: { x: number; y: number; width: number; height: number } | null;
    pose: string[];
    gaze: "camera" | "off_camera" | "object" | "unknown";
    depth: "shallow" | "medium" | "deep";
    camera_style: string[];
  };
  lighting: {
    source: ("daylight" | "window" | "sun" | "practical" | "studio" | "mixed")[];
    direction: "front" | "side" | "back" | "top" | "mixed";
    softness: "soft" | "medium" | "hard";
    time_of_day: "morning" | "day" | "golden_hour" | "evening" | "night" | "unknown";
    temperature: "warm" | "neutral" | "cool" | "mixed";
    contrast: "low" | "medium" | "high";
    exposure: "under" | "normal" | "bright";
  };
  wardrobe: {
    garments: string[];
    colors: string[];
    materials: string[];
    patterns: string[];
    dress_code: string[];
    continuity_key: string | null;
  };
  action: {
    verb: string;
    object_ids: string[];
    hand_interaction: string | null;
    body_motion: "static" | "low" | "active";
    expression: string | null;
  };
  location: {
    kind: "interior" | "exterior" | "studio" | "transport" | "unknown";
    category: string;
    canonical_location_id: string | null;
    room_or_zone: string | null;
    city_country: string | null;
    continuity_revision: number | null;
    fixed_anchors: string[];
  };
  objects: {
    id: string;
    label: string;
    importance: "required" | "supporting" | "incidental";
    position: string | null;
  }[];
  aesthetic: string[];
  safety: string[];
};
```

Для повторяемой домашней локации, например квартиры персонажа, `canonical_location_id` и `fixed_anchors` сохраняют планировку и накопленные детали между сценами. Стиль вроде обычного iPhone photo, естественного дневного света и отсутствия cinematic-фильтра фиксируется одновременно в `camera_style`, lighting и aesthetic, а не только в prompt.

## 7. Источник, права и лицензия

```ts
type ProvenanceV1 = {
  source_type: "user_owned" | "commissioned" | "licensed" | "public_domain" | "ai_generated";
  source_url: string | null;
  source_creator: string | null;
  captured_or_created_at: string | null;
  license_code: string;
  license_document_path: string | null;
  commercial_use: boolean;
  derivative_work: boolean;
  ai_processing: boolean;
  attribution_required: boolean;
  attribution_text: string | null;
  valid_from: string | null;
  valid_until: string | null;
  territory: string[];
  identifiable_people: "none" | "fictional" | "consented" | "unverified";
  consent_document_path: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};
```

Hard gate перед подбором:

- `commercial_use`, `derivative_work` и `ai_processing` должны соответствовать цели публикации;
- `valid_until` не должен быть просрочен;
- `identifiable_people = unverified` запрещает рендер;
- отсутствие license document допустимо только для `user_owned` с явной декларацией владельца или подтверждённого `public_domain`;
- требуемая атрибуция переносится в lineage результата и metadata публикации;
- отзыв прав переводит asset в `restricted`, исключает его из новых запросов и инвалидирует его cache entries.

## 8. Допустимые зоны изменения

Каждая зона задаётся semantic label и mask, сохранённой как отдельный versioned asset.

```ts
type ChangeRegionV1 = {
  region_id: string;
  label: "subject" | "face" | "hair" | "skin" | "wardrobe" | "hands" | "held_object" | "background" | "text" | "custom";
  policy: "locked" | "preserve" | "adjust" | "replace";
  mask_storage_path: string | null;
  bbox: { x: number; y: number; width: number; height: number } | null;
  allowed_changes: string[];
  forbidden_changes: string[];
  feather_px: number;
  priority: number;
};
```

Семантика policy:

- `locked` — пиксели, геометрия и содержимое должны остаться неизменными;
- `preserve` — допускаются только минимальные согласования границ, шума и цвета;
- `adjust` — разрешены перечисленные изменения без замены сущности;
- `replace` — зона может быть перегенерирована согласно render plan.

Отсутствие mask трактуется как `locked`, а не как разрешение менять весь кадр. Пересекающиеся зоны разрешаются по `priority`; более строгая policy имеет преимущество. Текст, логотипы, лица посторонних людей и критические объекты по умолчанию `locked` либо исключают asset из подбора.

## 9. Режимы внедрения AI-модели

| Режим | Требуемый исходник | Разрешённые изменения | Назначение |
| --- | --- | --- | --- |
| `replace_subject` | Кадр с заменяемым субъектом и subject mask | subject, лицо, волосы; одежда только по policy | Сохранить сцену, заменить персонажа |
| `insert_subject` | Кадр с подтверждённым свободным subject slot | новая subject mask и локальные тени | Добавить персонажа без перестройки фона |
| `identity_transfer` | Синтетический/разрешённый субъект с подходящей позой | лицо и постоянные визуальные признаки | Сохранить позу и одежду исходника |
| `wardrobe_adjust` | Принятый кадр персонажа | только wardrobe mask | Изменить одежду, не меняя лицо и сцену |
| `controlled_refine` | Существующий результат Atlas | только явно выбранные зоны | Исправить дефект без полной регенерации |

### 9.1. Render flow

1. Получить `SceneCharacterContextV1` из server-side Character Brain revision.
2. Нормализовать scene request в structured constraints.
3. Выполнить hard filters по правам, типу, aspect ratio, status и наличию допустимой зоны.
4. Выбрать одну versioned сцену и зафиксировать `reference_version_id`.
5. Построить render plan: режим, masks, locked zones, primary identity reference, seed, backend и параметры.
6. Вычислить render fingerprint и проверить completed/in-flight cache.
7. Создать idempotent render request и только после получения lock разрешить GPU dispatch.
8. Применить pose/depth/segmentation controls и masked generation/inpainting; IP-Adapter или InstantID отвечает за identity, а img2img не получает право менять locked pixels.
9. Выполнить локальное согласование света, цвета, теней, grain и границ внутри `preserve`/`replace` зон.
10. Запустить identity QA и scene preservation QA.
11. Сохранить результат, metrics, lineage и решение review; оригинал не изменять.

Текущий full-frame img2img допускается только как legacy fallback для `controlled_refine`, если пользователь явно разрешил изменение всего кадра. Целевой reference-first путь использует masks/inpainting или последующую композицию.

## 10. Контракт запроса подбора

```ts
type SceneReferenceQueryV1 = {
  contract_version: "1.0";
  character_id: string;
  character_revision: number;
  content_item_id: string | null;
  purpose: "organic" | "advertising" | "internal_test";
  platform: string;
  target_aspect_ratio: string;
  required: {
    action: string;
    location: string | null;
    framing: string;
    lighting: string[];
    wardrobe: string[];
    objects: string[];
  };
  preferred: string[];
  forbidden: string[];
  mode: "replace_subject" | "insert_subject" | "identity_transfer" | "wardrobe_adjust" | "controlled_refine";
};
```

Контент-фабрика передаёт намерение и ограничения, но не выбирает Storage URL и не формирует GPU payload.

## 11. Поиск и подбор

Подбор выполняется в два этапа.

### 11.1. Hard filters

- `status = ready`;
- совместимая license и неистёкшие права;
- нет unverified identifiable people;
- совместимые orientation/aspect ratio и минимальное разрешение;
- нужный reference type;
- существует region с требуемой policy;
- asset не архивирован, не restricted и не rejected;
- canonical location revision не противоречит continuity персонажа.

### 11.2. Ranking

Предлагаемая начальная формула:

| Сигнал | Вес |
| --- | ---: |
| Композиция, framing и subject slot | 25% |
| Локация и continuity anchors | 20% |
| Действие и ключевой объект | 15% |
| Свет и время суток | 15% |
| Одежда и palette | 10% |
| Aspect ratio и качество source | 10% |
| История успешного повторного использования | 5% |

Structured match комбинируется с semantic embedding описания. Финальный выбор всегда сохраняет score breakdown, query version и reference version; это делает подбор объяснимым и воспроизводимым.

Если лучший кандидат ниже provisional score `0.72`, Atlas не запускает GPU и предлагает уточнить запрос или добавить референс. Порог калибруется на контрольном наборе без изменения формата контракта.

## 12. Кэш и защита от повторных GPU-запусков

### 12.1. Render fingerprint

`render_fingerprint = SHA-256(canonical_json)` от:

- `reference_version_id`, source `sha256` и mask version hashes;
- `character_id`, Character Brain revision, identity reference hash и identity blueprint version;
- mode и нормализованных scene constraints;
- sorted allowed/forbidden changes;
- backend, model revision, IP-Adapter/InstantID revision и веса;
- img2img/inpaint strength, guidance, steps, seed, width и height;
- post-processing revision.

URL, timestamps, job ID, user-facing punctuation и порядок JSON keys в fingerprint не входят.

### 12.2. Tenant boundary

`render_fingerprint` описывает параметры рендера и может совпасть у разных владельцев. Он никогда не является самостоятельным cache key. Полный ключ кэша — строго (`owner_id`, `render_fingerprint`), а ключ повторной отправки — (`owner_id`, `idempotency_key`). `owner_id` определяется server-side из авторизованного tenant/team context и не принимается на доверии из клиентского body.

Любой cache lookup обязан начинаться с `owner_id = authenticated_owner_id`. Запрещены поиск только по fingerprint, fallback в кэш другого владельца, глобальное переиспользование результата и выдача signed URL до проверки владельца. Даже при полностью одинаковом fingerprint два владельца получают независимые request/cache namespaces.

Output разрешается только через принадлежащий владельцу request: сначала выбирается `reference_render_requests` по (`owner_id`, `render_fingerprint`) или (`owner_id`, `idempotency_key`), затем `reference_render_outputs` связывается по `request_id`. Service-role worker применяет тот же tenant predicate явно; его технические полномочия не расширяют видимость кэша.

### 12.3. Idempotency

До GPU dispatch выполняется атомарная регистрация fingerprint внутри текущего `owner_id`:

1. `completed + accepted` — вернуть готовый результат без GPU;
2. `queued | processing` — присоединить клиента к существующему request;
3. `completed + rejected` — показать причины; повтор разрешить только после изменения параметров;
4. `failed` — retry использует тот же logical request и увеличивает `attempt`, а не создаёт независимый дубль;
5. новый fingerprint — создать request и получить единственный dispatch lock.

Constraints unique (`owner_id`, `render_fingerprint`) и unique (`owner_id`, `idempotency_key`) исключают дубли только внутри одного владельца. Кнопка повторной отправки клиента использует постоянный `idempotency_key` в том же tenant context. Принудительный новый вариант требует `variant_nonce`, явного подтверждения стоимости и создаёт новый fingerprint.

Кэш готового результата не имеет TTL, пока reference, license, Character Brain revision и pipeline revision действительны. Изменение любого из них инвалидирует match естественным образом через fingerprint; отзыв лицензии дополнительно блокирует старую запись.

## 13. Критерии сохранения лица

Результат не получает статус `accepted`, если не прошёл обязательные проверки:

| Проверка | Provisional критерий v1 |
| --- | --- |
| Количество лиц | Ровно одно целевое лицо; посторонние лица отсутствуют либо находятся в locked source zones |
| Identity similarity | Cosine similarity к primary face embedding `>= 0.68` и к медиане approved support references `>= 0.62` |
| Возраст | Оценка отличается от Character Brain не более чем на 3 года |
| Геометрия лица | Нет критического расхождения blueprint: форма лица, глаза, нос, губы и distinctive details |
| Целостность | Нет extra face, fused features, асимметрии уровня дефекта или повреждения глаз/зубов |
| Согласованность | Цвет кожи, направление света и резкость лица согласованы со сценой |

Автоматический pass не заменяет ручное одобрение primary identity или рекламного материала. Порог similarity калибруется на approved/rejected наборе каждого backend; изменение порога версионируется как QA policy revision.

## 14. Критерии сохранения сцены

Сравнение выполняется с исходной reference version после приведения к одному размеру.

| Проверка | Provisional критерий v1 |
| --- | --- |
| Locked regions | Pixel/structural change отсутствует; SSIM `>= 0.98` и LPIPS `<= 0.04` внутри mask |
| Preserve regions | SSIM `>= 0.92` и LPIPS `<= 0.12` |
| Композиция | Положение subject slot и крупных объектов отклоняется не более чем на 4% ширины/высоты кадра |
| Геометрия | Линии помещения, горизонт, двери, окна и мебельные anchors не деформированы |
| Объекты | Все `importance = required` присутствуют и не заменены другим классом |
| Свет | Направление основной тени совпадает; median ΔE00 в preserve regions `<= 8` |
| Локация | Canonical location anchors и continuity revision сохранены |
| Текст/логотипы | Не создаются новые случайные надписи; locked text не искажается |

Если метрики не вычислимы, результат остаётся `needs_review`, а не считается успешным. Нарушение locked region — hard fail и не исправляется повторной полной генерацией; следующий attempt обязан изменить mask или pipeline mode.

## 15. Оценка качества и решение review

```ts
type ReferenceRenderQualityV1 = {
  qa_policy_revision: string;
  identity: {
    primary_similarity: number | null;
    support_similarity: number | null;
    face_count: number;
    age_delta: number | null;
    defects: string[];
  };
  scene: {
    locked_ssim: number | null;
    locked_lpips: number | null;
    preserve_ssim: number | null;
    preserve_lpips: number | null;
    composition_drift: number | null;
    missing_required_objects: string[];
    broken_anchors: string[];
  };
  automatic_decision: "pass" | "needs_review" | "fail";
  human_decision: "accepted" | "rejected" | null;
  rejection_reasons: string[];
};
```

Для качества используются versioned контрольные сцены: close-up, waist-up, full-body, indoor daylight, outdoor, active hands/object и canonical location. Benchmark запускается только запланированной серией с заранее утверждённым бюджетом, а не при каждой сборке.

## 16. Предлагаемая схема таблиц

Ниже логическая схема без миграций и SQL в этом PR.

### 16.1. `reference_assets`

Корневая сущность и жизненный цикл.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | uuid PK | Стабильный reference ID |
| `owner_id` | uuid | Tenant/владелец |
| `character_id` | uuid nullable | Scope персонажа |
| `type` | enum | Тип из раздела 4 |
| `status` | enum | draft/ready/restricted/archived/rejected |
| `current_version_id` | uuid | Активная immutable version |
| `created_by`, `created_at` | audit | Автор и дата |

### 16.2. `reference_versions`

Immutable media и metadata version.

| Поле | Тип |
| --- | --- |
| `id`, `reference_id`, `version` | uuid, uuid, integer |
| `storage_bucket`, `storage_path`, `mime_type` | text |
| `width`, `height`, `aspect_ratio` | integer, integer, numeric |
| `sha256`, `perceptual_hash` | text |
| `description` | text |
| `scene_tags` | jsonb |
| `parent_version_id` | uuid nullable |
| `created_by`, `created_at` | audit |

Constraints: unique (`reference_id`, `version`), unique (`owner_id`, `sha256`) через связь с asset, version update запрещён.

### 16.3. `reference_regions`

| Поле | Тип |
| --- | --- |
| `id`, `reference_version_id` | uuid |
| `label`, `policy`, `priority` | enum, enum, integer |
| `mask_storage_path` | text nullable |
| `bbox`, `allowed_changes`, `forbidden_changes` | jsonb |
| `mask_sha256`, `feather_px` | text, integer |

### 16.4. `reference_rights`

Отдельная versioned запись provenance/license из раздела 7. Отзыв прав не изменяет media version, но блокирует её использование.

### 16.5. `reference_embeddings`

| Поле | Тип |
| --- | --- |
| `reference_version_id`, `embedding_type`, `model_revision` | key |
| `vector` | vector |
| `input_hash`, `created_at` | text, timestamptz |

Embedding пересчитывается только при изменении version или embedding model revision.

### 16.6. `reference_render_requests`

Заменяет роль scene-specific части `generation_jobs`, сохраняя возможность legacy mapping.

| Поле | Тип | Назначение |
| --- | --- | --- |
| `id` | uuid PK | Logical request |
| `owner_id` | uuid | Обязательный tenant/team owner; определяется server-side |
| `render_fingerprint` | text | Дедупликация только в scope владельца |
| `idempotency_key` | text | Защита повторного submit только в scope владельца |
| `reference_version_id` | uuid | Исходная сцена |
| `character_id`, `character_revision` | uuid, integer | Снимок identity |
| `mode`, `render_plan` | enum, jsonb | Versioned plan |
| `status` | enum | planned/queued/processing/completed/failed/cancelled |
| `attempt`, `max_attempts` | integer | Контролируемый retry |
| `dispatch_lock_at` | timestamptz nullable | Единственный GPU dispatch |
| `estimated_cost`, `actual_cost` | numeric nullable | Бюджет |
| `created_by`, timestamps | audit | История |

Constraints: unique (`owner_id`, `render_fingerprint`) и unique (`owner_id`, `idempotency_key`). Глобальная уникальность `render_fingerprint` или `idempotency_key` запрещена: совпадение между владельцами допустимо, но не создаёт право видеть или повторно использовать чужой request/output. `reference_version_id`, `character_id` и каждый output, доступный через `request_id`, должны принадлежать тому же `owner_id`.

### 16.7. `reference_render_outputs`

| Поле | Тип |
| --- | --- |
| `id`, `request_id` | uuid |
| `storage_path`, `sha256`, `perceptual_hash` | text |
| `pipeline_revision`, `seed` | text, bigint |
| `lineage` | jsonb |
| `quality_metrics` | jsonb |
| `automatic_decision`, `human_decision` | enum |
| `created_at`, `reviewed_at`, `reviewed_by` | audit |

### 16.8. `reference_usage`

Связывает reference/output с content item, публикацией и фактическим использованием. Нужна для attribution, аналитики успешности, запрета удаления используемых материалов и ranking history.

## 17. Storage contract

Предлагаемые immutable paths:

```text
references/{owner_id}/{reference_id}/v{version}/original.{ext}
references/{owner_id}/{reference_id}/v{version}/preview.webp
references/{owner_id}/{reference_id}/v{version}/masks/{region_id}.png
references/{owner_id}/{reference_id}/v{version}/license/{document}
renders/{owner_id}/{request_id}/{output_id}.jpg
```

Source originals, masks и license documents должны быть private; потребители получают короткоживущие signed URLs. Public publishing asset создаётся отдельно после acceptance. EXIF удаляется из производной копии, но provenance сохраняется в БД.

## 18. Совместимость и переход с текущих таблиц

| Текущее поле | Целевая сущность | Правило перехода |
| --- | --- | --- |
| `model_references.id` | `reference_assets.id` или legacy link | Не переиспользовать без backfill mapping |
| `storage_path` | `reference_versions.storage_path` | Вычислить hash и создать version 1 |
| `kind = primary` | `type = identity_primary` | Сверить с Character Brain primary reference |
| `kind = candidate` | `identity_support`, status draft | Не допускать к генерации до review |
| `kind = reference` | Требует классификации | Не считать автоматически scene_source |
| `generation_job_id` | lineage/legacy job ID | Сохранить происхождение |
| `generation_jobs.kind = scene` | `reference_render_requests` | Backfill только после утверждения schema |
| `output_urls` | `reference_render_outputs` | Импортировать каждое изображение отдельно |

До миграции `visual_passport.avatar` остаётся каноническим runtime URL лица согласно Character Brain v1. Этот контракт не меняет текущую запись или RLS.

## 19. Межобластные payload и ownership

### Область 01 → 02

Передаёт `SceneCharacterContextV1`: Character Brain revision, seed, primary identity reference, blueprint, immutable visual facts, wardrobe style, palette и negative prompt. Область 02 не обновляет память персонажа.

### Область 03 → 02

Передаёт `SceneReferenceQueryV1` и `content_item_id`. Получает selected reference summary, accepted output ID, attribution и status; не получает service-role Storage paths.

### Область 02 → 05

Передаёт утверждённый логический schema contract, требования уникальности fingerprint, RLS, private Storage, budget lock и retention. Область 05 проектирует физические миграции отдельным PR.

### Область 02 → 04

Передаёт состояния выбора/review, объяснение ranking, preview masks, оценку стоимости и предупреждения о лицензии. UI не меняет render plan скрыто.

## 20. Безопасность и отказоустойчивость

- Пользователь не может подменить `owner_id`, license verdict, Character Brain revision или Storage path в клиентском payload.
- Cache lookup, idempotency lookup и выдача output всегда фильтруются по server-side `owner_id`; fingerprint или idempotency key без tenant predicate не используются ни в одном trusted path.
- Результат другого владельца/команды никогда не возвращается, не присоединяется к request и не используется как cache hit, даже если fingerprint полностью совпадает.
- Service-role используется только worker/backend; signed URLs имеют минимальный TTL.
- Server-side preflight повторно проверяет права непосредственно перед dispatch.
- Retry имеет `max_attempts`; timeout не создаёт новый logical request.
- Удаление source запрещено при существующей usage/lineage; применяется archive/restrict.
- Результат всегда сохраняет synthetic provenance и не используется для имитации реального человека.
- Любой status `restricted` немедленно блокирует новые render requests и публикации из кэша.

## 21. Этапы будущей реализации

Этот PR не реализует этапы ниже.

1. Согласовать schema и границы с областями 01, 03 и 05.
2. В отдельном PR добавить физическую схему, RLS и private Storage paths.
3. Реализовать ingest с hash, license gate и metadata validation без GPU.
4. Реализовать structured search и объяснимый ranking без GPU.
5. Добавить idempotent render requests и cache lookup перед текущим Modal dispatch.
6. Добавить masks/inpainting и lineage, сохранив legacy scene path до миграции.
7. Зафиксировать контрольный набор и откалибровать provisional QA thresholds в рамках заранее утверждённого GPU-бюджета.

## 22. Definition of Done для reference-first v1

Reference-first v1 считается реализованным только когда:

- каждый scene render связан с immutable source version, license и change regions;
- locked regions технически защищены, а не описаны только prompt;
- character identity берётся из versioned Character Brain context;
- поиск воспроизводим и сохраняет score breakdown;
- одинаковый fingerprint внутри одного `owner_id` не создаёт второй GPU dispatch, а между владельцами остаётся изолированным;
- output содержит полную lineage и QA metrics;
- rejected output не попадает в повторный подбор;
- originals и license documents не публикуются напрямую;
- build/smoke проверки не запускают GPU;
- физическая схема, RLS, API, Modal и UI внедрены отдельными узкими PR.
