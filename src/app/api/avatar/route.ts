import {NextResponse} from "next/server";
import OpenAI from "openai";
import {createClient} from "@/utils/supabase/server";
export const runtime="nodejs";

async function session(){const supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();return {supabase,user}}

const SCENE_FRAMING={
  close_up:"tight head-and-shoulders portrait, face fills most of the frame, eye-level camera",
  waist_up:"medium waist-up portrait, subject fills most of the frame, face clearly visible, eye-level camera",
  full_body:"full-body portrait, entire person visible, subject occupies at least two thirds of the frame, face clearly visible",
} as const;
type SceneFraming=keyof typeof SCENE_FRAMING;
function sceneFraming(value:unknown):SceneFraming{return value==="close_up"||value==="full_body"?value:"waist_up"}

async function optimizeScenePrompt(source:string,framing:SceneFraming){
  if(!process.env.OPENAI_API_KEY)return source;
  try{
    const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await openai.responses.create({model:"gpt-5.4-mini",reasoning:{effort:"low"},store:false,max_output_tokens:120,instructions:"Convert the user's Russian scene request into one concise English image-generation prompt of no more than 38 words. Put the subject, exact action, required object and location first. Exactly one adult fictional woman. Preserve the required framing. Return only the prompt, no commentary.",input:`REQUIRED FRAMING: ${SCENE_FRAMING[framing]}\nSCENE: ${source}`});
    return response.output_text?.trim()||source;
  }catch{return source}
}

const FACE_BLUEPRINTS=[
  "oval face, high cheekbones, narrow straight nose, softly pointed chin, wide-set almond eyes",
  "heart-shaped face, broad forehead, low cheekbones, small upturned nose, rounded chin, close-set round eyes",
  "long rectangular face, strong jaw, prominent cheekbones, aquiline nose, deep-set hooded eyes",
  "round face, full cheeks, short broad nose, delicate jaw, large downturned eyes",
  "diamond-shaped face, narrow forehead, angular cheekbones, defined jaw, long nose, monolid eyes",
  "square face, broad jaw, subtle cheekbones, straight brows, compact nose, widely spaced eyes",
  "oblong face, tall forehead, flat cheekbones, wide nose bridge, thin lips, downturned almond eyes",
  "heart-shaped face, widow's peak, sharp cheekbones, small nose with rounded tip, full lips, hooded eyes",
  "round face, soft jawline, high round cheeks, button nose, narrow lips, upturned round eyes",
  "square-oval blend face, angular jaw, moderate cheekbones, straight wide nose, wide mouth, deep-set almond eyes",
  "narrow triangular face, pointed chin, low flat cheekbones, thin straight nose, thin upper lip, close-set eyes",
  "broad heart-shaped face, dimpled chin, high wide cheekbones, curved nose bridge, full lower lip, large round eyes",
];
const DISTINCTIVE_DETAILS=[
  "a faint beauty mark below the left eye and slight natural eyebrow asymmetry",
  "light freckles across the nose and a subtle cleft chin",
  "one eyebrow sits slightly higher and the nose has a tiny natural bump",
  "a small beauty mark on the right cheek and a softly asymmetric smile",
  "a tiny scar through the left eyebrow and slightly uneven eyebrow arches",
  "a defined cupid's bow and a subtly fuller lower lip",
  "a small gap between the front teeth visible when smiling and freckles on the cheeks",
  "a faint mole near the right corner of the mouth and slightly hooded left eyelid",
  "a thin scar along the jawline and naturally arched thick eyebrows",
  "a dimple on the left cheek only and a slightly crooked nose bridge",
  "sun-faded freckles across the shoulders and nose and a rounded nose tip",
  "a subtle birthmark on the neck and slightly uneven natural eyebrow shape",
];
function hash(value:string){return Array.from(value).reduce((result,char)=>(result*31+char.charCodeAt(0))>>>0,2166136261)}
function identityBlueprint(modelId:string){const value=hash(modelId);return `${FACE_BLUEPRINTS[value%FACE_BLUEPRINTS.length]}, ${DISTINCTIVE_DETAILS[(value>>>8)%DISTINCTIVE_DETAILS.length]}`}

