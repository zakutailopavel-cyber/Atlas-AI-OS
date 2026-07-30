# Atlas Modal worker

1. Create a free Modal account and install the CLI: `python3 -m pip install modal`.
2. Authenticate: `modal setup`.
3. Create secret `atlas-supabase` with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
4. Create secret `atlas-worker` with `ATLAS_WORKER_SECRET`.
5. Create secret `atlas-bfl` with `BFL_API_KEY` (get a key at https://dashboard.bfl.ai — used only for face generation, billed per image by Black Forest Labs, full commercial rights included in the API price, no separate license needed).
6. Deploy: `modal deploy modal/atlas_avatar.py`.
7. Copy the endpoint URL into Vercel as `MODAL_AVATAR_URL`; add the same `ATLAS_WORKER_SECRET` to Vercel.

The endpoint acknowledges requests immediately. Face generation ("Создать лицо") calls Black Forest Labs' hosted FLUX.1 [dev] API — no GPU involved for this step, since the point was fixing face diversity/quality, not saving compute. Scene generation ("Создать сцену") still runs on a self-hosted SDXL + IP-Adapter pipeline on an A10G GPU, since that step needs face-locked image-to-image conditioning the FLUX API doesn't offer.
