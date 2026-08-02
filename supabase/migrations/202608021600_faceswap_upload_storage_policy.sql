-- Face-swap manual upload (PR #100) needs authenticated users to upload
-- their own base photo client-side from AvatarStudio's "Загрузить фото"
-- tab, directly to Supabase Storage. The existing "service uploads atlas
-- assets" policy (202607120700) only allows service_role (the Modal
-- worker) to write to atlas-assets -- authenticated browser uploads were
-- rejected by RLS ("new row violates row-level security policy"),
-- discovered during live verification of PR #100.
--
-- This adds a narrowly-scoped insert policy: authenticated users may only
-- write under the faceswap-uploads/ prefix, nowhere else in the bucket.
-- avatars/ and scenes remain service_role-only, unaffected.
create policy "authenticated uploads faceswap base photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'atlas-assets' and (storage.foldername(name))[1] = 'faceswap-uploads');
