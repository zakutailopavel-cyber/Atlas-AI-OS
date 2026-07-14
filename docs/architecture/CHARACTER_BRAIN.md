# Character Brain — архитектурный контракт

Статус: **01-A, контракт v1.0 (documentation only)**

Область: **01 — AI-модели и Character Brain**

Дата: **2026-07-14**

Этот документ задаёт источник истины, поля, инварианты и потоки данных персонажа Atlas AI OS. Он не меняет текущий runtime, Supabase-схему, API, интерфейс или Modal. Названия целевых логических полей фиксируют контракт для следующих узких PR; до их внедрения действует таблица совместимости с текущим плоским `visual_passport`.

## 1. Границы ответственности

Character Brain отвечает за:

- идентичность вымышленного AI-персонажа;
- неизменяемые факты и биографическую непротиворечивость;
- развивающуюся память и текущую сюжетную линию;
- визуальную идентичность, seed и эталонное лицо;
- голос, словарь, ценности и ограничения общения;
- минимальные, детерминированные payload для контент-генератора и генератора сцен.

Character Brain не отвечает за:

- реализацию diffusion-пайплайна, IP-Adapter, img2img и GPU-кэш — область 02;
- календарь, статусы публикаций и хранение готового контента — область 03;
- формы и визуальное представление полей — область 04;
- миграции, RLS и физическую нормализацию схемы — область 05.

## 2. Фактическое состояние runtime на `main`

На снимке `1aadbb8` модель читается из `ai_models`. Полная базовая DDL для `ai_models` отсутствует в репозитории, поэтому фактический контракт восстанавливается по клиенту и API.

### 2.1. Текущие поля `ai_models`

| Поле | Текущий тип в клиенте | Использование |
| --- | --- | --- |
| `id` | `string` | Идентификатор модели; участвует в вычислении fallback seed и face blueprint |
| `name` | `string` | Имя персонажа |
| `handle` | `string \| null` | Публичный профиль/ник |
| `niche` | `string \| null` | Тематика персонажа |
| `bio` | `string \| null` | Краткое публичное описание |
| `status` | `string` | Сейчас используются `draft` и `active` |
| `visual_passport` | `Record<string, string> \| null` | Плоское JSON-хранилище Character Brain |
| `created_by` | `string` | Владелец записи |

### 2.2. Текущие ключи `visual_passport`

`seed`, `avatar`, `appearance`, `style`, `negative`, `audience`, `tone`, `values`, `biography`, `immutable_facts`, `interests`, `vocabulary`, `favorite_places`, `brands`, `forbidden_topics`, `storyline`.

Новая модель получает случайный шестизначный `seed` как строку. Все остальные поля вводятся вручную. Значения сохраняются одним JSON-объектом без версии схемы и без runtime-валидации.

### 2.3. Текущее потребление данных

| Потребитель | Что получает сейчас | Наблюдаемое ограничение |
| --- | --- | --- |
| Одиночный контент | Весь `body.model`, присланный клиентом | API не формирует минимальный server-side контекст и доверяет снимку клиента |
| План недели | Весь `body.model` и последние публикации | Весь `visual_passport` попадает в prompt без явной приоритизации полей |
| Портрет | `id`, `name`, весь `visual_passport`; prompt собирается из `appearance`, `style`, `immutable_facts`, вычисленного blueprint и seed | `negative` хранится, но не передаётся в Modal; blueprint вычисляется из `model.id`, но отдельно не хранится |
| Сцена | Эталонный `avatar`, `appearance`, `style`, framing и запрос сцены | `seed` передаётся, но SceneGenerator его не применяет; `immutable_facts` и `negative` не входят в итоговый scene prompt |

Эталонное лицо дублируется в `visual_passport.avatar` и в `model_references.kind = 'primary'`. Текущая база не гарантирует единственность `primary`, поэтому до будущей нормализации каноническим указателем runtime остаётся `visual_passport.avatar`.

## 3. Источник истины и жизненный цикл

