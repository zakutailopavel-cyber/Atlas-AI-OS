-- Closes the drift documented in docs/architecture/RUNTIME_SCHEMA_DRIFT.md:
-- content_items.asset_url and content_items.review_comment are read/written
-- throughout dashboard.tsx (PostPreviewPanel, AvatarStudio scene attach) but
-- neither column was ever created by a migration. Every save silently
-- failed at the PostgREST layer (unknown column) and, per the drift doc,
-- could also drop the rest of that UPDATE's payload (title/caption/status/
-- publish_at) when bundled in the same request. This is exactly the Step 2
-- additive bridge migration the drift doc calls for: nullable, no default,
-- no backfill, no change to status/approval/Storage/existing rows.
alter table public.content_items
  add column if not exists asset_url text,
  add column if not exists review_comment text;
