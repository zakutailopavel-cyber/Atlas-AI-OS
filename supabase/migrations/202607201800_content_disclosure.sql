-- Default AI-disclosure for every content item.
--
-- Additive only. Existing rows backfill to the same standard disclosure
-- text as new rows (no way to know per-row intent retroactively, so the
-- safe default is to disclose, not to leave it blank). Callers may
-- override the text per item; the column is never null.

alter table public.content_items
  add column disclosure text not null default
    'AI-generated content. This is a synthetic digital creator, not a real person.';
