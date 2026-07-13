import {NextResponse} from "next/server";
import OpenAI from "openai";
import {createClient} from "@/utils/supabase/server";
export const runtime="nodejs";

async function session(){const supabase=await createClient(),{data:{user}}=await supabase.auth.getUser();return {supabase,user}}

async function optimizeScenePrompt(source:string){
  if(!process.env.OPENAI_API_KEY)return source;
  try{
    const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await openai.responses.create({model:"gpt-5.4-mini",reasoning:{effort:"low"},store:false,max_output_tokens:120,instructions:"Convert the user's Russian scene request into one concise English image-generation prompt of no more than 45 words. Put the subject, exact action, required object and location first. Include camera framing and lighting. Exactly one adult fictional woman. Return only the prompt, no commentary.",input:source});
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
];
const DISTINCTIVE_DETAILS=[
  "a faint beauty mark below the left eye and slight natural eyebrow asymmetry",
  "light freckles across the nose and a subtle cleft chin",
  "one eyebrow sits slightly higher and the nose has a tiny natural bump",
  "a small beauty mark on the right cheek and a softly asymmetric smile",
  "subtle under-eye creases and a tiny scar through the left eyebrow",
  "a defined cupid's bow and natural smile lines around the mouth",
];
function hash(value:string){return Array.from(value).reduce((result,char)=>(result*31+char.charCodeAt(0))>>>0,2166136261)}
function identityBlueprint(modelId:string){const value=hash(modelId);return `${FACE_BLUEPRINTS[value%FACE_BLUEPRINTS.length]}, ${DISTINCTIVE_DETAILS[(value>>>8)%DISTINCTIVE_DETAILS.length]}`}

async function optimizeAvatarPrompt(source:string,appearance:string,blueprint:string){
  if(!process.env.OPENAI_API_KEY)return `${source}. ${appearance}. Identity geometry: ${blueprint}`.slice(0,750);
  try{
    const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
    const response=await openai.responses.create({model:"gpt-5.4-mini",reasoning:{effort:"low"},store:false,max_output_tokens:180,instructions:"Turn the character profile into one concise English SDXL prompt, maximum 70 words, for a premium contemporary COLOR lifestyle portrait. Use the PROFILE as the source of truth; OPTIONAL ADJUSTMENTS may only refine it. The mandatory Identity geometry must make this person visibly distinct while remaining attractive and believable. Preserve explicit age, ancestry, face shape, eye color, nose, lips, hair, skin texture, freckles, moles and asymmetry. If age is absent, use 30. Exactly ONE fictional woman, ONE face, ONE frontal head-and-shoulders photo, warm neutral studio. No generic Instagram face, contact sheet, grid, labels or numbers. Return only the prompt.",input:`PROFILE: ${appearance}\nMANDATORY DISTINCT IDENTITY: ${blueprint}\nOPTIONAL ADJUSTMENTS: ${source||"none"}`});
    return response.output_text?.trim()||source;
  }catch{return `${source}. ${appearance}`.slice(0,650)}
}

export async function GET(){
  const {supabase,user}=await session();if(!user)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  await supabase.from("generation_jobs").update({status:"failed",error:"Превышено время ожидания"}).eq("status","queued").lt("created_at",new Date(Date.now()-10*60*1000).toISOString());
  const {data,error}=await supabase.from("generation_jobs").select("id,model_id,kind,prompt,style,status,output_urls,error,created_at").order("created_at",{ascending:false}).limit(24);
  if(error)return NextResponse.json({error:"Очередь генераций не настроена"},{status:503});return NextResponse.json({jobs:data||[]});
}

export async function POST(request:Request){
  const {supabase,user}=await session();if(!user)return NextResponse.json({error:"Требуется авторизация"},{status:401});
  const body=await request.json(),kind=body.kind==="scene"?"scene":"avatar";
  if(!body.model_id)return NextResponse.json({error:"Выбери AI-модель"},{status:400});
  const {data:model}=await supabase.from("ai_models").select("id,name,visual_passport").eq("id",body.model_id).single();if(!model)return NextResponse.json({error:"Модель не найдена"},{status:404});
  if(kind==="avatar"&&!model.visual_passport?.appearance?.trim())return NextResponse.json({error:"Сначала заполни внешность в профиле AI-модели"},{status:400});
  if(kind==="scene"&&!body.prompt?.trim())return NextResponse.json({error:"Опиши сцену, одежду и действие"},{status:400});
  if(kind==="scene"&&!model.visual_passport?.avatar)return NextResponse.json({error:"Сначала выбери эталонное лицо"},{status:400});
  const blueprint=identityBlueprint(model.id as string);
  const profileAppearance=[model.visual_passport?.appearance,model.visual_passport?.style,model.visual_passport?.immutable_facts].filter(Boolean).join(". ");
  const optimizedPrompt=kind==="scene"?await optimizeScenePrompt(body.prompt):await optimizeAvatarPrompt(body.prompt||"",profileAppearance,blueprint);
  const count=kind==="scene"?1:Math.min(Number(body.count)||1,3);
  const savedSeed=Number.parseInt(model.visual_passport?.seed||"",10);
  const seed=Number.isFinite(savedSeed)?savedSeed:hash(model.id as string);
  const {data:job,error}=await supabase.from("generation_jobs").insert({model_id:model.id,kind,prompt:body.prompt||"Профиль AI-модели",style:body.style||"photorealistic",count,status:"queued",created_by:user.id}).select("*").single();
  if(error)return NextResponse.json({error:"Очередь генераций не настроена"},{status:503});
  if(process.env.MODAL_AVATAR_URL){try{const response=await fetch(process.env.MODAL_AVATAR_URL,{method:"POST",headers:{"content-type":"application/json","x-atlas-secret":process.env.ATLAS_WORKER_SECRET||""},body:JSON.stringify({job_id:job.id,model,request:{kind,prompt:optimizedPrompt,style:body.style,count,seed,identity_blueprint:blueprint,reference_url:model.visual_passport?.avatar||null,source_url:body.source_url||null}})});if(!response.ok)throw new Error(`Modal ${response.status}`)}catch(error){await supabase.from("generation_jobs").update({status:"failed",error:error instanceof Error?error.message:"Облачный генератор недоступен"}).eq("id",job.id)}}
  return NextResponse.json({job,worker_connected:Boolean(process.env.MODAL_AVATAR_URL)});
}

export async function DELETE(request:Request){const {supabase,user}=await session();if(!user)return NextResponse.json({error:"Требуется авторизация"},{status:401});const id=new URL(request.url).searchParams.get("id");if(!id)return NextResponse.json({error:"Не указано задание"},{status:400});const {error}=await supabase.from("generation_jobs").delete().eq("id",id);if(error)return NextResponse.json({error:"Не удалось удалить"},{status:403});return NextResponse.json({deleted:true})}