1. `ai_models` является корневой записью персонажа.
2. Character Brain v1 логически хранится в `ai_models.visual_passport`.
3. `model_references` хранит происхождение и историю визуальных материалов, но не заменяет Character Brain.
4. `status = 'draft'` разрешает неполный профиль и запрещает автономную публикацию.
5. `status = 'active'` разрешён только после прохождения обязательных проверок из раздела 5.
6. `status = 'archived'` запрещает новые генерации, но сохраняет историю и воспроизводимость старого контента.

При конфликте данных действует строгий приоритет:

1. ограничения безопасности и disclosure;
2. неизменяемые факты;
3. визуальная идентичность;
4. подтверждённая память;
5. текущая сюжетная линия;
6. запрос конкретного материала или сцены;
7. предположение генератора.

Нижний уровень никогда не может молча переопределить верхний.

## 4. Канонический логический контракт v1

Следующий TypeScript-тип является нормативным описанием данных. Это логический контракт, а не утверждение, что вложенная структура уже сохранена в production.

```ts
type CharacterBrainV1 = {
  schema_version: "1.0";
  identity: {
    character_type: "fictional_ai";
    display_name: string;
    handle: string;
    niche: string;
    public_bio: string;
    biography: string;
    immutable_facts: ImmutableFactV1[];
    values: string[];
    forbidden_topics: string[];
    disclosure: {
      profile_label: "Virtual creator / AI-generated character";
      ai_generated: true;
      real_person_likeness: false;
    };
  };
  audience: {
    description: string;
    primary_language: string;
  };
  voice: {
    tone: string;
    vocabulary: string[];
    sentence_style: string;
    do: string[];
    dont: string[];
  };
  visual_identity: {
    seed: number;
    primary_reference_url: string;
    primary_reference_id: string | null;
    identity_blueprint: string;
    appearance: string;
    wardrobe_style: string;
    palette: string[];
    negative_prompt: string;
    origin: "synthetic";
  };
  memory: {
    revision: number;
    updated_at: string;
    storyline: string;
    goals: string[];
    interests: string[];
    habits: string[];
    favorite_places: string[];
    active_brand_relationships: BrandRelationshipV1[];
    recent_events: MemoryEventV1[];
  };
};

type ImmutableFactV1 = {
  key: string;
  value: string;
  locked: true;
};

type MemoryEventV1 = {
  id: string;
  fact: string;
  occurred_at: string;
  source_content_id: string | null;
  status: "proposed" | "approved" | "superseded";
};

type BrandRelationshipV1 = {
  brand: string;
  relationship: "mentioned" | "gifted" | "paid" | "ambassador";
  valid_from: string | null;
  valid_until: string | null;
  disclosure_required: boolean;
};
```

Массивы должны передаваться как массивы строк/объектов, а не как неструктурированный текст. Даты — ISO 8601 UTC. `seed` — целое число от `0` до `2^32 - 1`. URL эталонного лица должен указывать на доступный Atlas asset или на явно разрешённый источник.

## 5. Обязательные поля и валидация активации

### 5.1. Обязательны для любой записи

| Логическое поле | Правило |
| --- | --- |
| `schema_version` | Ровно `1.0`; legacy-запись без версии читается как текущий плоский формат, но не считается валидированной |
| `identity.character_type` | Только `fictional_ai` |
| `identity.display_name` | Непустое, не имитирует имя конкретного реального человека |
| `identity.public_bio` | Непустое и содержит понятное AI disclosure |
| `identity.disclosure.ai_generated` | Всегда `true` |
| `identity.disclosure.real_person_likeness` | Всегда `false` без отдельного юридически подтверждённого процесса, который не входит в v1 |
| `visual_identity.origin` | Только `synthetic` |
| `memory.revision` | Целое число, начинается с `1` |

### 5.2. Дополнительно обязательны для `active`