// Cost governor estimate (USD per generation), same caveat as fan-reply's
// ledger entries: approximate, not exact billing reconciliation. "avatar"
// calls Black Forest Labs' hosted FLUX.1[dev] API (~$0.025/image per
// modal/atlas_avatar.py); "scene" and "faceswap" run on self-hosted Modal
// A10G GPU -- these are rounded up from raw GPU-second math to leave
// headroom for cold starts, since under-estimating defeats the point of a
// spend governor.
const GENERATION_COST_USD={avatar:0.025,scene:0.04,faceswap:0.06} as const;

async function optimizeAvatarPrompt(source:string,appearance:string,blueprint:string){
  if(!process.env.OPENAI_API_KEY)return `${source}. ${appearance}. Identity geometry: ${blueprint}`.slice(0,750);
  try{
    const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await openai.responses.create({model:"gpt-5.4-mini",reasoning:{effort:"low"},store:false,max_output_tokens:120,instructions:"Return one compact English SDXL prompt of at most 42 words. START with the exact age, then ancestry, face geometry, eyes, nose, lips, hair and skin. Use PROFILE as truth and include MANDATORY IDENTITY. Optional adjustments only refine it. One fictional woman, one face, frontal color portrait. No age-changing details, grids, labels or commentary.",input:`PROFILE: ${appearance}\nMANDATORY IDENTITY: ${blueprint}\nOPTIONAL ADJUSTMENTS: ${source||"none"}`});
    return response.output_text?.trim()||source;
  }catch{return `${source}. ${appearance}`.slice(0,650)}
}

export async function GET(){
  const {supabase,user}=await session();if(!user)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  await supabase.from("generation_jobs").update({status:"failed",error:"Modal не нашёл свободный GPU за 7 минут. Нажми «Повторить» — описание сцены сохранено."}).eq("status","queued").lt("created_at",new Date(Date.now()-7*60*1000).toISOString());
  const {data,error}=await supabase.from("generation_jobs").select("id,model_id,kind,prompt,style,status,output_urls,error,created_at").order("created_at",{ascending:false}).limit(24);
  if(error)return NextResponse.json({error:"Очередь генераций не настроена"},{status:503});return NextResponse.json({jobs:data||[]});
}

