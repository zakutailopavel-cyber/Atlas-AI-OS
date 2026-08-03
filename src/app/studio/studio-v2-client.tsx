"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Model = { id:string; name:string; handle:string|null; niche:string|null; bio:string|null; status:string; visual_passport:Record<string,unknown>|null; created_at?:string };
type Reference = { id:string; model_id:string; storage_path:string; kind:string; created_at:string };
type Item = { id:string; model_id:string|null; title:string; platform:string|null; format:string|null; status:string; caption?:string|null; asset_url:string|null; publish_at:string|null; created_at:string };
type Account = { id:string; model_id:string; platform:string; handle:string };
type Task = { id:string; model_id:string; content_item_id:string|null; title:string; instructions:string; status:string; reference_ids:string[]; result_url:string|null; result_notes:string|null; claimed_by:string|null; claimed_at:string|null; completed_at:string|null; created_at:string; updated_at:string };
type View = "overview"|"model"|"create"|"queue"|"moderation";

const nav: Array<[View,string,string]> = [
  ["overview","Обзор","⌂"],["model","Модель","◉"],["create","Создать задачу","＋"],["queue","Очередь","≡"],["moderation","Модерация","✓"],
];
const statusLabel:Record<string,string>={queued:"В очереди",claimed:"В работе",generating:"Генерация",completed:"Завершено",failed:"Ошибка",cancelled:"Отменено",pending_review:"На модерации",approved:"Одобрено",published:"Опубликовано"};