| Логическое поле | Правило |
| --- | --- |
| `handle`, `niche`, `audience.description` | Непустые |
| `biography` | Согласуется с immutable facts |
| `immutable_facts` | Содержит как минимум возраст/дату рождения, происхождение, текущее место жизни и занятие персонажа |
| `voice.tone`, `voice.sentence_style` | Непустые |
| `values` | Минимум одна ценность |
| `forbidden_topics` | Явный массив; может быть пустым, но не отсутствовать |
| `visual_identity.seed` | Валидное целое число |
| `visual_identity.primary_reference_url` | Непустой URL выбранного эталонного лица |
| `visual_identity.identity_blueprint` | Непустое описание геометрии и отличительных деталей лица |
| `visual_identity.appearance` | Непустое описание постоянных признаков внешности |
| `visual_identity.negative_prompt` | Содержит запреты на другое лицо, лишних людей, текст/watermark и неестественную кожу |
| `memory.storyline` | Непустое актуальное состояние персонажа |

## 6. Неизменяемые факты

Неизменяемыми считаются данные, изменение которых превращает персонажа в другого человека или нарушает уже опубликованную историю:

- дата рождения или зафиксированный возраст на базовую дату;
- страна/город происхождения;
- базовая семья и подтверждённые отношения;
- образование и основная профессия;
- ключевые события биографии;
- языки и культурный контекст;
- синтетическое происхождение и обязательный AI disclosure;
- отсутствие сходства с конкретным реальным человеком;
- постоянные физические признаки из `identity_blueprint` и `appearance`.

Каждый факт имеет стабильный `key`. Нельзя хранить два активных факта с одним `key`. Изменение требует ручного решения владельца, причины изменения и повышения `memory.revision`. Обычный генератор контента, недельный планировщик и генератор сцен не имеют права обновлять эти поля.

Возраст не должен вручную увеличиваться в каждом prompt. Контракт должен хранить либо дату рождения, либо `age_at_epoch` вместе с `epoch_date`; потребитель вычисляет актуальный возраст детерминированно. До внедрения структурированного поля текущий текст `immutable_facts` остаётся источником возраста.

## 7. Развивающаяся память

Развивающаяся память описывает состояние персонажа, которое может меняться без изменения его базовой идентичности:

- текущая сюжетная линия и цели;
- интересы и привычки;
- любимые места;
- недавние события;
- текущие брендовые отношения;
- освоенные навыки, поездки и изменения распорядка.

### 7.1. Правила обновления

1. Черновик, AI-ответ, shot list или сгенерированная сцена сами по себе не являются фактом.
2. Новый факт сначала создаётся как `proposed` и содержит источник.
3. Факт становится `approved` только после ручного подтверждения либо после публикации материала, который прошёл редакционное подтверждение.
4. Нельзя добавлять факт, противоречащий immutable facts.
5. Повторяющиеся факты объединяются; новый факт не должен дублировать существующий другими словами.
6. Изменившийся факт не удаляется бесследно: предыдущая запись получает `superseded`.
7. Любое принятое изменение повышает `memory.revision` на единицу и обновляет `memory.updated_at`.
8. Генераторы получают только `approved` события. `proposed` события остаются редакторским контекстом.
9. Память не должна утверждать реальный опыт использования продукта, поездку или событие без подтверждённого контентного источника.
10. Для `paid`, `gifted` и `ambassador` отношений `disclosure_required` всегда `true`; публикация должна получить `#ad`, `#reklaam` или платформенную маркировку согласно каналу.

## 8. Визуальная идентичность

### 8.1. Постоянные элементы

- `seed` — базовый детерминированный seed персонажа;
- `primary_reference_url` — единственное активное эталонное лицо;
- `identity_blueprint` — геометрия лица и отличительные детали;
- `appearance` — возраст, происхождение внешности, волосы, глаза, кожа, телосложение и другие постоянные признаки;
- `negative_prompt` — запреты, предотвращающие дрейф личности и дефекты;
- `origin = 'synthetic'` и `real_person_likeness = false`.

### 8.2. Изменяемые элементы

