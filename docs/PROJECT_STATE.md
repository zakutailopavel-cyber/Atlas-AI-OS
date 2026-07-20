# Atlas AI OS — состояние проекта

> Единая память проекта для всех рабочих чатов. Перед началом работы каждый чат обязан прочитать этот файл вместе с актуальным `main` и открытыми PR. После существенного изменения автор обновляет только затронутые разделы и добавляет одну строку в журнал.

## Паспорт проекта

- Репозиторий: https://github.com/zakutailopavel-cyber/Atlas-AI-OS
- Production: https://atlas.epkoolitus.ee
- Основной стек: Next.js 16, React 19, TypeScript, Supabase, Vercel, Modal GPU, OpenAI API.
- Основная ветка: `main`.
- Подтверждённый снимок `main`: `4921e5b` от 2026-07-20 — PR #77 синхронизировал состояние после PR #75; production/Supabase Cloud, RLS cutover, OpenAI и Modal не запускались.
- Production на момент проверки 2026-07-13 отвечает и перенаправляет неавторизованного пользователя на `/login`.

## Как пользоваться этим файлом

1. Перед работой получить актуальный `main`, прочитать этот файл и проверить открытые PR.
2. Работать только в отдельной ветке `agent/<краткая-задача>`.
3. Не менять блоки других областей без согласования с координатором.
4. Перед публикацией проверить хотя бы релевантные тесты и `npm run build`. GPU не запускать только ради проверки.
5. Создать draft PR и указать: что сделано, какие файлы затронуты, что проверено, риски и следующие шаги.
6. После существенного изменения обновить свою строку в таблице областей, затронутые риски/приоритеты и журнал ниже.
7. Не превращать файл в полный changelog: хранить только актуальное состояние и не более 15 последних записей.
8. Снимок `main` обновляет координатор после слияния PR. Состояние из незамёрженного PR нельзя описывать как уже работающее в production.

## Продуктовое назначение

- Активная продуктовая стратегия зафиксирована в [`docs/PRODUCT_STRATEGY.md`](./PRODUCT_STRATEGY.md): целевая ёмкость Atlas — портфель из 10 различимых и внутренне identity-consistent AI-персонажей вместо одного персонажа или массовой сети аккаунтов.
- Atlas — внутренняя многопользовательская контент-фабрика владельца для роста и монетизации аудитории; это не SaaS для внешних клиентов.
- Каждый персонаж имеет отдельные Character Brain, reference set, голос, нишу, бюджет и аналитику; память, референсы и метрики персонажей не смешиваются.
- Аккаунты подключаются этапами `1 → 3 → 10` только после проверки compliance и экономики предыдущего этапа.
- Fanvue рассматривается как стартовый кандидат, но запуск требует ручной проверки актуальных правил, KYC одного верифицированного владельца и официального AI-disclosure. Платформенные правила и комиссии считаются изменяемыми.
- Ban-evasion, ложные личности, proxy/device-fingerprint инфраструктура и искусственная координация аккаунтов запрещены.
- Помощники работают по ограниченным ролям; `workspaces`, membership и роли нужны для внутреннего разделения доступа, а не для продажи платформы.
- Главные продуктовые показатели: стабильный выпуск одобренного контента, удержание и конверсия аудитории, ручное качество общения и себестоимость производства.
- Финансовая цель около $2 000 чистыми в месяц является рабочей гипотезой, а не обещанием; масштабирование разрешается только по фактическим данным воронки, выручки и расходов.

## Архитектура сейчас

- `src/app/dashboard.tsx` — основной клиентский интерфейс и большая часть пользовательских сценариев.
- `src/app/api/generate/route.ts` — генерация контент-пакета через OpenAI.
- `src/app/api/plan-week/route.ts` — недельное планирование контента.
- `src/app/api/avatar/route.ts` — очередь портретов и сцен, связь Supabase с Modal.
- `modal/atlas_avatar.py` — Modal A10G: RealVisXL для портретов, SDXL + IP-Adapter для сцен, img2img для работы от исходного кадра.
- Supabase хранит пользователей, AI-модели, контент, задания генерации и материалы; Storage bucket `atlas-assets` используется для изображений.
- Vercel размещает Next.js-приложение; закрытая часть защищена Supabase Auth.

