import io
import os
import secrets
from datetime import datetime, timezone
import modal
from fastapi import Request, HTTPException

app = modal.App("atlas-avatar-generator")

def download_model():
    from diffusers import AutoPipelineForText2Image
    pipe = AutoPipelineForText2Image.from_pretrained("stabilityai/sdxl-turbo")
    pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter-plus-face_sdxl_vit-h.safetensors")

image = (modal.Image.debian_slim(python_version="3.11")
    .pip_install("torch", "diffusers", "transformers", "accelerate", "safetensors", "supabase", "pillow", "fastapi", "requests")
    .run_function(download_model))

@app.cls(image=image, gpu="A10G", scaledown_window=60, timeout=600,
         secrets=[modal.Secret.from_name("atlas-supabase"), modal.Secret.from_name("atlas-worker")])
class AvatarGenerator:
    @modal.enter()
    def load(self):
        import torch
        from diffusers import AutoPipelineForText2Image
        self.pipe = AutoPipelineForText2Image.from_pretrained(
            "stabilityai/sdxl-turbo", torch_dtype=torch.float16, variant="fp16"
        ).to("cuda")
        self.pipe.load_ip_adapter("h94/IP-Adapter", subfolder="sdxl_models", weight_name="ip-adapter-plus-face_sdxl_vit-h.safetensors")
        self.pipe.set_ip_adapter_scale(0.82)

    @modal.method()
    def generate(self, payload: dict):
        from supabase import create_client
        db = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
        job_id = payload["job_id"]
        now = lambda: datetime.now(timezone.utc).isoformat()
        db.table("generation_jobs").update({"status":"processing","started_at":now()}).eq("id", job_id).execute()
        try:
            request, model = payload["request"], payload["model"]
            memory = model.get("visual_passport") or {}
            is_scene = request.get("kind") == "scene"
            prefix = "editorial lifestyle photograph of the same fictional adult character" if is_scene else "professional headshot of one fictional adult character"
            prompt = (f"{prefix}, {request['prompt']}, {memory.get('appearance','')}, "
                      f"{memory.get('style','')}, {request.get('style','')}, photorealistic, natural skin texture, "
                      "editorial lighting, consistent facial identity, anatomically correct, no text")
            reference = None
            if is_scene and request.get("reference_url"):
                import requests
                from PIL import Image
                reference = Image.open(requests.get(request["reference_url"], timeout=30, stream=True).raw).convert("RGB")
            outputs = []
            for index in range(min(int(request.get("count", 4)), 4)):
                args = dict(prompt=prompt, num_inference_steps=4, guidance_scale=0.0, height=768, width=768)
                if reference is not None: args["ip_adapter_image"] = reference
                result = self.pipe(**args).images[0]
                buffer = io.BytesIO(); result.save(buffer, format="JPEG", quality=92)
                path = f"avatars/{model['id']}/{job_id}-{index}-{secrets.token_hex(3)}.jpg"
                db.storage.from_("atlas-assets").upload(path, buffer.getvalue(), {"content-type":"image/jpeg"})
                outputs.append(db.storage.from_("atlas-assets").get_public_url(path))
            db.table("generation_jobs").update({"status":"completed","output_urls":outputs,"completed_at":now()}).eq("id", job_id).execute()
        except Exception as error:
            db.table("generation_jobs").update({"status":"failed","error":str(error)[:500],"completed_at":now()}).eq("id", job_id).execute()
            raise

@app.function(image=image, secrets=[modal.Secret.from_name("atlas-worker")])
@modal.fastapi_endpoint(method="POST")
async def submit(request: Request):
    if request.headers.get("x-atlas-secret") != os.environ["ATLAS_WORKER_SECRET"]:
        raise HTTPException(status_code=401, detail="Unauthorized")
    payload = await request.json()
    AvatarGenerator().generate.spawn(payload)
    return {"accepted": True}