`wardrobe_style` и `palette` задают предпочтения, но конкретная одежда, поза, локация, свет, камера и действие принадлежат запросу сцены. Они не должны записываться в постоянную идентичность после одной генерации.

### 8.3. Правила эталонного лица

1. У персонажа ровно один активный primary reference.
2. Смена primary reference выполняется только явным действием пользователя.
3. Предыдущий primary сохраняется как обычный reference для аудита, но не передаётся генератору по умолчанию.
4. URL в Character Brain и запись `model_references.kind = 'primary'` должны указывать на один материал.
5. Источник должен сохранять provenance; нельзя строить процесс на удалении metadata/C2PA.
6. Нельзя использовать лицо реального человека без отдельного подтверждённого права. Для v1 допустим только синтетический персонаж.
7. Смена seed, blueprint или primary reference считается изменением визуальной идентичности и требует ручного подтверждения.

## 9. Голос и стиль общения

`voice` управляет текстом, но не визуальной генерацией.

| Поле | Назначение |
| --- | --- |
| `primary_language` | Язык ответа по умолчанию |
| `tone` | Эмоциональная манера: например, тёплая, уверенная, спокойная |
| `vocabulary` | Допустимые характерные слова и выражения |
| `sentence_style` | Длина фраз, ритм, обращение к аудитории, допустимость эмодзи |
| `do` | Положительные правила голоса |
| `dont` | Запрещённые обороты, обещания, имитация конкретного автора или реального человека |

Контент-генератор обязан сохранять голос, но не копировать узнаваемый стиль конкретного живого автора. Явное указание пользователя, противоречащее `dont`, `forbidden_topics`, disclosure или immutable facts, отклоняется либо отправляется на ручную проверку.

## 10. Payload контент-генератора

Контент-генератор должен получать server-side снимок Character Brain, а не произвольный полный объект от клиента.

```ts
type ContentCharacterContextV1 = {
  contract_version: "1.0";
  character_id: string;
  memory_revision: number;
  identity: {
    display_name: string;
    handle: string;
    niche: string;
    public_bio: string;
    biography: string;
    immutable_facts: ImmutableFactV1[];
    values: string[];
    forbidden_topics: string[];
    disclosure: CharacterBrainV1["identity"]["disclosure"];
  };
  audience: CharacterBrainV1["audience"];
  voice: CharacterBrainV1["voice"];
  memory: {
    storyline: string;
    goals: string[];
    interests: string[];
    habits: string[];
    favorite_places: string[];
    active_brand_relationships: BrandRelationshipV1[];
    approved_recent_events: MemoryEventV1[];
  };
  visual_direction: {
    appearance: string;
    wardrobe_style: string;
    palette: string[];
    negative_prompt: string;
  };
};
```

Не передаются: `created_by`, внутренние Supabase-поля, полный URL эталонного лица, неподтверждённые события и служебные данные генераций. `seed` не нужен для написания текста; он добавляется позднее при постановке визуального задания.

Результат контент-генератора не изменяет Character Brain. Он может вернуть отдельный список `memory_proposals`, но применение предложений относится к отдельному подтверждаемому workflow.

## 11. Payload генератора сцен

Генератор сцен получает только визуально необходимые поля и факты, влияющие на видимую непротиворечивость.

```ts
type SceneCharacterContextV1 = {
  contract_version: "1.0";
  character_id: string;
  memory_revision: number;
  seed: number;
  primary_reference: {
    url: string;
    reference_id: string | null;
  };
  identity_blueprint: string;
  appearance: string;
  immutable_visual_facts: string[];
  wardrobe_style: string;
  palette: string[];
  negative_prompt: string;
  request: {
    prompt: string;
    framing: "close_up" | "waist_up" | "full_body";
    style: string;
    source_reference_url: string | null;
  };
};
```

Не передаются: биография целиком, тон речи, словарь, аудитория, запрещённые текстовые темы и неподтверждённые события. Исключение — факт, который визуально обязателен для конкретной сцены; он включается в `immutable_visual_facts`.

