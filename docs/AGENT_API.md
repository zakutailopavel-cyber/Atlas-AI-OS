# Atlas Agent API

## Purpose

The Agent API gives a trusted external automation client limited access to the running Atlas system without exposing a user password, browser session, Supabase service key, publishing credentials, or billing controls.

## Authentication

Every request must include:

```http
Authorization: Bearer <ATLAS_AGENT_TOKEN>
```

The token is stored only in the deployment environment and compared in constant time.

## Required server environment

- `ATLAS_AGENT_TOKEN` — long random secret, at least 32 characters.
- `ATLAS_AGENT_ACTOR_ID` — UUID used as `created_by` for audited writes.
- `ATLAS_AGENT_MODEL_IDS` — comma-separated model UUID allowlist. Use `*` only after an explicit owner decision.
- `ATLAS_AGENT_SCOPES` — comma-separated scopes. Recommended: `read,content:write,model:write,reference:write,generate`.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only Supabase key.

## Routes

- `GET /api/agent/status`
- `GET /api/agent/models`
- `PATCH /api/agent/models`
- `GET /api/agent/content`
- `POST /api/agent/content`
- `PATCH /api/agent/content`
- `GET /api/agent/jobs`
- `POST /api/agent/generate`
- `GET /api/agent/references`
- `POST /api/agent/references`

## Safety boundaries

- No direct social publishing.
- No payment or subscription access.
- No workspace/member administration.
- No destructive deletes.
- No automatic GPU calls from read routes.
- Generation requires `generate` and passes `is_over_budget` before queueing.
- Reads and writes are constrained by `ATLAS_AGENT_MODEL_IDS`.
- Every write is recorded in `agent_audit_log`; tokens and authorization headers are never stored.