function avatar(model:Model){return String(model.visual_passport?.avatar||"")}
function passportText(model:Model,key:string,fallback:string){return String(model.visual_passport?.[key]||fallback)}
function dateLabel(value:string|null){return value?new Date(value).toLocaleString("ru-RU",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"—"}

export default function StudioV2Client({models,references,items,accounts,initialTasks}:{models:Model[];references:Reference[];items:Item[];accounts:Account[];initialTasks:Task[]}){
  const [view,setView]=useState<View>("overview");
  const [modelId,setModelId]=useState(models[0]?.id||"");
  const [tasks,setTasks]=useState(initialTasks);
  const [selectedTaskId,setSelectedTaskId]=useState(initialTasks.find(task=>Boolean(task.result_url))?.id||initialTasks[0]?.id||"");
  const [title,setTitle]=useState("");
  const [instructions,setInstructions]=useState("");
  const [selectedRefs,setSelectedRefs]=useState<string[]>([]);
  const [platform,setPlatform]=useState("Instagram");
  const [format,setFormat]=useState("4:5");
  const [notes,setNotes]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [error,setError]=useState("");

  const model=models.find(entry=>entry.id===modelId)||models[0];
  const modelRefs=useMemo(()=>references.filter(ref=>ref.model_id===model?.id),[references,model?.id]);
  const primary=modelRefs.find(ref=>ref.kind==="primary")||null;
  const secondary=modelRefs.filter(ref=>ref.kind!=="primary");
  const modelItems=items.filter(item=>item.model_id===model?.id);
  const modelAccounts=accounts.filter(account=>account.model_id===model?.id);
  const modelTasks=tasks.filter(task=>task.model_id===model?.id);
  const selectedTask=tasks.find(task=>task.id===selectedTaskId)||modelTasks.find(task=>Boolean(task.result_url))||modelTasks[0]||null;
  const moderationTasks=tasks.filter(task=>Boolean(task.result_url));

  async function refreshTasks(){
    const response=await fetch("/api/studio/tasks",{cache:"no-store"});
    const data=await response.json();
    if(!response.ok)throw new Error(data.error||"Не удалось обновить очередь");
    setTasks(data.tasks||[]);
  }

  async function createTask(){
    if(!model)return;
    setBusy(true);setError("");setMessage("");
    try{
      const prompt=[instructions.trim(),`Платформа: ${platform}. Формат: ${format}.`,`Сохраняй точную идентичность лица из закреплённого primary face reference.`].filter(Boolean).join("\n\n");
      if(!title.trim()||!instructions.trim())throw new Error("Заполни название и бриф задачи");
      const response=await fetch("/api/studio/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model_id:model.id,title, instructions:prompt,reference_ids:selectedRefs})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось создать задачу");
      await refreshTasks();setTitle("");setInstructions("");setSelectedRefs([]);setSelectedTaskId(data.task.id);setMessage("Задача создана. Главный face reference добавлен автоматически.");setView("queue");
    }catch(value){setError(value instanceof Error?value.message:"Ошибка") }finally{setBusy(false)}
  }

  async function moderate(action:"approve"|"request_changes"){
    if(!selectedTask)return;
    setBusy(true);setError("");setMessage("");
    try{
      const response=await fetch("/api/studio/tasks",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:selectedTask.id,action,notes})});
      const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось обновить задачу");
      await refreshTasks();setNotes("");setMessage(action==="approve"?"Результат одобрен и передан в контент-поток.":"Задача возвращена на переделку с комментариями.");
    }catch(value){setError(value instanceof Error?value.message:"Ошибка") }finally{setBusy(false)}
  }

  if(!model)return <main className="ops-empty"><h1>Atlas</h1><p>Нет AI-моделей для отображения.</p><Link href="/">Вернуться</Link></main>;

  const pending=tasks.filter(task=>task.status==="queued").length;
  const claimed=tasks.filter(task=>task.status==="claimed").length;
  const review=moderationTasks.length;
  const scheduled=items.filter(item=>item.status==="scheduled").length;

  return <main className="ops-shell">
    <aside className="ops-sidebar">
      <Link href="/" className="ops-logo"><span>◈</span>Atlas</Link>
      <nav>{nav.map(([id,label,icon])=><button key={id} className={view===id?"active":""} onClick={()=>setView(id)}><span>{icon}</span>{label}{id==="moderation"&&review>0?<em>{review}</em>:null}</button>)}</nav>
      <div className="ops-sidebar-foot"><span className="ops-user">P</span><div><b>Павел</b><small>Администратор</small></div></div>
    </aside>

    <section className="ops-main">
      <header className="ops-topbar">
        <div><small>ATLAS CONTENT OPERATIONS</small><h1>{view==="overview"?"Обзор":view==="model"?"Профиль модели":view==="create"?"Создание задачи":view==="queue"?"Очередь и генерация":"Модерация"}</h1></div>
        <select value={model.id} onChange={event=>{setModelId(event.target.value);setSelectedRefs([])}}>{models.map(entry=><option key={entry.id} value={entry.id}>{entry.name}</option>)}</select>
      </header>

      {message&&<div className="ops-alert success">{message}</div>}{error&&<div className="ops-alert error">{error}</div>}

      {view==="overview"&&<>
        <section className="ops-kpis">
          <article><small>Активные модели</small><strong>{models.filter(entry=>entry.status==="active").length}</strong><span>Всего {models.length}</span></article>
          <article><small>В очереди</small><strong>{pending}</strong><span>{claimed} в работе</span></article>
          <article><small>Ожидают модерации</small><strong>{review}</strong><span>Требуют решения</span></article>
          <article><small>Запланировано</small><strong>{scheduled}</strong><span>Ближайшие публикации</span></article>
        </section>
        <div className="ops-grid two">
          <section className="ops-card"><header><div><small>АВТОМАТИЗАЦИИ</small><h2>Что происходит сейчас</h2></div><button onClick={()=>setView("queue")}>Открыть очередь</button></header><div className="ops-timeline">
            <article><span className="green"/><div><b>n8n проверяет due-персон</b><small>Каждый час по локальному времени модели</small></div><em>Активно</em></article>
            <article><span className="blue"/><div><b>GPT формирует брифы</b><small>Тренды, референсы, caption angle</small></div><em>{pending} задач</em></article>
            <article><span className="orange"/><div><b>Модерация результатов</b><small>Approve или Request changes</small></div><em>{review} ожидают</em></article>
          </div></section>
          <section className="ops-card"><header><div><small>БЛИЖАЙШИЙ КОНТЕНТ</small><h2>Публикации</h2></div></header><div className="ops-content-list">{items.slice(0,6).map(item=><article key={item.id}><span style={item.asset_url?{backgroundImage:`url(${item.asset_url})`}:undefined}/><div><b>{item.title}</b><small>{item.platform||"Платформа не выбрана"} · {dateLabel(item.publish_at)}</small></div><em>{item.status}</em></article>)}{!items.length&&<p>Контент пока не создан.</p>}</div></section>
        </div>
      </>}

      {view==="model"&&<>
        <section className="ops-identity-card">
          <div className="ops-face" style={avatar(model)?{backgroundImage:`url(${avatar(model)})`}:undefined}>{!avatar(model)&&model.name.slice(0,1)}<span>🔒 Главный face reference</span></div>
          <div className="ops-identity-copy"><div className="ops-title-row"><div><small>AI-МОДЕЛЬ</small><h2>{model.name}</h2><p>{model.handle||"Handle не указан"}</p></div><span className="ops-lock">🔒 Идентичность зафиксирована</span></div><p>{model.bio||"Описание модели ещё не заполнено."}</p><div className="ops-meta"><div><small>Ниша</small><b>{model.niche||"Не указана"}</b></div><div><small>Часовой пояс</small><b>{passportText(model,"timezone","Europe/Tallinn")}</b></div><div><small>Рынок</small><b>{passportText(model,"market","Не задан")}</b></div><div><small>Язык</small><b>{passportText(model,"language","Русский")}</b></div><div><small>Окна публикаций</small><b>{passportText(model,"posting_windows","Не настроены")}</b></div><div><small>Площадки</small><b>{modelAccounts.map(account=>account.platform).join(", ")||"Не подключены"}</b></div><div><small>Материалы</small><b>{modelItems.length}</b></div><div><small>Статус</small><b>{model.status}</b></div></div></div>
        </section>
        <section className="ops-card"><header><div><small>REFERENCE LIBRARY</small><h2>Дополнительные референсы</h2></div><span>{secondary.length}</span></header><div className="ops-reference-grid">{secondary.map(ref=><article key={ref.id} style={{backgroundImage:`url(${ref.storage_path})`}}><span>{ref.kind}</span></article>)}{!secondary.length&&<p>Добавь позы, одежду, освещение и локации.</p>}</div></section>
      </>}

      {view==="create"&&<section className="ops-create-grid">
        <div className="ops-card form"><header><div><small>БРИФ ТРЕНДА</small><h2>Что создаём</h2></div></header><label>Название задачи<input value={title} onChange={event=>setTitle(event.target.value)} placeholder="Например: Sunset yacht editorial"/></label><label>Бриф и идея<textarea value={instructions} onChange={event=>setInstructions(event.target.value)} placeholder="Тренд, настроение, сцена, одежда, действие, caption angle…"/></label><div className="ops-tags"><span>trendSummary</span><span>captionAngle</span><span>referenceTags</span></div></div>
        <div className="ops-card"><header><div><small>РЕФЕРЕНСЫ</small><h2>Материалы для задачи</h2></div></header><div className="ops-primary-strip"><div style={primary?{backgroundImage:`url(${primary.storage_path})`}:undefined}/><p><b>Главный face reference</b><small>{primary?"Добавится автоматически и не может быть снят":"Сначала закрепи лицо модели"}</small></p><span>🔒</span></div><div className="ops-reference-select">{secondary.map(ref=><button key={ref.id} className={selectedRefs.includes(ref.id)?"selected":""} onClick={()=>setSelectedRefs(current=>current.includes(ref.id)?current.filter(id=>id!==ref.id):[...current,ref.id].slice(0,7))} style={{backgroundImage:`url(${ref.storage_path})`}}><span>{selectedRefs.includes(ref.id)?"✓":"+"}</span></button>)}</div></div>
        <div className="ops-card form"><header><div><small>НАСТРОЙКИ</small><h2>Генерация</h2></div></header><label>Платформа<select value={platform} onChange={event=>setPlatform(event.target.value)}><option>Instagram</option><option>TikTok</option><option>Reels</option><option>Telegram</option></select></label><label>Формат<select value={format} onChange={event=>setFormat(event.target.value)}><option>4:5</option><option>9:16</option><option>1:1</option><option>16:9</option></select></label><div className="ops-prompt-preview"><small>СИСТЕМНОЕ ПРАВИЛО</small><p>Точное лицо берётся только из закреплённого primary face reference. Дополнительные референсы влияют на позу, одежду и сцену.</p></div><button className="ops-primary" disabled={busy||!primary} onClick={createTask}>{busy?"Создаём…":"Создать задачу"}</button></div>
      </section>}

      {view==="queue"&&<section className="ops-card queue"><header><div><small>IMAGE TASKS</small><h2>Очередь и генерация</h2></div><button onClick={refreshTasks}>Обновить</button></header><div className="ops-table"><div className="head"><span>Задача</span><span>Модель</span><span>Статус</span><span>Исполнитель</span><span>Обновлено</span><span/></div>{tasks.map(task=>{const owner=models.find(entry=>entry.id===task.model_id);return <button key={task.id} onClick={()=>{setSelectedTaskId(task.id);setView(task.result_url?"moderation":"queue")}}><span><b>{task.title}</b><small>{task.id.slice(0,8)}</small></span><span>{owner?.name||"—"}</span><span><em className={`status ${task.status}`}>{statusLabel[task.status]||task.status}</em></span><span>{task.claimed_by||"—"}</span><span>{dateLabel(task.updated_at)}</span><span>→</span></button>})}{!tasks.length&&<p>Очередь пуста.</p>}</div></section>}

      {view==="moderation"&&<div className="ops-moderation-layout">
        <aside className="ops-card moderation-list"><header><div><small>НА ПРОВЕРКЕ</small><h2>Результаты</h2></div></header>{moderationTasks.map(task=><button key={task.id} className={selectedTask?.id===task.id?"active":""} onClick={()=>setSelectedTaskId(task.id)}><span style={task.result_url?{backgroundImage:`url(${task.result_url})`}:undefined}/><div><b>{task.title}</b><small>{models.find(entry=>entry.id===task.model_id)?.name}</small></div></button>)}</aside>
        <section className="ops-card moderation-main">{selectedTask?<><header><div><small>ЗАДАЧА {selectedTask.id.slice(0,8)}</small><h2>{selectedTask.title}</h2></div><em className={`status ${selectedTask.status}`}>{statusLabel[selectedTask.status]||selectedTask.status}</em></header><div className="ops-review-grid"><div><small>FACE REFERENCE</small><div className="ops-review-face" style={primary?{backgroundImage:`url(${primary.storage_path})`}:undefined}/></div><div><small>РЕЗУЛЬТАТ</small><div className="ops-result" style={selectedTask.result_url?{backgroundImage:`url(${selectedTask.result_url})`}:undefined}/></div><div className="ops-review-copy"><small>БРИФ</small><p>{selectedTask.instructions}</p><label>Комментарий модератора<textarea value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Что исправить или почему результат одобрен"/></label></div></div><footer><button className="ops-secondary danger" disabled={busy} onClick={()=>moderate("request_changes")}>Отправить на переделку</button><button className="ops-primary success" disabled={busy} onClick={()=>moderate("approve")}>Одобрить</button></footer></>:<p>Нет результатов для модерации.</p>}</section>
      </div>}
    </section>
  </main>
}