Генератор обязан:

- использовать `seed` детерминированно либо явно записать, почему конкретный backend его не поддерживает;
- применять primary reference как единственный источник лица по умолчанию;
- объединять системный negative prompt с `visual_identity.negative_prompt`;
- не менять лицо, возрастные признаки и постоянные особенности из blueprint;
- сохранять provenance результата и связь с `character_id`, `memory_revision` и reference;
- не записывать результат обратно в память автоматически.

## 12. Совместимость с текущим плоским `visual_passport`

До внедрения структурированного v1 используется следующая однозначная карта:

| Текущее поле | Логическое поле v1 | Примечание |
| --- | --- | --- |
| `ai_models.name` | `identity.display_name` | Текущий источник истины |
| `ai_models.handle` | `identity.handle` | Текущий источник истины |
| `ai_models.niche` | `identity.niche` | Текущий источник истины |
| `ai_models.bio` | `identity.public_bio` | Должен получить AI disclosure до активации |
| `audience` | `audience.description` | Язык пока определяется запросом/каналом |
| `tone` | `voice.tone` | Плоский текст |
| `vocabulary` | `voice.vocabulary` | Сейчас плоский текст, целевой тип — массив |
| `values` | `identity.values` | Сейчас плоский текст, целевой тип — массив |
| `biography` | `identity.biography` | Плоский текст |
| `immutable_facts` | `identity.immutable_facts` | Сейчас плоский текст, целевой тип — массив объектов |
| `forbidden_topics` | `identity.forbidden_topics` | Сейчас плоский текст, целевой тип — массив |
| `seed` | `visual_identity.seed` | Сейчас строка, целевой тип — integer |
| `avatar` | `visual_identity.primary_reference_url` | Дублируется в `model_references` |
| `appearance` | `visual_identity.appearance` | Плоский текст |
| `style` | `visual_identity.wardrobe_style` | Palette пока включена в тот же текст |
| `negative` | `visual_identity.negative_prompt` | Сейчас не потребляется Modal |
| `interests` | `memory.interests` | Сейчас плоский текст |
| `favorite_places` | `memory.favorite_places` | Сейчас плоский текст |
| `brands` | `memory.active_brand_relationships` | Сейчас нет типа отношений и периода действия |
| `storyline` | `memory.storyline` | Текущий снимок без revision |

Поля `schema_version`, `character_type`, disclosure, `identity_blueprint`, `memory.revision`, `memory.updated_at`, structured events и provenance в текущем UI отсутствуют. Этот документ делает их обязательной целью контракта, но не объявляет уже работающими.

## 13. Инварианты для будущей реализации

1. Один `character_id` соответствует одному Character Brain.
2. Одна активная модель имеет ровно один primary reference.
3. `seed`, blueprint и primary reference не меняются автоматически.
4. Immutable facts не обновляются генераторами.
5. Память меняется только через versioned, подтверждаемый workflow.
6. Каждый downstream payload содержит `contract_version`, `character_id` и `memory_revision`.
7. Контент и сцены генерируются из server-side снимка, а не из непроверенного объекта клиента.
8. Публикации сохраняют AI disclosure; рекламные отношения требуют отдельной маркировки.
9. Персонаж не копирует лицо, голос, имя или узнаваемый стиль конкретного реального человека.
10. Генерация не удаляет provenance metadata и не маскирует синтетическое происхождение.

## 14. Следующие узкие этапы реализации

Этот PR не реализует перечисленные этапы:

1. Ввести TypeScript-типы, parser и server-side adapter `legacy visual_passport -> CharacterBrainV1` без миграции данных.
2. Формировать минимальный `ContentCharacterContextV1` на сервере.
3. Формировать `SceneCharacterContextV1`, применять seed и character negative prompt в области 02.
4. Добавить versioned memory proposals и ручное подтверждение.
5. Нормализовать primary reference и provenance совместно с областями 02/05.
6. Добавить проверку готовности `draft -> active` и обязательный AI disclosure.
