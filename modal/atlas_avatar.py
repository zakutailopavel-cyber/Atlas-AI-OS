import io
import os
import re
import secrets
import time
from datetime import datetime, timezone
import modal
from fastapi import Request, HTTPException

app = modal.App("atlas-avatar-generator")

def download_models():
    from transformers import CLIPVisionModelWithProjection
    from diffusers import AutoPipelineForText2Image
    encoder = CLIPVisionModelWithProjection.from_pretrained("h94/IP-Adapter", subfolder="models/image_encoder")
    scene = AutoPipelineForText2Image.from_pretrained("stabilityai/stable-diffusion-xl-base-1.0", image_encoder=encoder)
    scene.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter-plus-face_sdxl_vit-h.safetensors")

image = (modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", "diffusers", "transformers", "accelerate", "safetensors", "supabase", "pillow", "fastapi", "requests")
    .run_function(download_models))

def database():
    from supabase import create_client
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

def save_results(db, payload, pictures):
    job_id, model = payload["job_id"], payload["model"]
    outputs = []
    for index, picture in enumerate(pictures):
        buffer = io.BytesIO(); picture.save(buffer, format="JPEG", quality=93)
        path = f"avatars/{model['id']}/{job_id}-{index}-{secrets.token_hex(3)}.jpg"
        db.storage.from_("atlas-assets").upload(path, buffer.getvalue(), {"content-type":"image/jpeg"})
        outputs.append(db.storage.from_("atlas-assets").get_public_url(path))
    db.table("generation_jobs").update({"status":"completed","output_urls":outputs,"completed_at":datetime.now(timezone.utc).isoformat()}).eq("id", job_id).execute()

BFL_API_BASE = "https://api.bfl.ai/v1"

# Face generation goes through Black Forest Labs' hosted FLUX.1 [dev] API
# instead of a locally-hosted checkpoint. Two reasons: RealVisXL_V4.0 has a
# strong "checkpoint face" bias that kept converging to a similar look across
# different AI-model identity prompts, and self-hosting FLUX.1 [dev] weights
# would require a separate commercial license from Black Forest Labs for use
# in a paid product. The hosted API bills per image ($0.025 at time of
# writing) and already includes full commercial usage rights — no GPU to
# manage for this step, no license to negotiate. Scene generation (below)
# still runs on the self-hosted SDXL + IP-Adapter pipeline, since that part
# does face-locked image-to-image work this API doesn't offer and wasn't
# the source of the reported problem.
@app.cls(image=image, scaledown_window=60, timeout=300,
         secrets=[modal.Secret.from_name("atlas-supabase"), modal.Secret.from_name("atlas-worker"), modal.Secret.from_name("atlas-bfl")])
class AvatarGenerator:
    @modal.method()
    def generate(self, payload: dict):
        import requests
        from PIL import Image
        db, job_id = database(), payload["job_id"]
        db.table("generation_jobs").update({"status":"processing","started_at":datetime.now(timezone.utc).isoformat()}).eq("id", job_id).execute()
        try:
            request = payload["request"]
            age_match = re.search(r"\b(\d{2})-year-old\b", request["prompt"], re.IGNORECASE)
            age = int(age_match.group(1)) if age_match else 30
            if age <= 30:
                age_anchor = f"exactly {age} years old, unmistakably a young adult woman in her twenties, youthful full cheeks, smooth firm forehead"
            elif age <= 39:
                age_anchor = f"exactly {age} years old, youthful adult woman in her thirties, firm natural skin"
            else:
                age_anchor = f"exactly {age} years old"
            prompt = (f"{age_anchor}, {request['prompt']}, single contemporary full-color portrait, exactly one woman, "
                      "exactly one face, frontal head-and-shoulders, warm natural light, neutral beige background, "
                      "realistic skin texture with visible pores, subtle natural facial asymmetry, shot on 85mm lens, "
                      "no text, no watermark, no collage, no grid, no multiple views, no split screen")
            base_seed = int(request.get("seed", 1))
            count = min(int(request.get("count", 1)), 3)
            headers = {"accept": "application/json", "x-key": os.environ["BFL_API_KEY"], "content-type": "application/json"}
            pictures = []
            for index in range(count):
                submitted = requests.post(f"{BFL_API_BASE}/flux-dev", headers=headers,
                    json={"prompt": prompt, "width": 1024, "height": 1024, "steps": 40,
                          "seed": base_seed + index * 9973}, timeout=30)
                submitted.raise_for_status()
                polling_url = submitted.json()["polling_url"]
                deadline = time.monotonic() + 120
                picture = None
                while time.monotonic() < deadline:
                    time.sleep(1.5)
                    poll = requests.get(polling_url, headers=headers, timeout=30).json()
                    status = poll.get("status")
                    if status == "Ready":
                        image_url = poll["result"]["sample"]
                        picture = Image.open(io.BytesIO(requests.get(image_url, timeout=30).content)).convert("RGB")
                        break
                    if status in ("Error", "Failed", "Content Moderated", "Request Moderated"):
                        raise RuntimeError(f"FLUX.1 [dev] generation failed: {poll}")
                if picture is None:
                    raise RuntimeError("FLUX.1 [dev] generation timed out")
                pictures.append(picture)
            save_results(db, payload, pictures)
        except Exception as error:
            db.table("generation_jobs").update({"status":"failed","error":str(error)[:500],"completed_at":datetime.now(timezone.utc).isoformat()}).eq("id", job_id).execute(); raise

