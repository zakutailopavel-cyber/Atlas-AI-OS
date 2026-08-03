# GPT image task flow

## Goal

Atlas stores image work, model identity and references. A custom GPT, Claude/MCP client or another external agent reads a queued task, generates an image, returns the result and moves the linked content item to review.

## Required environment variables

```text
ATLAS_AGENT_TOKEN=<random secret at least 32 characters>
ATLAS_AGENT_ACTOR_ID=<Atlas profile UUID>
ATLAS_AGENT_MODEL_IDS=<comma-separated model UUIDs or *>
ATLAS_AGENT_SCOPES=read,content:write,model:write,reference:write,generate,task:write,asset:write
ATLAS_AGENT_ASSET_HOSTS=<comma-separated HTTPS host allowlist for URL import>
SUPABASE_SERVICE_ROLE_KEY=<server-only Supabase service role key>
```

`ATLAS_AGENT_ASSET_HOSTS` is intentionally empty by default. URL import is refused until approved image hosts are explicitly listed. Signed upload URLs remain available without this allowlist.

## Custom GPT Actions setup

Import this schema:

```text
https://atlas.epkoolitus.ee/atlas-agent-openapi.yaml
```

Configure API-key authentication as Bearer and store `ATLAS_AGENT_TOKEN` in the GPT Action authentication settings.

Suggested GPT instructions:

1. Call `listImageTasks` with `next=true`.
2. If no task exists, report that the queue is empty and do not invent work.
3. Call `getImageTask` for the returned task ID.
4. Use the model profile, immutable identity facts and supplied references as the visual source of truth.
5. Call `updateImageTask` with `action=claim` before generation.
6. Generate one image unless the task explicitly requests alternatives.
7. Return the image to Atlas using either:
   - `importGeneratedImage` when the generated asset has an approved public HTTPS URL; or
   - `createResultUploadUrl` when the client can upload binary data.
8. Call `updateImageTask` with `action=complete` and the returned `public_url` or storage path.
9. Never publish content. Atlas moves linked content only to `review`.
10. On failure call `updateImageTask` with `action=fail` and a concise reason.

## API sequence

```text
GET  /api/agent/tasks?next=true
GET  /api/agent/tasks/{id}
PATCH /api/agent/tasks/{id} { "action": "claim" }
POST /api/agent/assets/import
  or
POST /api/agent/assets/upload-url
PATCH /api/agent/tasks/{id} { "action": "complete", ... }
```

## Storage and content behavior

On completion Atlas:

- marks the task `completed`;
- stores the result URL and optional storage path;
- creates a `model_references` entry;
- attaches the image to the linked `content_items` row when present;
- changes linked content status to `review`;
- writes an append-only audit record.

## Important platform limitation

A custom GPT can call Actions and can generate images in ChatGPT, but automatic transfer of the generated binary file into an Action is platform-dependent. The API therefore supports both URL import and signed binary upload. If ChatGPT does not expose a usable generated-image URL or binary upload step, the final upload remains a manual confirmation step in the chat. The Atlas side is prepared for full automation when the client exposes either transport.