## Состояние областей

| Область | Ответственность | Текущее состояние | Ближайший фокус |
| --- | --- | --- | --- |
| 00 — Координатор | Архитектура, приоритеты, roadmap, контроль PR | 00-I: стратегия переведена на целевую ёмкость 10 раздельных AI-персонажей с поэтапной активацией `1 → 3 → 10`, единым верифицированным владельцем и обязательным AI-disclosure; состояние остаётся документационным до merge draft PR | Следующий этап — 04-C: портфельный интерфейс управления 10 персонажами с раздельными Brain/reference/voice/niche, бюджетами, compliance и аналитикой |
| 01 — AI-модели и Character Brain | Профили, внешность, seed, эталонное лицо, память | Подготовлен контракт Character Brain v1: обязательные поля, immutable facts, versioned memory, visual identity, voice и минимальные payload | Реализовать server-side legacy adapter без изменения данных |
| 02 — Сцены и референсы | Modal, IP-Adapter/InstantID, сцены, улучшение, кэш | Подготовлен reference-first контракт: versioned источники, metadata, лицензии, change regions, подбор, дедупликация и QA лица/сцены | Согласовать целевую схему и реализовать ingest + cache preflight без GPU |
| 03 — Контент-фабрика | Публикации, тексты, изображения, материалы, календарь | Подготовлен контракт Content Pipeline v1: единый lifecycle, ручной approval, межобластные payload и idempotency генерации/публикации | Согласовать статусы и реализовать server-side revisions + approval gate без изменения UI |
| 04 — Интерфейс Atlas | Дизайн, адаптивность, модальные окна, карточки | 04-B-1, 04-B-2 и 04-B-3 завершены; PR #69 устранил 2 ошибки `react-hooks/purity`, соответствующий baseline удалён; осталось 2 ошибки `react-hooks/set-state-in-effect` | Отдельно устранить только `set-state-in-effect`, сохранив текущее поведение и не меняя DOM/CSS/API/runtime |
| 05 — Backend и инфраструктура | Supabase, Storage, RLS, Vercel, Modal, auth, расходы | 05-K завершена и PR #75 слит: documentation-only ownership backfill plan фиксирует ручное назначение workspace каждой модели, parent-only наследование и quarantine; backfill не выполнялся | Подготовить отдельную counts-only read-only preflight specification и изолированный rehearsal без production; production execution и RLS cutover запрещены без backup/PITR gate, `created_by` нельзя автоматически использовать как `owner_id` |

## Открытые PR и решения

- PR #71 слит в `main`: `docs/PRODUCT_STRATEGY.md` стал активным roadmap — один персонаж до подтверждённой экономики, ручные compliance/approval gates и последовательное внедрение Assistant, Cost Governor и Funnel Analytics.
- PR #73 слит в `main`: 05-J добавила nullable `owner_id` bridge в `ai_models`, `generation_jobs` и `model_references` без backfill, RLS cutover и production-доступа; `created_by` запрещено автоматически использовать как `owner_id`.
- PR #75 слит в `main`: 05-K завершила documentation-only ownership backfill plan; backfill, production/Supabase Cloud, RLS cutover, OpenAI и Modal не запускались.
- PR #53 слит в `main`: Project state workflow запускается на каждом PR.
- PR #67 слит в `main`: lint non-regression baseline обязателен внутри required check `build`; новые findings сверх baseline блокируют merge.
- PR #69 слит в `main`: `react-hooks/purity` = 0; lint baseline уменьшен до двух ошибок `react-hooks/set-state-in-effect` и восьми предупреждений.
- PR #51 слит в `main`: добавлены Atlas issue/PR templates и workflow проверки PROJECT_STATE.md.
- PR #50 закрыт без merge.
- PR #44, #45, #46, #47, #49, #51, #53, #55, #57, #58, #60, #62, #64, #65, #66, #67, #69, #70, #71, #72, #73 и #75 слиты в `main`; актуальный подтверждённый `main` — `c5b450b`.
- На момент стартовой проверки Issue #76 открытых PR не было.
- Issue #56 выполнена и PR #57 слит; Issue #59 закрыт после PR #60: production reconciliation остановлен, потому что Supabase Free Plan не предоставляет backups/PITR.
- Read-only проверка GitHub ruleset `Protect main` 2026-07-17 подтвердила `active` enforcement для default branch, обязательный PR, запрет branch deletion/non-fast-forward и required status checks `build` + `check-project-state`.
- Каждый новый PR должен быть узким и относиться к одной области. Межобластные изменения сначала согласуются в области 00.

