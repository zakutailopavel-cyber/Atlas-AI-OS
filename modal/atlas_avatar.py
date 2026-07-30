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

@app.function(image=image, secrets=[modal.Secret.from_name("atlas-worker")])
@modal.fastapi_endpoint(method="POST")
async def submit(request: Request):
    if request.headers.get("x-atlas-secret") != os.environ["ATLAS_WORKER_SECRET"]:
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = await request.json()
    if payload.get("request", {}).get("kind") == "scene": SceneGenerator().generate.spawn(payload)
    else: AvatarGenerator().generate.spawn(payload)
    return {"accepted": True}