@app.cls(image=image, gpu="A10G", scaledown_window=60, timeout=900,
         secrets=[modal.Secret.from_name("atlas-supabase"), modal.Secret.from_name("atlas-worker")])
class SceneGenerator:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import AutoPipelineForText2Image, AutoPipelineForImage2Image
        from transformers import CLIPVisionModelWithProjection
        encoder = CLIPVisionModelWithProjection.from_pretrained(
            "h94/IP-Adapter", subfolder="models/image_encoder", torch_dtype=torch.float16)
        self.pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0", image_encoder=encoder,
            torch_dtype=torch.float16, variant="fp16").to("cuda")
        self.pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter-plus-face_sdxl_vit-h.safetensors")
        # A slightly stronger face reference keeps the selected character stable
        # without preventing the scene prompt from changing clothing and setting.
        self.pipe.set_ip_adapter_scale(0.58)
        self.img2img = AutoPipelineForImage2Image.from_pipe(self.pipe)
        self.reference_cache = {}

    @modal.method()
    def generate(self, payload: dict):
        import requests
        from PIL import Image
        db, job_id = database(), payload["job_id"]
        db.table("generation_jobs").update({"status":"processing","started_at":datetime.now(timezone.utc).isoformat()}).eq("id", job_id).execute()
        try:
            request, model = payload["request"], payload["model"]
            memory = model.get("visual_passport") or {}
            reference_url = request["reference_url"]
            if reference_url not in self.reference_cache:
                self.reference_cache[reference_url] = Image.open(requests.get(reference_url, timeout=30, stream=True).raw).convert("RGB")
            reference = self.reference_cache[reference_url]
            framing = request.get("framing", "waist_up")
            framing_prompt = {
                "close_up": "tight head-and-shoulders portrait, face fills most of the image, eye-level camera",
                "waist_up": "medium waist-up portrait, woman fills most of the image, face large and clearly visible, eye-level camera",
                "full_body": "full-body portrait, entire woman visible, woman occupies at least two thirds of the image, face clearly visible",
            }.get(framing, "medium waist-up portrait, woman fills most of the image, face large and clearly visible, eye-level camera")
            prompt = (f"one adult woman only, {framing_prompt}, solo, exactly one person and one face, {request['prompt']}, "
                      f"same fictional character as reference, {memory.get('appearance','')[:140]}, {memory.get('style','')[:80]}, "
                      f"{request.get('style','')}, exact requested action and object, photorealistic editorial photography, "
                      "natural skin, correct anatomy, two hands, no text")
            negative = ("two people, multiple people, duplicate person, twins, extra face, reflected face, extra head, "
                        "extra arms, extra hands, extra fingers, fused body, wrong object, cup, mug, food, text, watermark, "
                        "plastic skin, illustration, low quality, blurry, collage, diptych, triptych, split screen, multiple panels")
            if framing != "full_body":
                negative += ", distant subject, tiny person, tiny face, extreme wide shot, excessive empty space, full body"
            source_url = request.get("source_url")
            if source_url:
                source = Image.open(requests.get(source_url, timeout=30, stream=True).raw).convert("RGB").resize((768, 1024))
                picture = self.img2img(prompt=prompt, negative_prompt=negative, image=source,
                                      ip_adapter_image=reference, strength=0.32,
                                      num_inference_steps=20, guidance_scale=5.5).images[0]
            else:
                picture = self.pipe(prompt=prompt, negative_prompt=negative, ip_adapter_image=reference,
                                    num_inference_steps=25, guidance_scale=6.0,
                                    height=1024, width=768).images[0]
            pictures = [picture]
            save_results(db, payload, pictures)
        except Exception as error:
            db.table("generation_jobs").update({"status":"failed","error":str(error)[:500],"completed_at":datetime.now(timezone.utc).isoformat()}).eq("id", job_id).execute(); raise