## Известные риски и технический долг

### P0 — блокирует надёжную параллельную разработку

- Открытых P0-блокеров координации и воспроизводимой сборки на текущем `main` не зафиксировано. Lint non-regression baseline действует в required CI; существующий долг уменьшается отдельными узкими задачами.

### P1 — высокий риск конфликтов и расходов

- `src/app/dashboard.tsx` содержит более 1300 строк и объединяет несколько областей, поэтому параллельные PR будут часто конфликтовать.
- Нет централизованного учёта стоимости OpenAI/Modal и пользовательских лимитов.
- Повтор задания создаёт новую GPU-генерацию; нужны защита от случайных повторов и понятная оценка стоимости до запуска.
- Качество и сохранение идентичности оцениваются вручную; нет набора контрольных сцен и метрик сравнения.

## Текущие приоритеты

1. P0: выполнить 04-C — спроектировать портфельный интерфейс управления 10 персонажами без смешивания их identity, бюджетов, compliance и аналитики.
2. P0: подготовить counts-only read-only preflight specification и изолированный rehearsal для ownership backfill; production execution и RLS cutover запрещены без backup/PITR gate, а `created_by` нельзя автоматически использовать как `owner_id`.
3. P0: реализовать Content Pipeline v1 с раздельным character scope — server-side revisions, hash-bound ручной approval и корректное отображение ошибок без автопубликации.
4. P1: добавить обязательный AI-disclosure в publish payload и ручную проверку актуальных правил/KYC выбранной площадки перед запуском.
5. P1: реализовать Fan Interaction Assistant только в режиме предложения ответа с ручным подтверждением; авто-DM, авто-PPV и автономная публикация запрещены на первом этапе.
6. P1: добавить Cost Governor с отдельными лимитами персонажей и портфеля, защитой повторов и приблизительным учётом себестоимости.
7. P1: добавить Funnel Analytics отдельно по каждому персонажу и агрегированно по портфелю: источник трафика → переход → подписка/выручка, без преждевременной сложной автоматизации.
8. P1: оставшийся UI/lint debt и декомпозицию `dashboard.tsx` вести отдельными механическими задачами, не подменяя ими продуктовый MVP.
9. P1: production migration-history reconciliation, `db push` и применение migration `0900` остаются запрещены без нового backup/PITR gate.

## Бюджетные ограничения

- Не запускать Modal GPU для smoke-тестов интерфейса, сборки или проверки БД.
- По умолчанию генерировать один результат; серии из нескольких изображений требуют явного выбора пользователя.
- Повторно использовать уже сохранённые референсы, результаты и кэш, если задача не требует новой генерации.
- Любая новая GPU-функция должна иметь лимит, таймаут, обработку повторов и приблизительный учёт стоимости.
- Не тестировать качество на production без заранее описанного минимального набора контрольных генераций.

## Журнал существенных изменений

