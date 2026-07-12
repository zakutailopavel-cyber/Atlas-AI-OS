# Atlas Modal worker

1. Create a free Modal account and install the CLI: `python3 -m pip install modal`.
2. Authenticate: `modal setup`.
3. Create secret `atlas-supabase` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Create secret `atlas-worker` with `ATLAS_WORKER_SECRET`.
5. Deploy: `modal deploy modal/atlas_avatar.py`.
6. Copy the endpoint URL into Vercel as `MODAL_AVATAR_URL`; add the same `ATLAS_WORKER_SECRET` to Vercel.

The endpoint acknowledges requests immediately and processes four avatar candidates on an A10G GPU. Results are uploaded to `atlas-assets` and the Supabase job is marked completed.