# --- Face-swap prototype (2026-08-02) --------------------------------------
# Spike for matching the quality bar of tools like Higgsfield: instead of
# generating a whole scene from a text prompt (SceneGenerator above, which
# struggles with crowds/complex backgrounds and hand anatomy), this takes an
# EXISTING real photo and re-renders only the face region with the model's
# identity, leaving lighting, shadows, background and everyone else in frame
# untouched. This is a PROTOTYPE ONLY: not wired into /api/avatar or
# generation_jobs yet, no UI trigger. Test it directly after `modal deploy`
# with:
#   modal run modal/atlas_avatar.py::test_faceswap \
#     --base-photo-url "<free-license test photo>" \
#     --identity-url "<model's canonical avatar URL>" \
#     --prompt "<short scene/mood description>"
#
# Base test photos must come from a free-license source (Unsplash/Pexels)
# and are for internal QA only. Publishing AI-edited real stock photos of
# identifiable bystanders in commercial content is a separate, unresolved
# licensing question -- do not wire this into production without deciding
# that first (see chat 2026-08-02).
#
# Uses IP-Adapter FaceID-Plus-v2 (stronger identity lock than the plain
# IP-Adapter-plus-face used by SceneGenerator) restricted to a masked face
# region via SDXL inpainting, so the rest of the photo is left alone.

def download_faceid_models():
    from transformers import CLIPVisionModelWithProjection
    from diffusers import AutoPipelineForInpainting
    from insightface.app import FaceAnalysis
    encoder = CLIPVisionModelWithProjection.from_pretrained("h94/IP-Adapter", subfolder="models/image_encoder")
    pipe = AutoPipelineForInpainting.from_pretrained("stabilityai/stable-diffusion-xl-base-1.0", image_encoder=encoder)
    pipe.load_ip_adapter("h94/IP-Adapter-FaceID", subfolder=None, weight_name="ip-adapter-faceid-plusv2_sdxl.bin", image_encoder_folder=None)
    # Pre-downloads insightface's buffalo_l detection/recognition pack so the
    # container doesn't fetch it from GitHub releases on every cold start.
    FaceAnalysis(name="buffalo_l", root="/root/.insightface").prepare(ctx_id=-1, det_size=(640, 640))

faceswap_image = (modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("torch", "diffusers", "transformers", "accelerate", "safetensors",
                 "supabase", "pillow", "fastapi", "requests",
                 "insightface==0.7.3", "onnxruntime-gpu", "opencv-python-headless")
    .run_function(download_faceid_models))


def build_face_mask(size, bbox, top_margin=0.22, bottom_margin=0.38, side_margin=0.16, feather=20):
    # Ellipse inscribed in the detected face bbox plus modest, ASYMMETRIC
    # padding -- more room below (chin/neck, for a clean blend) than above
    # (deliberately little, so the mask doesn't eat into the hairline) and
    # only a little to the sides (so it doesn't reach shoulders/collar/
    # clothing straps). The first version used a large symmetric expand
    # around the bbox center (1.7x width, ~2.3x height) which bled upward
    # into hair and sideways into clothing, producing a fused "hood"
    # artifact where the model blended a stray strap into the hairline.
    from PIL import Image, ImageDraw, ImageFilter
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    left = x1 - w * side_margin
    right = x2 + w * side_margin
    top = y1 - h * top_margin
    bottom = y2 + h * bottom_margin
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).ellipse([left, top, right, bottom], fill=255)
    return mask.filter(ImageFilter.GaussianBlur(feather))


@app.cls(image=faceswap_image, gpu="A10G", scaledown_window=60, timeout=900,
         secrets=[modal.Secret.from_name("atlas-supabase"), modal.Secret.from_name("atlas-worker")])
