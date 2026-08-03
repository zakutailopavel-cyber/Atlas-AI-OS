"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";

type Model = { id:string; name:string; handle:string|null; niche:string|null; bio:string|null; status:string; visual_passport:Record<string,string>|null };
type Reference = { id:string; model_id:string; storage_path:string; kind:string; generation_job_id?:string|null; created_at:string };
type Item = { id:string; model_id:string|null; title:string; platform:string|null; format:string|null; status:string; caption?:string|null; visual_prompt?:string|null; shot_list?:string[]|null; disclosure?:string|null; trend_note?:string|null; asset_url:string|null; publish_at:string|null; created_at:string };
type Account = { id:string; model_id:string; platform:string; handle:string };
type Job = { id:string; model_id:string; kind:"avatar"|"scene"|"faceswap"; prompt:string; style:string; status:string; output_urls:string[]|null; error?:string|null; created_at:string };
type Action = Job["kind"]|"week"|null;
type WeekPost = { day_offset:number; publish_time:string; title:string; platform:string; format:string; hook:string; caption:string; cta:string; hashtags:string[]; visual_prompt:string; shot_list:string[]; disclosure:string };
type WeekPlan = { week_theme:string; strategy:string; posts:WeekPost[] };

const platformLabels:Record<string,string>={instagram:"Instagram",tiktok:"TikTok",telegram:"Telegram",youtube_shorts:"YouTube Shorts",reddit:"Reddit",x:"X",fanvue:"Fanvue"};
const kindLabel:Record<Job["kind"],string>={avatar:"Лицо",scene:"Сцена",faceswap:"Фото"};

async function requestJobs():Promise<Job[]>{
  const response=await fetch("/api/avatar",{cache:"no-store"});
  if(!response.ok)throw new Error("Не удалось загрузить очередь");
  const data=await response.json();
  return data.jobs||[];
}

function readiness(model:Model,refs:Reference[],items:Item[],accounts:Account[]){
  const brain=[model.bio,model.visual_passport?.appearance,model.visual_passport?.tone,model.visual_passport?.biography,model.visual_passport?.storyline].filter(value=>String(value||"").trim()).length;
  const checks=[brain>=4,Boolean(model.visual_passport?.avatar),refs.length>=3,accounts.length>0,items.length>0];
  return Math.round(checks.filter(Boolean).length/checks.length*100);
}

