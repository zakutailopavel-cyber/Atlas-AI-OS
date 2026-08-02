-- Adds the "faceswap" kind so generation_jobs can track the manual-photo
-- face-swap prototype (chat 2026-08-02 / PR #100): the user uploads an
-- existing photo in AvatarStudio, /api/avatar submits it with
-- kind="faceswap", and Modal's FaceSwapGenerator re-renders only the face
-- region against that photo. Does not touch existing rows or the
-- 'avatar'/'scene' behaviour.
alter table public.generation_jobs
  drop constraint if exists generation_jobs_kind_check,
  add constraint generation_jobs_kind_check check (kind in ('avatar','scene','faceswap'));