class FaceSwapGenerator:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import AutoPipelineForInpainting
        from transformers import CLIPVisionModelWithProjection
        from insightface.app import FaceAnalysis
        encoder = CLIPVisionModelWithProjection.from_pretrained(
            "h94/IP-Adapter", subfolder="models/image_encoder", torch_dtype=torch.float16)
        self.pipe = AutoPipelineForInpainting.from_pretrained(
            "stabilityai/stable-diffusion-xl-base-1.0", image_encoder=encoder,
            torch_dtype=torch.float16, variant="fp16").to("cuda")
        self.pipe.load_ip_adapter(
            "h94/IP-Adapter-FaceID", subfolder=None,
            weight_name="ip-adapter-faceid-plusv2_sdxl.bin", image_encoder_folder=None)
        self.pipe.set_ip_adapter_scale(0.8)
        self.face_app = FaceAnalysis(name="buffalo_l", root="/root/.insightface",
                                      providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
        self.face_app.prepare(ctx_id=0, det_size=(640, 640))

    def _largest_face(self, pil_image):
        import numpy as np, cv2
        cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
        faces = self.face_app.get(cv_image)
        if not faces:
            raise RuntimeError("No face detected in supplied photo")
        return cv_image, max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]))

    def _identity_crop(self, identity_image):
        # FaceID-Plus needs two separate things from the reference photo:
        # the insightface identity embedding (below) and this aligned CLIP
        # crop, which diffusers' IPAdapterFaceIDPlusImageProjection combines
        # internally -- it cannot be passed the normal way via
        # ip_adapter_image, that raises "Cannot leave both ip_adapter_image
        # and ip_adapter_image_embeds defined" from check_inputs().
        from PIL import Image
        import cv2
        from insightface.utils import face_align
        cv_image, face = self._largest_face(identity_image)
        crop = face_align.norm_crop(cv_image, landmark=face.kps, image_size=224)
        return face, Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))

    def _faceid_embeds(self, face, device):
        # Reproduces the diffusers IP-Adapter FaceID-Plus-v2 recipe: stack
        # the raw insightface identity embedding with a zeroed negative
        # counterpart (classifier-free guidance expects both halves
        # concatenated on dim 0, split back out by chunk(2) inside
        # prepare_ip_adapter_image_embeds).
        import torch
        embed = torch.from_numpy(face.normed_embedding).unsqueeze(0)
        ref = torch.stack([embed], dim=0).unsqueeze(0)
        neg = torch.zeros_like(ref)
        return torch.cat([neg, ref]).to(device=device, dtype=torch.float16)

    @modal.method()
    def swap(self, base_photo_url: str, identity_reference_url: str, prompt: str = "") -> bytes:
        import io, requests
        from PIL import Image
        base = Image.open(requests.get(base_photo_url, timeout=30, stream=True).raw).convert("RGB")
        identity = Image.open(requests.get(identity_reference_url, timeout=30, stream=True).raw).convert("RGB")
        device = "cuda"
        face, face_crop = self._identity_crop(identity)
        id_embeds = self._faceid_embeds(face, device)
        # The CLIP ("plus") half is injected by setting an attribute on the
        # projection layer directly, then only id_embeds goes through the
        # normal pipe() argument -- see IPAdapterFaceIDPlusImageProjection
        # .forward() in diffusers/models/embeddings.py.
        clip_embeds = self.pipe.prepare_ip_adapter_image_embeds(
            [face_crop], None, device, 1, True)[0]
        proj_layer = self.pipe.unet.encoder_hid_proj.image_projection_layers[0]
        proj_layer.clip_embeds = clip_embeds
        proj_layer.shortcut = True  # plusv2 variant uses the residual shortcut
        _, base_face = self._largest_face(base)
        mask = build_face_mask(base.size, [float(v) for v in base_face.bbox])
        full_prompt = (f"one adult woman, photorealistic face, same identity as reference photo, "
                        f"natural skin texture with visible pores, lighting matching the rest of the scene, "
                        f"{prompt}, correct anatomy, no text, no watermark")
        negative = ("plastic skin, illustration, extra face, distorted face, mismatched lighting, "
                    "seam, text, watermark, low quality, blurry, deformed, cartoon")
        result = self.pipe(
            prompt=full_prompt, negative_prompt=negative,
            image=base, mask_image=mask,
            ip_adapter_image_embeds=[id_embeds],
            strength=0.65, num_inference_steps=30, guidance_scale=5.0,
        ).images[0]
        buffer = io.BytesIO()
        result.save(buffer, format="JPEG", quality=93)
        return buffer.getvalue()


@app.local_entrypoint()
def test_faceswap(base_photo_url: str, identity_url: str, prompt: str = "", out: str = "faceswap_test.jpg"):
    data = FaceSwapGenerator().swap.remote(base_photo_url, identity_url, prompt)
    with open(out, "wb") as f:
        f.write(data)
    print(f"Saved {out} ({len(data)} bytes)")


@app.function(image=image, secrets=[modal.Secret.from_name("atlas-worker")])
@modal.fastapi_endpoint(method="POST")
async def submit(request: Request):
    if request.headers.get("x-atlas-secret") != os.environ["ATLAS_WORKER_SECRET"]:
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = await request.json()
    if payload.get("request", {}).get("kind") == "scene": SceneGenerator().generate.spawn(payload)
    else: AvatarGenerator().generate.spawn(payload)
    return {"accepted": True}