export async function POST(request:Request){
  const {supabase,user}=await session();if(!user)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  const body=await request.json(),kind=body.kind==="scene"?"scene":body.kind==="faceswap"?"faceswap":"avatar";
  if(!body.model_id)return NextResponse.json({error:"Выбери AI-модель"},{status:400});
  const {data:model}=await supabase.from("ai_models").select("id,name,visual_passport").eq("id",body.model_id).single();if(!model)return NextResponse.json({error:"Модель не найдена"},{status:404});
  if(kind==="avatar"&&!model.visual_passport?.appearance?.trim())return NextResponse.json({error:"Сначала заполни внешность в профиле AI-модели"},{status:400});
  if(kind==="scene"&&!body.prompt?.trim())return NextResponse.json({error:"Опиши сцену, одежду и действие"},{status:400});
  if(kind==="scene"&&!model.visual_passport?.avatar)return NextResponse.json({error:"Сначала выбери эталонное лицо"},{status:400});
  if(kind==="faceswap"&&!model.visual_passport?.avatar)return NextResponse.json({error:"Сначала выбери эталонное лицо"},{status:400});
  if(kind==="faceswap"&&!body.base_photo_url)return NextResponse.json({error:"Сначала загрузи фото"},{status:400});
  // Budget check happens before any paid generation is queued -- a retried
  // job creates a brand-new billed GPU/API call, so this has to gate job
  // creation itself, not just the first attempt. Same best-effort pattern
  // as /api/fan-reply: an RPC error logs and continues, a real breach blocks.
  const {data:overBudget,error:budgetError}=await supabase.rpc("is_over_budget",{target_model_id:model.id});
  if(budgetError)console.error("Budget check failed",budgetError);
  else if(overBudget)return NextResponse.json({error:"Достигнут установленный бюджетный лимит для этой модели. Подними лимит в budget_limits, чтобы продолжить генерацию."},{status:402});
  const blueprint=identityBlueprint(model.id as string);
  const profileAppearance=[model.visual_passport?.appearance,model.visual_passport?.style,model.visual_passport?.immutable_facts].filter(Boolean).join(". ");
  const framing=sceneFraming(body.framing);
  // faceswap doesn't run the scene/avatar prompt optimizers -- it's just an
  // optional short mood/lighting note layered onto an existing real photo,
  // not a from-scratch scene description.
  const optimizedPrompt=kind==="scene"?`${SCENE_FRAMING[framing]}, ${await optimizeScenePrompt(body.prompt,framing)}`:kind==="faceswap"?String(body.prompt||"").slice(0,200):await optimizeAvatarPrompt(body.prompt||"",profileAppearance,blueprint);
  const count=kind==="scene"||kind==="faceswap"?1:Math.min(Number(body.count)||1,3);
  const savedSeed=Number.parseInt(model.visual_passport?.seed||"",10);
  const seed=Number.isFinite(savedSeed)?savedSeed:hash(model.id as string);
  const {data:job,error}=await supabase.from("generation_jobs").insert({model_id:model.id,kind,prompt:body.prompt||"Профиль AI-модели",style:body.style||"photorealistic",count,status:"queued",created_by:user.id}).select("*").single();
  if(error)return NextResponse.json({error:"Очередь генераций не настроена"},{status:503});
  // Recorded at job creation, not on Modal success -- the GPU/API spend is
  // committed the moment the job is queued (Modal bills the run whether or
  // not it ultimately fails), which is exactly the retry-cost blind spot
  // budget_limits/is_over_budget above exists to close.
  const estimatedCost=kind==="avatar"?GENERATION_COST_USD.avatar*count:GENERATION_COST_USD[kind];
  const {error:ledgerError}=await supabase.from("cost_ledger").insert({model_id:model.id,category:"modal_image",provider:"modal",estimated_cost_usd:estimatedCost,request_ref:job.id,created_by:user.id});
  if(ledgerError)console.error("Cost ledger insert failed",ledgerError);
  if(process.env.MODAL_AVATAR_URL){try{const response=await fetch(process.env.MODAL_AVATAR_URL,{method:"POST",headers:{"content-type":"application/json","x-atlas-secret":process.env.ATLAS_WORKER_SECRET||""},body:JSON.stringify({job_id:job.id,model,request:{kind,prompt:optimizedPrompt,style:body.style,framing,count,seed,identity_blueprint:blueprint,reference_url:model.visual_passport?.avatar||null,source_url:body.source_url||null,base_photo_url:body.base_photo_url||null}})});if(!response.ok)throw new Error(`Modal ${response.status}`)}catch(error){await supabase.from("generation_jobs").update({status:"failed",error:error instanceof Error?error.message:"Облачный генератор недоступен"}).eq("id",job.id)}}
  return NextResponse.json({job,worker_connected:Boolean(process.env.MODAL_AVATAR_URL)});
}

export async function DELETE(request:Request){const {supabase,user}=await session();if(!user)return NextResponse.json({error:"Требуется авторизация"},{status:401});const id=new URL(request.url).searchParams.get("id");if(!id)return NextResponse.json({error:"Не указано задание"},{status:400});const {error}=await supabase.from("generation_jobs").delete().eq("id",id);if(error)return NextResponse.json({error:"Не удалось удалить"},{status:403});return NextResponse.json({deleted:true})}
