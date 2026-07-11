# Atlas Content Factory

An autonomous, multi-agent **content factory** for managing fictional AI personas, planning content, and preparing posts for multiple social networks. Built as an MVP with a clean, API-ready architecture so real integrations can be added later without rewriting the core.

> **Safety by design:** every persona is fictional/virtual, nothing publishes without **manual approval**, and all social publishing goes through **mock adapters** — no real network calls are made. This system is not for spam, deception, or deepfakes of real people.

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (light "strategy game" theme)
- **Prisma** ORM
- **SQLite** by default (zero-config). Switch to **Supabase/PostgreSQL** by changing one line — see below.
- Mock agents + mock social adapters (OpenAI/Anthropic API-ready)

## Modules

| Module | Route | Description |
| --- | --- | --- |
| Dashboard | `/` | Models, scheduled posts, trends, engagement, agent tasks |
| Model Manager | `/models` | Create, edit, delete virtual personas |
| Agent System | `/agents` | Live status of all 6 agents + run Trend Scout |
| Post Generator | `/generator` | Generate a draft post (chains 4 agents) |
| Content Calendar | `/calendar` | Approve / edit / reject / schedule / mock-publish |
| Analytics | `/analytics` | Top/weak posts, best topics/platforms, recommendations |

## The six agents

1. **Trend Scout** — discovers trending topics/formats per niche → `Trend`
2. **Content Strategist** — turns trends into a plan (format + goal) → `ContentIdea`
3. **Copywriter Agent** — captions, variants, CTAs, per-platform adaptation
4. **Visual Prompt Agent** — on-brand image/video prompts, never depicts real people
5. **Scheduler Agent** — suggests best times, builds the publish queue
6. **Analytics Agent** — mock metrics + recommendations

Each agent lives in `src/lib/agents/`. Every run is tracked (status + `ActionLog`) via `runAgent()` in `src/lib/agents/logger.ts`. To go live, replace the body of an agent's core function with a real LLM/API call — the surrounding orchestration stays the same.

## Getting started

Requires Node.js 18.18+.

```bash
# 1. Install dependencies (also runs `prisma generate`)
npm install

# 2. Create your env file
cp .env.example .env

# 3. Create the database schema (SQLite dev.db by default)
npm run db:push

# 4. Seed agents + two sample virtual models + a sample post
npm run db:seed

# 5. Run the dev server
npm run dev
```

Open http://localhost:3000.

## Full MVP flow to try

1. **Models** → create (or use a seeded) virtual persona.
2. **Agents** → run Trend Scout for a niche.
3. **Generator** → pick model + platform + goal + topic → **Generate** (draft is saved).
4. **Calendar** → **Approve** the draft → **Schedule** it → **Publish (mock)**.
5. **Analytics** → mock metrics + Analytics Agent recommendations appear after publishing.

Every step is logged in the `ActionLog` table.

## Switching to Supabase / PostgreSQL

1. In `prisma/schema.prisma`, change the datasource:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
2. In `.env`, set `DATABASE_URL` to your Supabase connection string.
3. Run `npm run db:push && npm run db:seed`.

Status-like fields are stored as strings (not native enums) so the schema is identical on SQLite and Postgres; allowed values are the source-of-truth unions in `src/lib/types.ts`.

## Connecting real social APIs later

`src/lib/adapters/` has one mock adapter per platform (Instagram, TikTok, YouTube Shorts, X, Telegram), all behind a shared `SocialAdapter` interface. To go live for a platform, rewrite that adapter's `publish()` with the official API call and remove `isMock`. The approval gate in the app stays intact: only **scheduled** posts (which required manual approval first) can be published.

## Project structure

```
prisma/
  schema.prisma        # User, AiModel, Agent, Trend, ContentIdea, Post,
                       # Schedule, AnalyticsRecord, PlatformAccount, ActionLog
  seed.ts
src/
  app/
    page.tsx           # Dashboard
    models/            # Model Manager
    agents/            # Agent System
    generator/         # Post Generator
    calendar/          # Content Calendar
    analytics/         # Analytics
    api/               # models, posts, generate, trends, schedule, analytics, agents
  components/          # Sidebar, StatCard, ModelCard, PostCard, AgentStatus, StatusBadge
  lib/
    prisma.ts          # Prisma client singleton
    types.ts           # Shared unions + labels
    agents/            # 6 mock agents + logger
    adapters/          # 5 mock social adapters
```

## Keeping a model's appearance consistent

Each model has a **visual passport** (character sheet) that locks its look:
age, face, hair, eyes, build, clothing style, a negative prompt, a **fixed seed**, and a **reference image**. The Visual Prompt Agent builds every prompt from this passport and always attaches the reference + seed — so only the scene changes between posts, never the person.

Workflow:

1. Open a model → **Open profile & gallery** (`/models/[id]`).
2. Fill in the **visual passport** fields (or edit them there).
3. In **Gallery**, add the model's look — **upload a file** or **paste an image URL**. The first image becomes the reference automatically; you can mark any image as the reference later.
4. The reference image becomes the model's **avatar** everywhere, and is passed to the Post Generator result as the look to match.
5. Reuse the shown **seed** + reference in your image tool (Midjourney `--cref`, Stable Diffusion img2img/reference, etc.) for repeatable faces.

Uploaded files are stored in `public/uploads/` and served locally. External URLs are stored as-is.

## Safety notes

- **Manual approval required** — a post can only leave `draft` through the approve endpoint; only `scheduled` posts can be (mock) published.
- **No auto-publishing** — there is no code path that publishes without a human action.
- **Action logging** — every agent and user action writes an `ActionLog` row.
- **Fictional personas** — model creation carries a disclosure/restrictions field; the Visual Prompt Agent explicitly refuses to depict real, identifiable people.