export default function AtlasStudioClient({models:initialModels,references:initialReferences,items:initialItems,accounts}:{models:Model[];references:Reference[];items:Item[];accounts:Account[]}){
  const supabase=useMemo(()=>createClient(),[]);
  const [models,setModels]=useState(initialModels),[references,setReferences]=useState(initialReferences),[items,setItems]=useState(initialItems);
  const [modelId,setModelId]=useState(initialModels[0]?.id||""),[jobs,setJobs]=useState<Job[]>([]),[jobsError,setJobsError]=useState("");
  const [action,setAction]=useState<Action>(null),[prompt,setPrompt]=useState(""),[style,setStyle]=useState("Фотореалистичный lifestyle"),[framing,setFraming]=useState("waist_up"),[photo,setPhoto]=useState<File|null>(null),[targetItemId,setTargetItemId]=useState("");
  const [busy,setBusy]=useState(false),[actionError,setActionError]=useState(""),[notice,setNotice]=useState("");
  const [weekTheme,setWeekTheme]=useState(""),[weekGoal,setWeekGoal]=useState("Рост аудитории и укрепление образа модели"),[weekStart,setWeekStart]=useState(()=>new Date().toISOString().slice(0,10)),[weekPlan,setWeekPlan]=useState<WeekPlan|null>(null);

  useEffect(()=>{
    let active=true;
    async function poll(){
      try{const next=await requestJobs();if(active){setJobs(next);setJobsError("")}}
      catch(error){if(active)setJobsError(error instanceof Error?error.message:"Ошибка очереди")}
    }
    poll();
    const timer=window.setInterval(poll,10000);
    return()=>{active=false;window.clearInterval(timer)};
  },[]);

  async function refreshJobs(){try{setJobs(await requestJobs());setJobsError("")}catch(error){setJobsError(error instanceof Error?error.message:"Ошибка очереди")}}

  const model=models.find(entry=>entry.id===modelId)||models[0];
  const ownReferences=useMemo(()=>references.filter(entry=>entry.model_id===model?.id),[references,model?.id]);
  const ownItems=useMemo(()=>items.filter(entry=>entry.model_id===model?.id),[items,model?.id]);
  const ownAccounts=useMemo(()=>accounts.filter(entry=>entry.model_id===model?.id),[accounts,model?.id]);
  const ownJobs=useMemo(()=>jobs.filter(entry=>entry.model_id===model?.id),[jobs,model?.id]);

  function openAction(next:Exclude<Action,null>){setAction(next);setPrompt("");setPhoto(null);setTargetItemId("");setActionError("");setNotice("");setWeekPlan(null)}
  function closeAction(){setAction(null);setActionError("");setNotice("");setPhoto(null);setWeekPlan(null)}

  async function generateVisual(){
    if(!model||!action||action==="week")return;
    if(action==="scene"&&!prompt.trim()){setActionError("Опиши сцену, одежду и действие.");return}
    if(action==="faceswap"&&!photo){setActionError("Сначала выбери фото-основу.");return}
    setBusy(true);setActionError("");setNotice("");
    try{
      let basePhotoUrl:string|null=null;
      if(action==="faceswap"&&photo){
        const path=`faceswap-uploads/${model.id}/${Date.now()}-${photo.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;
        const {error}=await supabase.storage.from("atlas-assets").upload(path,photo,{contentType:photo.type||"image/jpeg"});
        if(error)throw error;
        basePhotoUrl=supabase.storage.from("atlas-assets").getPublicUrl(path).data.publicUrl;
      }
      const response=await fetch("/api/avatar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model_id:model.id,kind:action,prompt,style,framing,count:1,source_url:null,base_photo_url:basePhotoUrl})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось создать задание");
      await refreshJobs();setNotice("Задание отправлено. Результат появится в очереди автоматически.");setPrompt("");setPhoto(null);
    }catch(error){setActionError(error instanceof Error?error.message:"Ошибка генерации")}finally{setBusy(false)}
  }

  async function saveOutput(job:Job,url:string){
    if(!model)return;setBusy(true);setActionError("");
    try{
      const {data:auth}=await supabase.auth.getUser();if(!auth.user)throw new Error("Сессия истекла");
      if(job.kind==="avatar"){
        const passport={...(model.visual_passport||{}),avatar:url};
        const {error:modelError}=await supabase.from("ai_models").update({visual_passport:passport}).eq("id",model.id);if(modelError)throw modelError;
        await supabase.from("model_references").update({kind:"reference"}).eq("model_id",model.id).eq("kind","primary");
        const {data:inserted,error}=await supabase.from("model_references").insert({model_id:model.id,storage_path:url,kind:"primary",generation_job_id:job.id,created_by:auth.user.id}).select("*").single();if(error)throw error;
        setModels(current=>current.map(entry=>entry.id===model.id?{...entry,visual_passport:passport}:entry));
        setReferences(current=>[inserted,...current.map(entry=>entry.model_id===model.id&&entry.kind==="primary"?{...entry,kind:"reference"}:entry)]);setNotice("Портрет сохранён как главное лицо персонажа.");
      }else{
        if(!references.some(entry=>entry.storage_path===url)){
          const {data:inserted,error}=await supabase.from("model_references").insert({model_id:model.id,storage_path:url,kind:"reference",generation_job_id:job.id,created_by:auth.user.id}).select("*").single();if(error)throw error;setReferences(current=>[inserted,...current]);
        }
        if(targetItemId){const {error}=await supabase.from("content_items").update({asset_url:url}).eq("id",targetItemId);if(error)throw error;setItems(current=>current.map(entry=>entry.id===targetItemId?{...entry,asset_url:url}:entry))}
        setNotice(targetItemId?"Материал сохранён и прикреплён к публикации.":"Материал сохранён в Reference Library.");
      }
    }catch(error){setActionError(error instanceof Error?error.message:"Не удалось сохранить результат")}finally{setBusy(false)}
  }

  async function createWeekPlan(){
    if(!model)return;setBusy(true);setActionError("");setNotice("");
    try{
      const connected=Array.from(new Set(ownAccounts.filter(entry=>entry.platform!=="fanvue").map(entry=>platformLabels[entry.platform]||entry.platform)));
      const platforms=connected.length?connected:["Instagram","TikTok","Telegram"];
      let angles:string[]=[];
      try{const response=await fetch("/api/trends",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({niche:model.niche,bio:model.bio,platforms})});const data=await response.json();if(response.ok)angles=data.angles||[]}catch{}
      const theme=weekTheme.trim()||angles.slice(0,2).join(" · ")||model.niche||"Актуальная неделя контента";
      const response=await fetch("/api/plan-week",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model,theme,goal:weekGoal,platforms,history:ownItems.slice(0,20).map(entry=>entry.title)})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось создать неделю");setWeekPlan(data);
    }catch(error){setActionError(error instanceof Error?error.message:"Ошибка планирования")}finally{setBusy(false)}
  }

  async function saveWeekPlan(){
    if(!model||!weekPlan)return;setBusy(true);setActionError("");
    try{
      const {data:auth}=await supabase.auth.getUser();if(!auth.user)throw new Error("Сессия истекла");
      const base=new Date(`${weekStart}T09:00:00`);
      const rows=weekPlan.posts.map(post=>{const publishAt=new Date(base);publishAt.setDate(publishAt.getDate()+Number(post.day_offset));const [hours,minutes]=String(post.publish_time).split(":");publishAt.setHours(Number(hours),Number(minutes));return{model_id:model.id,title:post.title,platform:post.platform,format:post.format,status:"review",caption:`${post.hook}\n\n${post.caption}\n\n${post.cta}\n\n${post.hashtags.join(" ")}`,visual_prompt:post.visual_prompt,shot_list:post.shot_list,publish_at:publishAt.toISOString(),disclosure:post.disclosure,trend_note:null,created_by:auth.user.id}});
      const {data:inserted,error}=await supabase.from("content_items").insert(rows).select("*");if(error)throw error;setItems(current=>[...(inserted||[]),...current]);setNotice(`${rows.length} публикаций добавлено на проверку.`);setWeekPlan(null);
    }catch(error){setActionError(error instanceof Error?error.message:"Не удалось сохранить неделю")}finally{setBusy(false)}
  }

  if(!model)return <main className="atlas-studio-empty"><h1>Atlas Studio</h1><p>Сначала создай AI-модель. Даже фабрике контента нужен хотя бы один работник.</p><Link href="/">Вернуться в Atlas</Link></main>;
  const score=readiness(model,ownReferences,ownItems,ownAccounts),activeContent=ownItems.filter(item=>item.status!=="published");

  return <main className="atlas-studio-shell">
    <aside className="atlas-studio-models"><Link href="/" className="atlas-studio-back">← Atlas</Link><div className="atlas-studio-brand"><small>ATLAS CREATIVE OS</small><h1>Studio</h1><p>Один персонаж. Один производственный поток.</p></div><div className="atlas-studio-model-list">{models.map(entry=><button key={entry.id} className={entry.id===model.id?"active":""} onClick={()=>setModelId(entry.id)}><span className="atlas-studio-model-avatar" style={entry.visual_passport?.avatar?{backgroundImage:`url(${entry.visual_passport.avatar})`}:undefined}>{!entry.visual_passport?.avatar&&entry.name.slice(0,1)}</span><span><b>{entry.name}</b><small>{entry.niche||"Ниша не задана"}</small></span></button>)}</div></aside>
    <section className="atlas-studio-workspace">
      <header className="atlas-studio-header"><div><small>ПРОИЗВОДСТВЕННЫЙ ЦЕНТР</small><h2>{model.name}</h2><p>{model.handle||"Профиль не указан"} · {model.niche||"Ниша не указана"}</p></div><div className="atlas-studio-score"><span>{score}%</span><small>готовность</small></div></header>
      <section className="atlas-studio-hero"><div className="atlas-studio-portrait" style={model.visual_passport?.avatar?{backgroundImage:`url(${model.visual_passport.avatar})`}:undefined}>{!model.visual_passport?.avatar&&<span>{model.name.slice(0,1)}</span>}</div><div className="atlas-studio-identity"><small>IDENTITY SNAPSHOT</small><h3>{model.visual_passport?.appearance||"Внешность ещё не зафиксирована"}</h3><p>{model.bio||"Описание персонажа пока пустое."}</p><div className="atlas-studio-pills"><span>{ownReferences.length} референсов</span><span>{ownAccounts.length} площадок</span><span>{ownItems.length} материалов</span></div></div></section>
      <section className="atlas-studio-actions"><button className="primary" onClick={()=>openAction("avatar")}>Создать лицо</button><button className="primary" onClick={()=>openAction("scene")} disabled={!model.visual_passport?.avatar}>Создать сцену</button><button className="secondary" onClick={()=>openAction("faceswap")} disabled={!model.visual_passport?.avatar}>Загрузить фото</button><button className="secondary" onClick={()=>openAction("week")}>План на неделю</button></section>
      <section className="atlas-studio-readiness">{[["Character Brain",Boolean(model.bio&&model.visual_passport?.tone&&model.visual_passport?.biography)],["Главное лицо",Boolean(model.visual_passport?.avatar)],["Reference Library",ownReferences.length>=3],["Площадки",ownAccounts.length>0],["Контент-поток",ownItems.length>0]].map(([label,done])=><article key={String(label)} className={done?"done":"pending"}><span>{done?"✓":"·"}</span><div><b>{String(label)}</b><small>{done?"Готово":"Нужно заполнить"}</small></div></article>)}</section>
      <div className="atlas-studio-columns">
        <section className="atlas-studio-panel"><header><div><small>GENERATION QUEUE</small><h3>Последние генерации</h3></div><span>{ownJobs.length}</span></header>{jobsError&&<p className="atlas-studio-error">{jobsError}</p>}<div className="atlas-studio-generation-grid">{ownJobs.slice(0,6).map(job=>{const image=job.output_urls?.[0];return <article key={job.id}><div className="atlas-studio-generation-image" style={image?{backgroundImage:`url(${image})`}:undefined}>{!image&&<span>{job.status}</span>}</div><div><b>{kindLabel[job.kind]}</b><small>{new Date(job.created_at).toLocaleString("ru-RU")}</small></div>{image&&<button className="atlas-studio-save" onClick={()=>saveOutput(job,image)} disabled={busy}>{job.kind==="avatar"?"Сделать эталоном":"В библиотеку"}</button>}</article>})}{!ownJobs.length&&<p className="atlas-studio-muted">У персонажа пока нет генераций.</p>}</div></section>
        <section className="atlas-studio-panel"><header><div><small>CONTENT PIPELINE</small><h3>Контент в работе</h3></div><span>{activeContent.length}</span></header><div className="atlas-studio-content-list">{activeContent.slice(0,7).map(item=><Link href={`/?modelId=${model.id}&itemId=${item.id}`} key={item.id}><span className="atlas-studio-content-thumb" style={item.asset_url?{backgroundImage:`url(${item.asset_url})`}:undefined}/><div><b>{item.title}</b><small>{item.platform||item.format||"Без формата"}</small></div><em>{item.status}</em></Link>)}{!activeContent.length&&<p className="atlas-studio-muted">Контент ещё не создан.</p>}</div></section>
      </div>
      <section className="atlas-studio-library"><header><div><small>REFERENCE LIBRARY</small><h3>Визуальная память персонажа</h3></div><span>{ownReferences.length}</span></header><div>{ownReferences.slice(0,10).map(reference=><article key={reference.id} style={{backgroundImage:`url(${reference.storage_path})`}}><span>{reference.kind}</span></article>)}{!ownReferences.length&&<p className="atlas-studio-muted">Сохрани первые эталонные изображения.</p>}</div></section>
    </section>
    {action&&<div className="atlas-studio-overlay" role="dialog" aria-modal="true"><section className="atlas-studio-modal"><button className="atlas-studio-close" onClick={closeAction} aria-label="Закрыть">×</button><small>ATLAS PRODUCTION ACTION</small><h2>{action==="avatar"?"Создать главное лицо":action==="scene"?"Создать сцену":action==="faceswap"?"Заменить лицо на фото":"Создать неделю контента"}</h2>
      {action!=="week"?<div className="atlas-studio-form">{action==="faceswap"&&<label>Фото-основа<input type="file" accept="image/*" onChange={event=>setPhoto(event.target.files?.[0]||null)}/></label>}<label>{action==="avatar"?"Пожелания к внешности — необязательно":action==="faceswap"?"Свет и настроение — необязательно":"Сцена, одежда и действие"}<textarea value={prompt} onChange={event=>setPrompt(event.target.value)} placeholder={action==="scene"?"Например: выходит из кофейни, утренний свет, белая рубашка…":"Дополнительные пожелания…"}/></label>{action==="scene"&&<label>Кадр<select value={framing} onChange={event=>setFraming(event.target.value)}><option value="close_up">Крупный портрет</option><option value="waist_up">По пояс</option><option value="full_body">Полный рост</option></select></label>}<label>Стиль<select value={style} onChange={event=>setStyle(event.target.value)}><option>Фотореалистичный lifestyle</option><option>Editorial fashion</option><option>Чистый студийный портрет</option><option>Кинематографический кадр</option></select></label>{(action==="scene"||action==="faceswap")&&<label>Прикрепить результат к публикации<select value={targetItemId} onChange={event=>setTargetItemId(event.target.value)}><option value="">Только сохранить в библиотеку</option>{ownItems.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select></label>}<button onClick={generateVisual} disabled={busy}>{busy?"Отправляем…":"Запустить генерацию"}</button></div>:<div className="atlas-studio-form">{!weekPlan?<><label>Тема недели — необязательно<input value={weekTheme} onChange={event=>setWeekTheme(event.target.value)} placeholder="Atlas предложит тему по трендам"/></label><label>Цель<select value={weekGoal} onChange={event=>setWeekGoal(event.target.value)}><option>Рост аудитории и укрепление образа модели</option><option>Вовлечение существующей аудитории</option><option>Подготовка к рекламной интеграции</option><option>Продвижение продукта</option></select></label><label>Начало недели<input type="date" value={weekStart} onChange={event=>setWeekStart(event.target.value)}/></label><button onClick={createWeekPlan} disabled={busy}>{busy?"Создаём неделю…":"Сгенерировать 7 публикаций"}</button></>:<><div className="atlas-studio-week-summary"><small>ТЕМА НЕДЕЛИ</small><h3>{weekPlan.week_theme}</h3><p>{weekPlan.strategy}</p></div><div className="atlas-studio-week-posts">{weekPlan.posts.map((post,index)=><article key={`${post.day_offset}-${post.publish_time}-${post.title}`}><span>{index+1}</span><div><b>{post.title}</b><small>{post.platform} · {post.format} · {post.publish_time}</small></div></article>)}</div><div className="atlas-studio-modal-actions"><button className="secondary" onClick={()=>setWeekPlan(null)}>Изменить</button><button onClick={saveWeekPlan} disabled={busy}>{busy?"Сохраняем…":"Добавить в контент-план"}</button></div></>}</div>}
      {notice&&<p className="atlas-studio-notice">{notice}</p>}{actionError&&<p className="atlas-studio-error">{actionError}</p>}
    </section></div>}
  </main>;
}