| Дата | Область | Состояние | Изменение | PR/коммит |
| --- | --- | --- | --- | --- |
| 2026-07-20 | 00 | В работе | 00-I переводит стратегию Atlas на портфель из 10 различимых и identity-consistent AI-персонажей: отдельные Brain/reference/voice/niche, бюджеты и аналитика, один верифицированный владелец, официальный AI-disclosure и этапы `1 → 3 → 10`; ban-evasion, ложные личности, proxy/device-fingerprint инфраструктура и искусственная координация запрещены; следующий этап — 04-C | Task 00-I / draft PR |
| 2026-07-20 | 00 | В работе | 00-H синхронизировала PROJECT_STATE после merge PR #75: подтверждён `main` `c5b450b`, 05-K завершена; backfill, production/Supabase Cloud, RLS cutover, OpenAI и Modal не запускались | Issue #76 / draft PR |
| 2026-07-19 | 05 | Завершено | PR #75 слит: 05-K зафиксировала documentation-only ownership backfill plan с ручным model-to-workspace manifest, parent-only наследованием, quarantine, counts/invariants/rollback и ручными gates; backfill и production-действия не выполнялись | PR #75 / `c5b450b` |
| 2026-07-19 | 05 | Завершено | PR #73 слит: 05-J добавила nullable `owner_id` bridge в `ai_models`, `generation_jobs` и `model_references` без backfill, RLS cutover и production-доступа; следующий этап — только read-only ownership-классификация и вручную gated backfill-план без автоматического `created_by` → `owner_id` | PR #73 / `3bc3b2b` |
| 2026-07-19 | 00 | Завершено | PR #71 слит в `main` `7c04054`: активирована стратегия малого масштаба — один персонаж до подтверждённой экономики, Fanvue как проверяемый кандидат, ручной approval, затем Fan Interaction Assistant, Cost Governor и Funnel Analytics; production и платные API не запускались | PR #71 / `7c04054` |
| 2026-07-19 | 04 | Завершено | PR #69 слит в `main` `4651d53`: 04-B-3 устранила 2 ошибки `react-hooks/purity`, baseline purity удалён; `set-state-in-effect`, DOM/CSS/API/runtime, production, Supabase Cloud, OpenAI и Modal не менялись | PR #69 / `4651d53` |
| 2026-07-19 | 00 | Завершено | PR #67 слит в `main` `6f9e39d`: required CI `build` теперь блокирует новые lint findings сверх baseline; ESLint-правила, UI/runtime, production, Supabase Cloud, OpenAI и Modal не менялись | PR #67 / `6f9e39d` |
| 2026-07-18 | 04 | Завершено | PR #65 слит: 04-B-2 добавила только осмысленные `alt` четырём существующим `<img>`; `jsx-a11y/alt-text` = 0, React keys, DOM/CSS/API/runtime, production, Supabase Cloud, OpenAI и Modal не менялись | PR #65 / `a23d425` |
| 2026-07-18 | 04 | Завершено | PR #62 слит: 04-B-1 механически добавила стабильные React keys для 13 JSX-итераций в `src/app/dashboard.tsx`; `react/jsx-key` = 0, DOM/CSS/API/runtime, production, OpenAI и Modal не менялись | PR #62 / `104bc59` |
| 2026-07-18 | 00 | Завершено | PR #60 слит и Issue #59 закрыт: production reconciliation остановлен из-за отсутствия backups/PITR на Supabase Free Plan; production migration repair, `db push`, migration `0900`, production/Supabase Cloud, OpenAI и Modal не запускались; следующий безопасный этап — 04-B | PR #60 / `ebf2590` |
| 2026-07-18 | 05 | Завершено | PR #57 слит: GitHub Actions rehearsal run `29614156122` подтвердил одинаковый schema hash до/после, history ровно `0600`, `0700`, `0800` и pending `0900`; production/Supabase Cloud не подключались | PR #57 / `8d838a1` |
| 2026-07-17 | 00 | Завершено | PR #55 слит: подтверждённый `main` — `b4c665a`, активная защита `main` зафиксирована; следующий текущий review — draft PR #57 для Issue #56 | PR #55 / `b4c665a` |
| 2026-07-17 | 00 | Завершено | PR #53 слит: Project state workflow запускается на каждом PR; GitHub ruleset `Protect main` настроен вручную без изменений из этого PR | PR #53 / `5a0988b` |
| 2026-07-17 | 05 | Завершено | PR #49 слит: additive tenant foundation `0900` вошла в `main`; без backfill, runtime/UI, production cutover и production-доступа | PR #49 / `792c35d` |
| 2026-07-17 | 00 | Завершено | Подтверждён `main` `0022900`: PR #47 слит после PR #44–#46; открыт draft PR #49, его изменения не считаются состоянием `main` | PR #47 / `0022900` |

## Шаблон передачи состояния после работы

Добавляйте в описание draft PR и при необходимости в этот файл:

```text
Область:
Цель:
Что изменено:
Что не изменялось:
Проверки:
Расход GPU/API:
Риски или миграции:
Следующий шаг:
```
