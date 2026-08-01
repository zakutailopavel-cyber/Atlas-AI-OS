"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
type User = { id: string; email: string; role: string };
type Model = {
  id: string;
  name: string;
  handle: string | null;
  niche: string | null;
  bio: string | null;
  status: string;
  visual_passport: Record<string, string> | null;
  created_by: string;
};
type Item = {
  id: string;
  model_id: string | null;
  title: string;
  platform: string | null;
  format: string | null;
  status: string;
  caption: string | null;
  visual_prompt: string | null;
  shot_list: string[] | null;
  publish_at: string | null;
  created_by: string;
  created_at?: string;
  asset_url?: string | null;
  review_comment?: string | null;
  disclosure?: string | null;
  tracking_destination_url?: string | null;
  trend_note?: string | null;
};
type SocialAccount = {
  id: string;
  model_id: string;
  platform: string;
  handle: string;
  upload_notes: string | null;
  created_by: string;
};
const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  telegram: "Telegram",
  youtube_shorts: "YouTube Shorts",
  reddit: "Reddit",
  x: "X",
  fanvue: "Fanvue",
};
const UPLOAD_GUIDES: Record<string, string> = {
  Instagram:
    "Открой Instagram → «Создать» → загрузи материал из библиотеки Atlas → вставь готовый текст → если есть трекинг-ссылка, добавь её в шапку профиля.",
  TikTok:
    "Открой TikTok → «+» → загрузи видео или фото → вставь подпись. Ссылка кликабельна только в био — обнови его, если ссылка изменилась.",
  Telegram:
    "Опубликуй в канал модели → текст поста можно вставить как есть, ссылку — прямо в текст.",
  "YouTube Shorts":
    "Загрузи через YouTube Studio → Shorts → название и описание возьми из заголовка и подписи.",
  Reddit:
    "Публикуй только в подходящий сабреддит и по его правилам → если правила запрещают ссылки в посте, укажи её в профиле.",
  X: "Опубликуй пост → лимит 280 символов, при необходимости сократи подпись из Atlas.",
  Fanvue:
    "Это площадка назначения, а не тизер — сюда ведут ссылки из остальных постов, публикуется отдельно в самом Fanvue.",
};
type AvatarJob = { id:string; model_id:string; kind:"avatar"|"scene"; prompt:string; style:string; status:string; output_urls:string[] | null; error:string | null; created_at:string };
type Asset = {id:string;model_id:string;storage_path:string;kind:string;generation_job_id:string|null;created_at:string};
const menu = [
  "Главная",
  "AI-модели",
  "Контент-студия",
  "Календарь",
  "Команда",
  "Настройки",
  "Фан-чат",
];
export default function Dashboard({ user }: { user: User }) {
  const s = useMemo(() => createClient(), []),
    [page, setPage] = useState("Главная"),
    [models, setModels] = useState<Model[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [assets,setAssets]=useState<Asset[]>([]),
    [team, setTeam] = useState<{ id: string; email: string; role: string }[]>([]),
    [loading, setLoading] = useState(true),
    [modelOpen, setModelOpen] = useState<Model | null | undefined>(),
    [contentOpen, setContentOpen] = useState(false),
    [avatarOpen, setAvatarOpen] = useState(false),
    [weekOpen, setWeekOpen] = useState(false),
    [weekPresetModel, setWeekPresetModel] = useState(""),
    [socialAccounts, setSocialAccounts] = useState<SocialAccount[]>([]),
    [linkClicks, setLinkClicks] = useState<Record<string, number>>({}),
    [viewModelId, setViewModelId] = useState<string | null>(null),
    [avatarPresetModel, setAvatarPresetModel] = useState(""),
    [focusItemId, setFocusItemId] = useState<string | undefined>(undefined);
  function openPost(item: Item) {
    if (!item.model_id) return;
    setViewModelId(item.model_id);
    setFocusItemId(item.id);
  }
  async function load() {
    setLoading(true);
    const [m, c, t, a, lc, sa] = await Promise.all([
      s.from("ai_models").select("*").order("created_at"),
      s
        .from("content_items")
        .select("*")
        .order("created_at", { ascending: false }),
      s.from("profiles").select("id,email,role").order("created_at"),
      s.from("model_references").select("*").order("created_at",{ascending:false}),
      s.from("link_clicks").select("content_item_id"),
      s.from("social_accounts").select("*").order("created_at"),
    ]);
    const contentCountByModel: Record<string, number> = {};
    for (const it of c.data || []) {
      if (it.model_id)
        contentCountByModel[it.model_id] = (contentCountByModel[it.model_id] || 0) + 1;
    }
    function workStage(model: Model): number {
      const hasContent = (contentCountByModel[model.id] || 0) > 0;
      const hasAvatar = !!model.visual_passport?.avatar;
      if (hasContent || model.status === "active") return 0;
      if (hasAvatar) return 1;
      return 2;
    }
    setModels(
      [...(m.data || [])].sort((a, b) => {
        const stageDiff = workStage(a) - workStage(b);
        if (stageDiff !== 0) return stageDiff;
        return String(b.created_at).localeCompare(String(a.created_at));
      }),
    );
    setItems(c.data || []);
    setTeam(t.data || []);
    setAssets(a.data||[]);
    setSocialAccounts(sa.data || []);
    const clickCounts: Record<string, number> = {};
    for (const row of lc.data || []) {
      clickCounts[row.content_item_id] = (clickCounts[row.content_item_id] || 0) + 1;
    }
    setLinkClicks(clickCounts);
    setLoading(false);
  }
  async function saveSocialAccount(a: Partial<SocialAccount>) {
    if (a.id) await s.from("social_accounts").update({ handle: a.handle, upload_notes: a.upload_notes }).eq("id", a.id);
    else await s.from("social_accounts").insert({ model_id: a.model_id, platform: a.platform, handle: a.handle, upload_notes: a.upload_notes || null, created_by: user.id });
    load();
  }
  async function deleteSocialAccount(id: string) {
    await s.from("social_accounts").delete().eq("id", id);
    load();
  }
  useEffect(() => {
    load();
  }, []);
  async function saveModel(m: Partial<Model>) {
    if (m.id)
      await s
        .from("ai_models")
        .update({
          name: m.name,
          handle: m.handle,
          niche: m.niche,
          bio: m.bio,
          status: m.status,
          visual_passport: m.visual_passport,
        })
        .eq("id", m.id);
    else await s.from("ai_models").insert({ ...m, created_by: user.id });
    setModelOpen(undefined);
    load();
  }
  async function saveItem(x: Partial<Item>) {
    await s.from("content_items").insert({ ...x, created_by: user.id });
    setContentOpen(false);
    load();
  }
  async function saveWeek(posts: Partial<Item>[]) {
    await s
      .from("content_items")
      .insert(posts.map((x) => ({ ...x, created_by: user.id })));
    setWeekOpen(false);
    load();
  }
  async function status(item: Item, next: string) {
    await s.from("content_items").update({ status: next }).eq("id", item.id);
    load();
  }
  async function updateItem(item: Partial<Item>) {
    await s
      .from("content_items")
      .update({
        title: item.title,
        caption: item.caption,
        visual_prompt: item.visual_prompt,
        status: item.status,
        publish_at: item.publish_at,
        asset_url: item.asset_url,
        review_comment: item.review_comment,
        disclosure: item.disclosure,
        tracking_destination_url: item.tracking_destination_url,
      })
      .eq("id", item.id);
    load();
  }
  const viewModel = viewModelId
    ? models.find((mo) => mo.id === viewModelId)
    : undefined;
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <b>A</b>
          <span>
            ATLAS<small>AI OPERATING SYSTEM</small>
          </span>
        </div>
        <nav>
          {menu.map((n, i) => (
            <button
              key={n}
              className={page === n && !viewModelId ? "active" : ""}
              onClick={() => {
                setPage(n);
                setViewModelId(null);
              }}
            >
              {["▦", "♙", "✦", "▦", "♙", "⚙", "✉"][i]} {n}
            </button>
          ))}
        </nav>
        <div className="user">
          <b>{user.email.slice(0, 2).toUpperCase()}</b>
          <span>
            {user.email}
            <small>{user.role === "owner" ? "Владелец" : "Редактор"}</small>
          </span>
        </div>
      </aside>
      <main>
        <header>
          <div>
            <small>
              {viewModel ? "КАРТОЧКА ПЕРСОНАЖА" : "РАБОЧЕЕ ПРОСТРАНСТВО ATLAS"}
            </small>
            <h1>{viewModel ? viewModel.name : page}</h1>
          </div>
          <div className="header-actions">
            <label className="search">⌕ <input placeholder="Поиск…" /><kbd>⌘ K</kbd></label>
            <button className="bell" aria-label="Уведомления">♧<i /></button>
            <button className="global-create" onClick={() => setContentOpen(true)}>＋ Создать</button>
          </div>
        </header>
        <div className="content">
          {(() => {
            if (viewModel) {
              return (
                <CharacterPage
                  key={viewModel.id}
                  model={viewModel}
                  items={items}
                  accounts={socialAccounts}
                  clicks={linkClicks}
                  team={team}
                  initialItemId={focusItemId}
                  close={() => {
                    setViewModelId(null);
                    setFocusItemId(undefined);
                  }}
                  saveAccount={saveSocialAccount}
                  deleteAccount={deleteSocialAccount}
                  saveModel={saveModel}
                  updateItem={updateItem}
                  openAvatar={() => {
                    setAvatarPresetModel(viewModel.id);
                    setAvatarOpen(true);
                  }}
                  generateWeek={(id) => {
                    setWeekPresetModel(id);
                    setWeekOpen(true);
                  }}
                  reload={load}
                />
              );
            }
            return (
              <>
                {page === "Главная" && (
                  <Home
                    models={models}
                    items={items}
                    create={() => setContentOpen(true)}
                    nav={setPage}
                    openItem={openPost}
                    openModel={(id) => setViewModelId(id)}
                  />
                )}{" "}
                {page === "AI-модели" && (
                  <Models
                    models={models}
                    add={() => setModelOpen(null)}
                    edit={(mo) => setViewModelId(mo.id)}
                    avatars={() => setAvatarOpen(true)}
                  />
                )}{" "}
                {page === "Контент-студия" && (
                  <Studio
                    items={items}
                    models={models}
                    add={() => setContentOpen(true)}
                    status={status}
                    open={openPost}
                    plan={() => setWeekOpen(true)}
                  />
                )}{" "}
                {page === "Календарь" && <Calendar items={items} models={models} open={openPost} />}{" "}
                {page === "Команда" && <Team team={team} />}{" "}
                {page === "Настройки" && <Settings user={user} />}{" "}
                {page === "Фан-чат" && <FanReply models={models} />}
              </>
            );
          })()}
        </div>
      </main>
      {modelOpen !== undefined && (
        <ModelDialog
          model={modelOpen}
          accounts={socialAccounts}
          saveAccount={saveSocialAccount}
          deleteAccount={deleteSocialAccount}
          close={() => setModelOpen(undefined)}
          save={saveModel}
          generateWeek={(id) => {
            setModelOpen(undefined);
            setWeekPresetModel(id);
            setWeekOpen(true);
          }}
        />
      )}{" "}
      {contentOpen && (
        <ContentDialog
          models={models}
          close={() => setContentOpen(false)}
          save={saveItem}
        />
      )}
      {avatarOpen && <AvatarStudio models={models} items={items} assets={assets} initialModelId={avatarPresetModel} close={()=>{setAvatarOpen(false);setAvatarPresetModel("")}} savePortrait={async(model,url)=>{const passport={...(model.visual_passport||{}),avatar:url};await s.from("ai_models").update({visual_passport:passport}).eq("id",model.id);await s.from("model_references").update({kind:"reference"}).eq("model_id",model.id).eq("kind","primary");await s.from("model_references").insert({model_id:model.id,storage_path:url,kind:"primary",created_by:user.id});await load();}} saveAsset={async(model,url,jobId)=>{if(!assets.some(a=>a.storage_path===url))await s.from("model_references").insert({model_id:model.id,storage_path:url,kind:"reference",generation_job_id:jobId,created_by:user.id});await load();}} attach={async(itemId,url)=>{await s.from("content_items").update({asset_url:url}).eq("id",itemId);await load();}} />}
      {weekOpen && (
        <WeekPlanner
          models={models}
          accounts={socialAccounts}
          presetModelId={weekPresetModel}
          history={items.slice(0, 20)}
          close={() => {
            setWeekOpen(false);
            setWeekPresetModel("");
          }}
          save={saveWeek}
        />
      )}
    </div>
  );
}
function Home({
  models,
  items,
  create,
  nav,
  openItem,
  openModel,
}: {
  models: Model[];
  items: Item[];
  create: () => void;
  nav: (page: string) => void;
  openItem: (item: Item) => void;
  openModel: (id: string) => void;
}) {
  const [renderedAt] = useState(() => Date.now());
  const ready = items.filter((x) => x.status === "ready" || x.status === "published").length;
  const scheduled = [...items]
    .filter((x) => x.publish_at && new Date(x.publish_at).getTime() >= renderedAt)
    .sort((a, b) => String(a.publish_at).localeCompare(String(b.publish_at)))[0];
  const scheduledModel = models.find((m) => m.id === scheduled?.model_id);
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <small>✦ {new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }).toUpperCase()}</small>
          <h2>Твоя творческая вселенная<br /><em>растёт.</em></h2>
          <p>{models.length ? `${models.length} цифровых автора создают свои истории.` : "Создай первого цифрового автора."}<br />Вот что требует твоего внимания сегодня.</p>
          <button onClick={create}>✣ Создать контент</button>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          {models.slice(0, 3).map((m, i) => <div key={m.id} className={`orbit-avatar orbit-${i}`} style={m.visual_passport?.avatar ? {backgroundImage:`url(${m.visual_passport.avatar})`} : undefined}>{!m.visual_passport?.avatar && m.name.slice(0,1)}</div>)}
          <div className="orbit-core">✦</div>
        </div>
      </section>
      <div className="stats">
        {[
          ["AI-МОДЕЛИ", models.length],
          ["КОНТЕНТ", items.length],
          ["ГОТОВО", ready],
          ["ЗАПЛАНИРОВАНО", items.filter((x) => x.publish_at).length],
        ].map((x) => (
          <article key={x[0]}>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>общая база</span>
          </article>
        ))}
      </div>
      <div className="section-heading"><div><small>ТВОИ ЦИФРОВЫЕ АВТОРЫ</small><h2>AI-модели</h2></div><span className="link-action" onClick={() => nav("AI-модели")}>Показать все ›</span></div>
      <ModelCards models={models} edit={(mo) => openModel(mo.id)} />
      <div className="section-heading queue-heading"><div><small>ЛИНИЯ ПРОИЗВОДСТВА</small><h2>Очередь на сегодня</h2></div><span className="link-action" onClick={() => nav("Календарь")}>Открыть календарь ›</span></div>
      {scheduled ? <section className="today-queue">
        <div><small>◷ СЛЕДУЮЩАЯ ПУБЛИКАЦИЯ · {new Date(scheduled.publish_at!).toLocaleTimeString("ru-RU",{hour:"2-digit",minute:"2-digit"})}</small><h3>{scheduled.title}</h3><p>{scheduledModel?.name || "Без модели"} · {scheduled.format || scheduled.platform}</p><button onClick={() => openItem(scheduled)}>▶ Предпросмотр</button></div>
        <ul><li>Текст подготовлен <b>{scheduled.caption ? "Готово" : "Нужно заполнить"}</b></li><li>Визуал прикреплён <b>{scheduled.asset_url ? "Готово" : "Проверить"}</b></li><li>Статус публикации <b>{scheduled.status === "ready" ? "Готово" : "В работе"}</b></li></ul>
      </section> : <Empty text="Запланируй публикацию — она появится здесь" action={create} />}
    </>
  );
}
function Models({
  models,
  add,
  edit,
  avatars,
}: {
  models: Model[];
  add: () => void;
  edit: (m: Model) => void;
  avatars: () => void;
}) {
  return (
    <>
      <div className="toolbar">
        <p>Создавай постоянные цифровые личности для всех каналов.</p>
        <div className="toolbar-actions"><button className="secondary" onClick={avatars}>✦ Студия аватаров</button><button onClick={add}>+ Новая AI-модель</button></div>
      </div>
      {models.length ? <ModelCards models={models} edit={edit} /> : (
        <Empty text="Пока нет AI-моделей" action={add} />
      )}
    </>
  );
}
function AvatarStudio({models,items,assets,close,savePortrait,saveAsset,attach,initialModelId}:{models:Model[];items:Item[];assets:Asset[];close:()=>void;savePortrait:(model:Model,url:string)=>Promise<void>;saveAsset:(model:Model,url:string,jobId:string)=>Promise<void>;attach:(itemId:string,url:string)=>Promise<void>;initialModelId?:string}){
  const [modelId,setModelId]=useState(initialModelId||models[0]?.id||""),[kind,setKind]=useState<"avatar"|"scene">("avatar"),[prompt,setPrompt]=useState(""),[style,setStyle]=useState("Фотореалистичный lifestyle"),[framing,setFraming]=useState("waist_up"),[jobs,setJobs]=useState<AvatarJob[]>([]),[targetId,setTargetId]=useState(""),[refineSource,setRefineSource]=useState(""),[previewUrl,setPreviewUrl]=useState(""),[busy,setBusy]=useState(false),[retrying,setRetrying]=useState(""),[error,setError]=useState("");
  const model=models.find(m=>m.id===modelId);
  async function refresh(){const r=await fetch("/api/avatar");if(r.ok){const d=await r.json();setJobs(d.jobs||[])}}
  useEffect(()=>{refresh();const timer=setInterval(refresh,5000);return()=>clearInterval(timer)},[]);
  async function generate(count=1){if(!model||(kind==="scene"&&!prompt.trim()))return;setBusy(true);setError("");try{const r=await fetch("/api/avatar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model_id:model.id,kind,prompt,style,framing,count:kind==="scene"?1:count,source_url:refineSource||null})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Не удалось создать задание");setRefineSource("");if(kind==="scene")setPrompt("");await refresh()}catch(e){setError(e instanceof Error?e.message:"Ошибка генерации")}finally{setBusy(false)}}
  async function retry(job:AvatarJob){setRetrying(job.id);setError("");try{const r=await fetch("/api/avatar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({model_id:job.model_id,kind:job.kind,prompt:job.prompt==="Профиль AI-модели"?"":job.prompt,style:job.style,framing:"waist_up",count:1})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Не удалось повторить задание");await fetch(`/api/avatar?id=${job.id}`,{method:"DELETE"});await refresh()}catch(e){setError(e instanceof Error?e.message:"Не удалось повторить задание")}finally{setRetrying("")}}
  async function remove(id:string){await fetch(`/api/avatar?id=${id}`,{method:"DELETE"});await refresh()}
  const ownJobs=jobs.filter(j=>j.model_id===modelId);
  return <Modal close={close}><small>ATLAS AVATAR LAB</small><h2>Студия персонажа</h2><div className="avatar-tabs"><button className={kind==="avatar"?"active":""} onClick={()=>setKind("avatar")}>Создать лицо</button><button className={kind==="scene"?"active":""} onClick={()=>setKind("scene")} disabled={!model?.visual_passport?.avatar}>Создать сцену</button></div><p className="avatar-intro">{kind==="avatar"?"Сначала создай один пробный портрет. Если образ подходит — запроси ещё три варианта.":"Atlas использует выбранное лицо как референс для новой сцены."}</p>
    <div className="avatar-layout"><div className="form avatar-controls"><label>AI-модель<select value={modelId} onChange={e=>{setModelId(e.target.value);setPrompt("")}}>{models.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>{kind==="scene"&&model?.visual_passport?.avatar&&<div className="reference-face"><img src={model.visual_passport.avatar} alt={`Эталонное лицо ${model.name}`}/><span><b>Лицо зафиксировано</b>Этот портрет будет референсом</span></div>}{refineSource&&<div className="refine-source"><img src={refineSource} alt="Исходное изображение для улучшения"/><span><b>Режим улучшения</b>Оригинал сохранится, Atlas создаст новую версию.</span><button onClick={()=>setRefineSource("")}>Отменить</button></div>}<label>{kind==="avatar"?"Дополнительные пожелания — необязательно":refineSource?"Что изменить в изображении":"Опиши сцену, одежду и действие"}<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={kind==="avatar"?"Например: чуть больше веснушек или более короткая стрижка. Основная внешность уже взята из профиля.":refineSource?"Например: заменить рубашку на белую, сделать свет мягче…":"Например: утро у окна, белая рубашка, наносит сыворотку…"} /></label>{kind==="scene"&&<label>Кадр<select value={framing} onChange={e=>setFraming(e.target.value)}><option value="close_up">Крупный портрет</option><option value="waist_up">По пояс — рекомендуется</option><option value="full_body">Полный рост</option></select><small className="field-hint">Для стабильного лица лучше выбирать крупный портрет или кадр по пояс.</small></label>}<label>Стиль<select value={style} onChange={e=>setStyle(e.target.value)}><option>Фотореалистичный lifestyle</option><option>Editorial fashion</option><option>Чистый студийный портрет</option><option>Кинематографический кадр</option></select></label><div className="avatar-memory"><b>Внешность автоматически взята из профиля</b><span>{model?.visual_passport?.appearance||"Добавь описание внешности в паспорте модели."}</span></div><button onClick={()=>generate(1)} disabled={busy||!model||(kind==="scene"&&!prompt.trim())}>{busy?"Отправляем в облако…":kind==="avatar"?"✦ Создать из профиля":refineSource?"✦ Создать улучшенную версию":"✦ Создать 1 сцену"}</button>{kind==="avatar"&&ownJobs.some(j=>j.kind==="avatar"&&j.status==="completed")&&<button className="more-portraits" onClick={()=>generate(3)} disabled={busy||!model}>Создать ещё 3 варианта</button>}{error&&<strong className="generation-error">{error}</strong>}</div>
    <div className="avatar-results">{kind==="scene"&&<div className="attach-bar"><label>Прикрепить выбранную сцену к публикации<select value={targetId} onChange={e=>setTargetId(e.target.value)}><option value="">Только сохранить в библиотеку</option>{items.filter(i=>i.model_id===modelId).map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select></label><span>{assets.filter(a=>a.model_id===modelId&&a.kind==="reference").length} материалов в библиотеке</span></div>}{!ownJobs.length?<div className="avatar-placeholder"><i>✦</i><b>Здесь появятся варианты</b><span>Результаты обновятся автоматически.</span></div>:ownJobs.slice(0,4).map(job=><section key={job.id}><header><span>{job.kind==="scene"?"Сцена · ":"Лицо · "}{job.status==="completed"?"Готово":job.status==="failed"?"Облако не запустилось":job.status==="processing"?"Создаём…":"Ожидает GPU"}</span><div className="job-actions">{job.status==="failed"&&<button className="refine-button" onClick={()=>retry(job)} disabled={retrying===job.id}>{retrying===job.id?"Повторяем…":"Повторить"}</button>}{job.kind==="scene"&&job.output_urls?.[0]&&<button className="refine-button" onClick={()=>{setKind("scene");setRefineSource(job.output_urls?.[0]||"");setPrompt("")}}>Улучшить</button>}<time>{new Date(job.created_at).toLocaleString("ru-RU")}</time><button className="job-delete" onClick={()=>remove(job.id)}>×</button></div></header>{job.output_urls?.length?<div className={`avatar-grid ${job.output_urls.length===1?"single":""}`}>{job.output_urls.map(url=><div className="avatar-tile" key={url}><button className="avatar-preview-button" onClick={()=>setPreviewUrl(url)} aria-label="Открыть изображение на весь экран"><img src={url} alt={`Результат генерации для ${model?.name || "AI-модели"}`}/><span className="preview-label">Увеличить</span></button><button className="avatar-save-button" onClick={async()=>{if(!model)return;if(job.kind==="avatar")await savePortrait(model,url);else{await saveAsset(model,url,job.id);if(targetId){await attach(targetId,url);}}}}>{job.kind==="avatar"?"Сделать эталоном":targetId?"Сохранить и прикрепить":"В библиотеку"}</button>{assets.some(a=>a.storage_path===url)&&<b className="saved-badge">✓</b>}</div>)}</div>:<div className="job-progress"><i/><p>{job.error||(job.status==="queued"?"Modal подбирает свободный GPU. Если он не запустится, Atlas завершит ожидание автоматически.":"Задание принято. Результаты обновятся автоматически.")}</p></div>}</section>)}</div></div>
    {previewUrl&&<div className="image-lightbox" onClick={()=>setPreviewUrl("")} role="dialog" aria-modal="true"><button className="lightbox-close" onClick={()=>setPreviewUrl("")} aria-label="Закрыть">×</button><img src={previewUrl} onClick={e=>e.stopPropagation()} alt="Результат генерации"/></div>}
  </Modal>
}
function CharacterPage({
  model,
  items,
  accounts,
  clicks,
  team,
  initialItemId,
  close,
  saveAccount,
  deleteAccount,
  saveModel,
  updateItem,
  openAvatar,
  generateWeek,
  reload,
}: {
  model: Model;
  items: Item[];
  accounts: SocialAccount[];
  clicks: Record<string, number>;
  team: { id: string; email: string; role: string }[];
  initialItemId?: string;
  close: () => void;
  saveAccount: (a: Partial<SocialAccount>) => void;
  deleteAccount: (id: string) => void;
  saveModel: (m: Partial<Model>) => void;
  updateItem: (x: Partial<Item>) => void;
  openAvatar: () => void;
  generateWeek: (modelId: string) => void;
  reload: () => void;
}) {
  const [m, setM] = useState<Partial<Model>>(model);
  const [now] = useState(() => Date.now());
  const [newPlatform, setNewPlatform] = useState("instagram"),
    [newHandle, setNewHandle] = useState("");
  const ownItems = [...items]
    .filter((i) => i.model_id === model.id)
    .sort((a, b) => {
      const af = a.publish_at ? new Date(a.publish_at).getTime() : Infinity;
      const bf = b.publish_at ? new Date(b.publish_at).getTime() : Infinity;
      const aUp = af >= now,
        bUp = bf >= now;
      if (aUp !== bUp) return aUp ? -1 : 1;
      if (aUp && bUp) return af - bf;
      return 0;
    });
  const [selectedId, setSelectedId] = useState(
    initialItemId || ownItems[0]?.id || "",
  );
  const selected =
    ownItems.find((i) => i.id === selectedId) || ownItems[0] || null;
  const ownAccounts = accounts.filter((a) => a.model_id === model.id);
  const statusLabel: Record<string, string> = {
    draft: "Черновик",
    review: "На проверке",
    ready: "Согласовано",
    published: "Опубликовано",
  };
  return (
    <div className="character-page">
      <button className="character-back" onClick={close}>
        ‹ Все AI-модели
      </button>
      <div className="character-head">
        <button
          className="character-avatar"
          onClick={openAvatar}
          aria-label="Изменить внешность"
        >
          {model.visual_passport?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={model.visual_passport.avatar} alt={model.name} />
          ) : (
            <span>{model.name.slice(0, 1)}</span>
          )}
          <span className="character-avatar-hint">✦ Изменить внешность</span>
        </button>
        <div className="character-info">
          <small>{model.status === "active" ? "Активна" : "Черновик"}</small>
          <h2>{model.name}</h2>
          <p>
            {model.handle || "Профиль не указан"} ·{" "}
            {model.niche || "Ниша не указана"}
          </p>
          <button className="week-button" onClick={() => generateWeek(model.id)}>
            ✦ Сгенерировать неделю
          </button>
        </div>
      </div>
      <details className="character-section" open>
        <summary>Личность</summary>
        <div className="form">
          {(["name", "handle", "niche", "bio"] as const).map((k) => (
            <label key={k}>
              {
                (
                  {
                    name: "Имя",
                    handle: "Профиль",
                    niche: "Ниша",
                    bio: "Описание",
                  } as Record<string, string>
                )[k]
              }
              <input
                value={m[k] || ""}
                onChange={(e) => setM({ ...m, [k]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Голос и манера общения
            <textarea
              value={m.visual_passport?.tone || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: { ...m.visual_passport, tone: e.target.value },
                })
              }
            />
          </label>
        </div>
      </details>
      <details className="character-section">
        <summary>Память и сюжет</summary>
        <div className="form brain-memory">
          <label>
            Биография персонажа
            <textarea
              value={m.visual_passport?.biography || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    biography: e.target.value,
                  },
                })
              }
            />
          </label>
          <label className="storyline">
            Текущая сюжетная линия
            <textarea
              value={m.visual_passport?.storyline || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    storyline: e.target.value,
                  },
                })
              }
            />
          </label>
        </div>
      </details>
      <div className="character-save-bar">
        <button onClick={() => saveModel(m)}>Сохранить профиль</button>
      </div>
      <div className="character-section character-accounts">
        <b>Подключённые площадки</b>
        <div className="accounts-list">
          {ownAccounts.length ? (
            ownAccounts.map((a) => (
              <div key={a.id} className="account-row">
                <span className="account-platform">
                  {PLATFORM_LABELS[a.platform] || a.platform}
                </span>
                <input
                  value={a.handle}
                  onChange={(e) => saveAccount({ ...a, handle: e.target.value })}
                />
                <input
                  value={a.upload_notes || ""}
                  placeholder="Заметка про загрузку — необязательно"
                  onChange={(e) =>
                    saveAccount({ ...a, upload_notes: e.target.value })
                  }
                />
                <button onClick={() => deleteAccount(a.id)}>×</button>
              </div>
            ))
          ) : (
            <small>Площадки ещё не добавлены.</small>
          )}
        </div>
        <div className="account-add">
          <select
            value={newPlatform}
            onChange={(e) => setNewPlatform(e.target.value)}
          >
            {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input
            value={newHandle}
            onChange={(e) => setNewHandle(e.target.value)}
            placeholder="@handle или ссылка"
          />
          <button
            onClick={() => {
              if (!newHandle.trim()) return;
              saveAccount({
                model_id: model.id,
                platform: newPlatform,
                handle: newHandle.trim(),
              });
              setNewHandle("");
            }}
          >
            Добавить
          </button>
        </div>
      </div>
      <div className="character-section character-posts">
        <b>Публикации</b>
        {ownItems.length ? (
          <>
            <div className="post-strip">
              {ownItems.map((i) => {
                const authorEmail = team.find((t) => t.id === i.created_by)?.email;
                return (
                  <button
                    key={i.id}
                    className={i.id === selected?.id ? "post-chip active" : "post-chip"}
                    onClick={() => setSelectedId(i.id)}
                  >
                    <small>{statusLabel[i.status] || i.status}</small>
                    <span>{i.platform || i.format}</span>
                    <em>{i.title}</em>
                    <i className="post-chip-author">
                      {authorEmail ? authorEmail.slice(0, 2).toUpperCase() : "?"}
                    </i>
                  </button>
                );
              })}
            </div>
            {selected && (
              <PostPreviewPanel
                key={selected.id}
                item={selected}
                model={model}
                clicks={clicks[selected.id] || 0}
                author={team.find((t) => t.id === selected.created_by)?.email}
                save={updateItem}
                reload={reload}
              />
            )}
          </>
        ) : (
          <small>У этой модели пока нет публикаций.</small>
        )}
      </div>
    </div>
  );
}
function PostPreviewPanel({
  item,
  model,
  clicks,
  author,
  save,
  reload,
}: {
  item: Item;
  model: Model;
  clicks: number;
  author?: string;
  save: (x: Partial<Item>) => void;
  reload: () => void;
}) {
  const [draft, setDraft] = useState<Partial<Item>>(item),
    [approving, setApproving] = useState(false),
    [approveError, setApproveError] = useState(""),
    [linkCopied, setLinkCopied] = useState(false);
  const trackingLink =
    typeof window !== "undefined" ? `${window.location.origin}/api/l/${item.id}` : "";
  async function copyTrackingLink() {
    await navigator.clipboard.writeText(trackingLink);
    setLinkCopied(true);
  }
  async function approve() {
    setApproving(true);
    setApproveError("");
    try {
      const r = await fetch("/api/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          content_item_id: item.id,
          title: draft.title,
          caption: draft.caption,
          visual_prompt: draft.visual_prompt,
          disclosure: draft.disclosure,
          asset_url: draft.asset_url,
          review_comment: draft.review_comment,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось согласовать");
      reload();
    } catch (e) {
      setApproveError(e instanceof Error ? e.message : "Ошибка согласования");
    } finally {
      setApproving(false);
    }
  }
  return (
    <div className="character-preview">
      <div className="social-preview">
        <div className="post-attribution">
          <span>{author ? `Автор: ${author}` : "Автор неизвестен"}</span>
          {item.created_at && (
            <span>
              · создано{" "}
              {new Date(item.created_at).toLocaleString("ru-RU", {
                day: "numeric",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="social-bar">
          <b>{model.handle || model.name}</b>
          <span>•••</span>
        </div>
        <div className="visual-stage">
          {draft.asset_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={draft.asset_url}
              alt={
                draft.title ? `Визуал публикации «${draft.title}»` : "Визуал публикации"
              }
            />
          ) : (
            <div>
              <b>Визуал ещё не прикреплён</b>
              <span>Вставь ссылку ниже</span>
            </div>
          )}
        </div>
        <label>
          Ссылка на изображение
          <input
            value={draft.asset_url || ""}
            onChange={(e) => setDraft({ ...draft, asset_url: e.target.value })}
            placeholder="https://..."
          />
        </label>
        <label>
          Текст публикации
          <PostTextEditor
            value={draft.caption || ""}
            onChange={(v) => setDraft({ ...draft, caption: v })}
            platform={draft.platform}
          />
        </label>
        <small className="disclosure-preview">
          {draft.disclosure || "⚠ Дисклоуз не задан"}
        </small>
        {draft.trend_note && (
          <small className="trend-note-preview">
            Учтён тренд на момент генерации: {draft.trend_note}
          </small>
        )}
        {draft.platform && UPLOAD_GUIDES[draft.platform] && (
          <div className="upload-guide">
            <b>Куда и как загрузить · {draft.platform}</b>
            <p>{UPLOAD_GUIDES[draft.platform]}</p>
          </div>
        )}
      </div>
      <div className="character-preview-actions form">
        <label>
          Статус
          <select
            value={draft.status || "draft"}
            onChange={(e) => setDraft({ ...draft, status: e.target.value })}
          >
            <option value="draft">Черновик</option>
            <option value="review">На проверке</option>
            <option value="ready" disabled>
              Согласовано (только через кнопку «Согласовать»)
            </option>
            <option value="published">Опубликовано</option>
          </select>
        </label>
        <label>
          Дата публикации
          <input
            type="datetime-local"
            defaultValue={
              draft.publish_at ? draft.publish_at.slice(0, 16) : ""
            }
            onChange={(e) =>
              setDraft({
                ...draft,
                publish_at: e.target.value
                  ? new Date(e.target.value).toISOString()
                  : null,
              })
            }
          />
        </label>
        <label>
          Визуальный промпт
          <PostTextEditor
            value={draft.visual_prompt || ""}
            onChange={(v) => setDraft({ ...draft, visual_prompt: v })}
          />
        </label>
        <label>
          AI-дисклоуз перед публикацией
          <input
            value={draft.disclosure || ""}
            onChange={(e) => setDraft({ ...draft, disclosure: e.target.value })}
          />
        </label>
        <label>
          Куда ведёт трафик (Fanvue-профиль, ссылка на подписку и т.п.)
          <input
            value={draft.tracking_destination_url || ""}
            onChange={(e) =>
              setDraft({ ...draft, tracking_destination_url: e.target.value })
            }
            placeholder="https://www.fanvue.com/..."
          />
        </label>
        {draft.tracking_destination_url && (
          <div className="tracking-link-box">
            <span>Трек-ссылка для био/подписи:</span>
            <code>{trackingLink}</code>
            <button type="button" onClick={copyTrackingLink}>
              {linkCopied ? "✓ Скопировано" : "Скопировать"}
            </button>
            <small>{clicks} клик(ов) зафиксировано</small>
          </div>
        )}
        <label>
          Комментарий редактора
          <PostTextEditor
            value={draft.review_comment || ""}
            onChange={(v) => setDraft({ ...draft, review_comment: v })}
            placeholder="Что изменить или проверить?"
          />
        </label>
        {approveError && (
          <strong className="generation-error">{approveError}</strong>
        )}
        <div className="character-preview-buttons">
          <button
            className="secondary"
            onClick={() => save({ ...draft, id: item.id, status: "review" })}
          >
            Вернуть на проверку
          </button>
          <button onClick={() => save({ ...draft, id: item.id })}>
            Сохранить изменения
          </button>
        </div>
        <button className="approve-button" onClick={approve} disabled={approving}>
          {approving ? "Согласуем…" : "✓ Согласовать"}
        </button>
      </div>
    </div>
  );
}
function ModelCards({models,edit}:{models:Model[];edit?:(m:Model)=>void}) {
  return <div className="models">{models.slice(0, edit ? undefined : 3).map((m,i)=><article key={m.id} onClick={()=>edit?.(m)}>
    <div className={`portrait p${i%3}`}>{m.visual_passport?.avatar&&<img src={m.visual_passport.avatar} alt={m.name}/>} 
      <small>{m.status === "active" ? "Активна" : "Черновик"}</small>
    </div>
    <div className="model-copy"><h3>{m.name}<span>↗</span></h3><label>{m.handle || "Профиль не указан"}</label><p>{m.niche || "Ниша не указана"}</p>
      <div className="model-metrics"><b>—<small>Подписчики</small></b><b>—<small>Рост за 30 дней</small></b><b>—<small>Публикации</small></b></div>
    </div>
  </article>)}</div>
}
function Studio({
  items,
  models,
  add,
  status,
  open,
  plan,
}: {
  items: Item[];
  models: Model[];
  add: () => void;
  status: (i: Item, s: string) => void;
  open: (i: Item) => void;
  plan: () => void;
}) {
  return (
    <>
      <div className="studio">
        <div>
          <small>ATLAS CREATIVE ENGINE</small>
          <h2>Контент от идеи до публикации</h2>
          <p>Общий производственный поток для всей команды.</p>
        </div>
        <div className="studio-actions">
          <button className="week-button" onClick={plan}>
            ▦ Создать неделю
          </button>
          <button onClick={add}>✦ Один материал</button>
        </div>
      </div>
      {items.length ? (
        <ContentList
          items={items}
          models={models}
          status={status}
          open={open}
        />
      ) : (
        <Empty text="Контент-план пока пуст" action={add} />
      )}
    </>
  );
}
function ContentList({
  items,
  models,
  status,
  open,
}: {
  items: Item[];
  models: Model[];
  status?: (i: Item, s: string) => void;
  open?: (i: Item) => void;
}) {
  return (
    <div className="list">
      {items.map((x) => (
        <article key={x.id} onClick={() => open?.(x)}>
          <i>{x.format?.includes("Reel") ? "▶" : "▧"}</i>
          <div>
            <b>{x.title}</b>
            <small>
              {models.find((m) => m.id === x.model_id)?.name || "Без модели"} ·{" "}
              {x.format}
            </small>
          </div>
          <span>{x.platform}</span>
          <span>
            {x.publish_at
              ? new Date(x.publish_at).toLocaleString("ru-RU")
              : "Не запланировано"}
          </span>
          {status ? (
            <select
              value={x.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => status(x, e.target.value)}
            >
              <option value="draft">Черновик</option>
              <option value="review">Проверка</option>
              <option value="ready">Готово</option>
              <option value="published">Опубликовано</option>
            </select>
          ) : (
            <strong>{x.status}</strong>
          )}
        </article>
      ))}
    </div>
  );
}
function Calendar({
  items,
  models,
  open,
}: {
  items: Item[];
  models: Model[];
  open: (item: Item) => void;
}) {
  const planned = items.filter((x) => x.publish_at);
  return (
    <>
      <div className="toolbar">
        <h2>Ближайшие публикации</h2>
        <span>{planned.length} запланировано</span>
      </div>
      {planned.length ? (
        <div className="agenda">
          {planned
            .sort((a, b) =>
              String(a.publish_at).localeCompare(String(b.publish_at)),
            )
            .map((x) => (
              <article key={x.id} onClick={() => open(x)}>
                <time>
                  {new Date(x.publish_at!).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "long",
                  })}
                </time>
                <div>
                  <b>{x.title}</b>
                  <p>
                    {models.find((m) => m.id === x.model_id)?.name || "Без модели"} ·{" "}
                    {x.platform} · {x.format}
                  </p>
                </div>
                <span>
                  {new Date(x.publish_at!).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </article>
            ))}
        </div>
      ) : (
        <Empty text="Запланированных публикаций пока нет" />
      )}
    </>
  );
}
function Team({ team }: { team: { id: string; email: string; role: string }[] }) {
  return (
    <div className="team">
      {team.map((x) => (
        <article key={x.email}>
          <b>{x.email.slice(0, 2).toUpperCase()}</b>
          <div>
            <h3>{x.email}</h3>
            <p>
              {x.role === "owner"
                ? "Полный доступ и управление"
                : "Модели, контент и календарь"}
            </p>
          </div>
          <span>{x.role === "owner" ? "Владелец" : "Редактор"}</span>
        </article>
      ))}
    </div>
  );
}
function Settings({ user }: { user: User }) {
  return (
    <div className="settings">
      <h2>Настройки пространства</h2>
      <label>
        Название
        <input value="Atlas AI OS" readOnly />
      </label>
      <label>
        Текущий пользователь
        <input value={user.email} readOnly />
      </label>
      <section>
        <b>Поисковая приватность включена</b>
        <p>
          Все поисковые роботы получают запрет на индексацию. Доступ к данным
          требует авторизации.
        </p>
      </section>
    </div>
  );
}
function FanReply({ models }: { models: Model[] }) {
  const [modelId, setModelId] = useState(models[0]?.id || ""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false),
    [result, setResult] = useState<{
      reply: string;
      tone_notes: string;
      needs_human_review: boolean;
    } | null>(null);
  const model = models.find((m) => m.id === modelId);
  async function send() {
    if (!model || !message.trim()) return;
    setLoading(true);
    setError("");
    setResult(null);
    setCopied(false);
    try {
      const r = await fetch("/api/fan-reply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, fan_message: message }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Не удалось получить ответ");
      setResult(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка ассистента");
    } finally {
      setLoading(false);
    }
  }
  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.reply);
    setCopied(true);
  }
  return (
    <div className="fan-reply-layout">
      <div className="fan-reply-panel">
        <h2>Fan Interaction Assistant</h2>
        <p className="fan-reply-hint">
          Черновик ответа фанату в голосе персонажа. Ничего не отправляется
          автоматически — скопируй и отправь вручную после проверки.
        </p>
        {model && (
          <div className="fan-reply-model-card">
            <span className="fan-reply-avatar-fallback">
              {model.name.slice(0, 2).toUpperCase()}
            </span>
            <div>
              <b>{model.name}</b>
              <span>{model.niche || "Ниша не указана"}</span>
            </div>
          </div>
        )}
        <div className="form">
          <label>
            AI-модель
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Сообщение фаната
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Вставь сообщение, на которое нужен черновик ответа…"
            />
          </label>
          <button onClick={send} disabled={loading || !model || !message.trim()}>
            {loading ? "Думаем…" : "✦ Предложить ответ"}
          </button>
          {error && <strong className="generation-error">{error}</strong>}
        </div>
      </div>
      <div className="fan-reply-panel fan-reply-preview">
        {!result && !loading && (
          <p className="fan-reply-empty">
            Здесь появится черновик ответа — выбери модель, вставь сообщение
            фаната и нажми «Предложить ответ».
          </p>
        )}
        {loading && (
          <p className="fan-reply-empty fan-reply-pulse">
            Подбираем тон и формулировку…
          </p>
        )}
        {result && (
          <>
            {result.needs_human_review && (
              <div className="fan-reply-flag">
                <span>⚠</span>
                <span>
                  Похоже на намерение купить или пожаловаться — ответь лично,
                  не отправляй черновик как есть.
                </span>
              </div>
            )}
            <div className="fan-reply-bubble">{result.reply}</div>
            <span className="fan-reply-tone">{result.tone_notes}</span>
            <div className="fan-reply-actions">
              <button className="fan-reply-copy" onClick={copy}>
                {copied ? "✓ Скопировано" : "Скопировать ответ"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
function ModelDialog({
  model,
  accounts,
  saveAccount,
  deleteAccount,
  close,
  save,
  generateWeek,
}: {
  model: Model | null;
  accounts: SocialAccount[];
  saveAccount: (a: Partial<SocialAccount>) => void;
  deleteAccount: (id: string) => void;
  close: () => void;
  save: (m: Partial<Model>) => void;
  generateWeek: (modelId: string) => void;
}) {
  const [tab, setTab] = useState("Личность"),
    [appearanceLoading, setAppearanceLoading] = useState(false),
    [appearanceError, setAppearanceError] = useState(""),
    [newPlatform, setNewPlatform] = useState("instagram"),
    [newHandle, setNewHandle] = useState(""),
    [m, setM] = useState<Partial<Model>>(() =>
      model || {
        name: "",
        handle: "",
        niche: "",
        bio: "",
        status: "draft",
        visual_passport: {
          seed: String(Math.floor(Math.random() * 900000 + 100000)),
          appearance: "",
          tone: "",
          biography: "",
          audience: "",
          values: "",
          immutable_facts: "",
          interests: "",
          vocabulary: "",
          forbidden_topics: "",
          favorite_places: "",
          brands: "",
          storyline: "",
        },
      },
    );
  async function generateAppearance() {
    setAppearanceLoading(true);
    setAppearanceError("");
    try {
      const r = await fetch("/api/appearance", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model: { id: m.id, name: m.name, niche: m.niche, bio: m.bio },
          }),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      setM({
        ...m,
        visual_passport: {
          ...m.visual_passport,
          appearance: data.appearance,
          seed: String(Math.floor(Math.random() * 900000 + 100000)),
        },
      });
    } catch (e) {
      setAppearanceError(
        e instanceof Error ? e.message : "Не удалось сгенерировать внешность",
      );
    } finally {
      setAppearanceLoading(false);
    }
  }
  return (
    <Modal close={close}>
      <small>ATLAS CHARACTER BRAIN</small>
      <h2>{model ? "Редактировать модель" : "Новая AI-модель"}</h2>
      <div className="brain-tabs">
        {(model
          ? ["Личность", "Внешность", "Память и сюжет", "Аккаунты"]
          : ["Личность", "Внешность", "Память и сюжет"]
        ).map((x) => (
          <button
            key={x}
            className={tab === x ? "active" : ""}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </div>
      {tab === "Личность" && (
        <div className="form">
          {(["name", "handle", "niche", "bio"] as const).map((k) => (
            <label key={k}>
              {
                (
                  {
                    name: "Имя",
                    handle: "Профиль",
                    niche: "Ниша",
                    bio: "Описание",
                  } as Record<string, string>
                )[k]
              }
              <input
                value={m[k] || ""}
                onChange={(e) => setM({ ...m, [k]: e.target.value })}
              />
            </label>
          ))}
          <label>
            Целевая аудитория
            <textarea
              value={m.visual_passport?.audience || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    audience: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Голос и манера общения
            <textarea
              value={m.visual_passport?.tone || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    tone: e.target.value,
                  },
                })
              }
              placeholder="Тёплая, уверенная, говорит короткими фразами…"
            />
          </label>
          <label>
            Ценности и мировоззрение
            <textarea
              value={m.visual_passport?.values || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    values: e.target.value,
                  },
                })
              }
            />
          </label>
        </div>
      )}
      {tab === "Внешность" && (
        <div className="form">
          <label>
            URL портрета
            <input value={m.visual_passport?.avatar || ""} onChange={(e)=>setM({...m,visual_passport:{...m.visual_passport,avatar:e.target.value}})} placeholder="https://… (прямая ссылка на изображение)" />
          </label>
          <label>
            Описание внешности
            <div className="appearance-generate">
              <button
                type="button"
                onClick={generateAppearance}
                disabled={appearanceLoading}
              >
                {appearanceLoading
                  ? "Генерируем уникальный образ…"
                  : m.visual_passport?.appearance
                    ? "↻ Перегенерировать внешность"
                    : "✦ Сгенерировать внешность"}
              </button>
              <small>
                Atlas придумает уникальную внешность и не повторит образы
                других моделей. Результат можно поправить вручную ниже —
                он закрепится за моделью после «Сохранить модель».
              </small>
            </div>
            {appearanceError && (
              <strong className="generation-error">{appearanceError}</strong>
            )}
            <textarea
              value={m.visual_passport?.appearance || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    appearance: e.target.value,
                  },
                })
              }
              placeholder="Нажми «Сгенерировать внешность» выше или опиши вручную"
            />
          </label>
          <label>
            Seed
            <input
              value={m.visual_passport?.seed || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    seed: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Стиль одежды и палитра
            <textarea
              value={m.visual_passport?.style || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    style: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Negative prompt
            <textarea
              value={m.visual_passport?.negative || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    negative: e.target.value,
                  },
                })
              }
              placeholder="different face, plastic skin, text, watermark…"
            />
          </label>
        </div>
      )}
      {tab === "Память и сюжет" && (
        <div className="form brain-memory">
          <label>
            Биография персонажа
            <textarea
              value={m.visual_passport?.biography || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    biography: e.target.value,
                  },
                })
              }
              placeholder="Где родилась, чем занимается, как пришла к своему образу жизни…"
            />
          </label>
          <label>
            Факты, которые нельзя менять
            <textarea
              value={m.visual_passport?.immutable_facts || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    immutable_facts: e.target.value,
                  },
                })
              }
              placeholder="Возраст, город, образование, семейное положение…"
            />
          </label>
          <label>
            Интересы и привычки
            <textarea
              value={m.visual_passport?.interests || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    interests: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Характерные слова и выражения
            <textarea
              value={m.visual_passport?.vocabulary || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    vocabulary: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Любимые места
            <textarea
              value={m.visual_passport?.favorite_places || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    favorite_places: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Бренды и действующие интеграции
            <textarea
              value={m.visual_passport?.brands || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    brands: e.target.value,
                  },
                })
              }
            />
          </label>
          <label>
            Запрещённые темы
            <textarea
              value={m.visual_passport?.forbidden_topics || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    forbidden_topics: e.target.value,
                  },
                })
              }
            />
          </label>
          <label className="storyline">
            Текущая сюжетная линия
            <textarea
              value={m.visual_passport?.storyline || ""}
              onChange={(e) =>
                setM({
                  ...m,
                  visual_passport: {
                    ...m.visual_passport,
                    storyline: e.target.value,
                  },
                })
              }
              placeholder="Что сейчас происходит в жизни модели и к чему ведём аудиторию в ближайшие недели…"
            />
          </label>
        </div>
      )}
      {tab === "Аккаунты" && model && (
        <div className="form accounts-tab">
          <div className="accounts-generate">
            <b>Сгенерировать неделю с учётом трендов</b>
            <p>
              Atlas проверит, что сейчас заходит в нише, подготовит и
              проверит промпт, затем сгенерирует посты под площадки ниже.
              Публикация остаётся ручной — Atlas готовит пакет и инструкцию,
              не постит сама.
            </p>
            <button onClick={() => generateWeek(model.id)}>
              ✦ Сгенерировать неделю
            </button>
          </div>
          <b>Подключённые площадки</b>
          <div className="accounts-list">
            {accounts.filter((a) => a.model_id === model.id).length ? (
              accounts
                .filter((a) => a.model_id === model.id)
                .map((a) => (
                  <div key={a.id} className="account-row">
                    <span className="account-platform">
                      {PLATFORM_LABELS[a.platform] || a.platform}
                    </span>
                    <input
                      value={a.handle}
                      onChange={(e) =>
                        saveAccount({ ...a, handle: e.target.value })
                      }
                    />
                    <input
                      value={a.upload_notes || ""}
                      placeholder="Заметка про загрузку — необязательно"
                      onChange={(e) =>
                        saveAccount({ ...a, upload_notes: e.target.value })
                      }
                    />
                    <button onClick={() => deleteAccount(a.id)}>×</button>
                  </div>
                ))
            ) : (
              <small>Площадки ещё не добавлены.</small>
            )}
          </div>
          <div className="account-add">
            <select
              value={newPlatform}
              onChange={(e) => setNewPlatform(e.target.value)}
            >
              {Object.entries(PLATFORM_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input
              value={newHandle}
              onChange={(e) => setNewHandle(e.target.value)}
              placeholder="@handle или ссылка"
            />
            <button
              onClick={() => {
                if (!newHandle.trim()) return;
                saveAccount({
                  model_id: model.id,
                  platform: newPlatform,
                  handle: newHandle.trim(),
                });
                setNewHandle("");
              }}
            >
              Добавить
            </button>
          </div>
        </div>
      )}
      <div className="brain-footer">
        <span>
          Эти данные автоматически используются всеми генераторами Atlas.
        </span>
        <button onClick={() => m.name && save(m)}>Сохранить модель</button>
      </div>
    </Modal>
  );
}
function ContentDialog({
  models,
  close,
  save,
}: {
  models: Model[];
  close: () => void;
  save: (x: Partial<Item>) => void;
}) {
  const [topic, setTopic] = useState(""),
    [goal, setGoal] = useState("Вовлечение аудитории"),
    [generated, setGenerated] = useState(false),
    [generating, setGenerating] = useState(false),
    [generationError, setGenerationError] = useState(""),
    [x, setX] = useState<Partial<Item>>({
      title: "",
      model_id: models[0]?.id || null,
      platform: "Instagram",
      format: "Reels",
      status: "draft",
      caption: "",
      visual_prompt: "",
      shot_list: [],
      publish_at: null,
      disclosure: "",
    });
  async function generate() {
    const model = models.find((v) => v.id === x.model_id);
    if (!model) return;
    setGenerating(true);
    setGenerationError("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model,
          topic,
          goal,
          platform: x.platform,
          format: x.format,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Ошибка генерации");
      setX({
        ...x,
        title: result.title,
        caption: `${result.hook}\n\n${result.caption}\n\n${result.cta}\n\n${result.hashtags.join(" ")}`,
        visual_prompt: `${result.visual_prompt}\n\nNegative: ${result.negative_prompt}`,
        shot_list: result.shot_list,
        disclosure: result.disclosure,
      });
      setGenerated(true);
    } catch (error) {
      setGenerationError(
        error instanceof Error ? error.message : "AI-генерация не удалась",
      );
    } finally {
      setGenerating(false);
    }
  }
  return (
    <Modal close={close}>
      <small>ATLAS CREATIVE ENGINE</small>
      <h2>Создать пакет контента</h2>
      <div className="form">
        <label>
          AI-модель
          <select
            value={x.model_id || ""}
            onChange={(e) => setX({ ...x, model_id: e.target.value })}
          >
            {models.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>
        <div className="cols">
          <label>
            Площадка
            <select
              value={x.platform || ""}
              onChange={(e) => setX({ ...x, platform: e.target.value })}
            >
              <option>Instagram</option>
              <option>TikTok</option>
              <option>YouTube Shorts</option>
              <option>Telegram</option>
            </select>
          </label>
          <label>
            Формат
            <select
              value={x.format || ""}
              onChange={(e) => setX({ ...x, format: e.target.value })}
            >
              <option>Reels</option>
              <option>Карусель</option>
              <option>Пост</option>
              <option>Stories</option>
            </select>
          </label>
        </div>
        <label>
          Тема или идея
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="Например: спокойный воскресный уход"
          />
        </label>
        <label>
          Цель
          <select value={goal} onChange={(e) => setGoal(e.target.value)}>
            <option>Вовлечение аудитории</option>
            <option>Рост охвата</option>
            <option>Укрепление образа модели</option>
            <option>Продажа продукта</option>
            <option>Рекламная интеграция</option>
          </select>
        </label>
        {!generated && (
          <button
            className="generate"
            onClick={generate}
            disabled={!topic || !models.length || generating}
          >
            {generating ? "Atlas создаёт магию…" : "✦ Сгенерировать с OpenAI"}
          </button>
        )}
        {generationError && (
          <strong className="generation-error">{generationError}</strong>
        )}
        {generated && (
          <>
            <label>
              Название
              <input
                value={x.title || ""}
                onChange={(e) => setX({ ...x, title: e.target.value })}
              />
            </label>
            <label>
              Текст
              <textarea
                value={x.caption || ""}
                onChange={(e) => setX({ ...x, caption: e.target.value })}
              />
            </label>
            <label>
              AI-дисклоуз (виден в подписи/профиле)
              <input
                value={x.disclosure || ""}
                onChange={(e) => setX({ ...x, disclosure: e.target.value })}
              />
            </label>
            <label>
              Покадровый сценарий
              <textarea
                value={(x.shot_list || []).join("\n")}
                onChange={(e) =>
                  setX({ ...x, shot_list: e.target.value.split("\n") })
                }
              />
            </label>
            <label>
              Визуальный промпт
              <textarea
                value={x.visual_prompt || ""}
                onChange={(e) => setX({ ...x, visual_prompt: e.target.value })}
              />
            </label>
            <label>
              Дата публикации
              <input
                type="datetime-local"
                onChange={(e) =>
                  setX({
                    ...x,
                    publish_at: e.target.value
                      ? new Date(e.target.value).toISOString()
                      : null,
                  })
                }
              />
            </label>
            <button onClick={() => x.title && save(x)}>
              Сохранить в контент-план
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
function WeekPlanner({
  models,
  accounts,
  presetModelId,
  history,
  close,
  save,
}: {
  models: Model[];
  accounts: SocialAccount[];
  presetModelId?: string;
  history: Item[];
  close: () => void;
  save: (x: Partial<Item>[]) => void;
}) {
  const [modelId, setModelId] = useState(presetModelId || models[0]?.id || ""),
    [theme, setTheme] = useState(""),
    [goal, setGoal] = useState("Рост аудитории и укрепление образа модели"),
    [start, setStart] = useState(new Date().toISOString().slice(0, 10)),
    [stage, setStage] = useState<"idle" | "trend" | "validate" | "generate">("idle"),
    [error, setError] = useState(""),
    [trendError, setTrendError] = useState(""),
    [trend, setTrend] = useState<{ summary: string; angles: string[] } | null>(null),
    [warnings, setWarnings] = useState<string[]>([]),
    [plan, setPlan] = useState<{
      week_theme: string;
      strategy: string;
      posts: Array<Record<string, unknown>>;
    } | null>(null);
  const model = models.find((mm) => mm.id === modelId);
  const platformLabels = useMemo(() => {
    const connected = accounts
      .filter((a) => a.model_id === modelId && a.platform !== "fanvue")
      .map((a) => PLATFORM_LABELS[a.platform] || a.platform);
    const unique = Array.from(new Set(connected));
    return unique.length ? unique : ["Instagram", "TikTok", "Telegram"];
  }, [accounts, modelId]);
  const loading = stage !== "idle";
  async function runPipeline() {
    if (!model) return;
    setError("");
    setTrendError("");
    setWarnings([]);
    setTrend(null);
    setStage("trend");
    let angles: string[] = [];
    try {
      const r = await fetch("/api/trends", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            niche: model.niche,
            bio: model.bio,
            platforms: platformLabels,
          }),
        }),
        data = await r.json();
      if (r.ok) {
        setTrend(data);
        angles = data.angles || [];
      } else {
        setTrendError(data.error || "Не удалось проверить тренды, продолжаем без них.");
      }
    } catch {
      setTrendError("Не удалось проверить тренды, продолжаем без них.");
    }
    setStage("validate");
    const forbidden = (model.visual_passport?.forbidden_topics || "")
      .split(/[,;]/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    const hitsForbidden = (text: string) =>
      forbidden.find((w) => w && text.toLowerCase().includes(w));
    const safeAngles = angles.filter((a) => !hitsForbidden(a));
    const finalTheme =
      theme.trim() ||
      safeAngles.slice(0, 2).join(" · ") ||
      model.niche ||
      "Актуальная неделя контента";
    setStage("generate");
    try {
      const r = await fetch("/api/plan-week", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            model,
            theme: finalTheme,
            goal,
            platforms: platformLabels,
            history: history.map((x) => x.title),
          }),
        }),
        data = await r.json();
      if (!r.ok) throw new Error(data.error);
      const foundWarnings: string[] = [];
      for (const p of data.posts as Array<Record<string, unknown>>) {
        const text = `${String(p.caption || "")} ${String(p.visual_prompt || "")}`;
        const hit = hitsForbidden(text);
        if (hit)
          foundWarnings.push(
            `«${String(p.title)}» (${String(p.platform)}): похоже, задевает запрещённую тему «${hit}» — проверь вручную.`,
          );
        if (!String(p.disclosure || "").trim())
          foundWarnings.push(
            `«${String(p.title)}» (${String(p.platform)}): нет AI-дисклоуза — добавь перед публикацией.`,
          );
      }
      setWarnings(foundWarnings);
      setPlan(data);
      if (!theme.trim() && safeAngles.length) setTheme(finalTheme);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка планирования");
    } finally {
      setStage("idle");
    }
  }
  function commit() {
    if (!plan) return;
    const base = new Date(start + "T09:00:00");
    save(
      plan.posts.map((p) => {
        const d = new Date(base);
        d.setDate(d.getDate() + Number(p.day_offset));
        const [h, m] = String(p.publish_time).split(":");
        d.setHours(Number(h), Number(m));
        return {
          model_id: modelId,
          title: String(p.title),
          platform: String(p.platform),
          format: String(p.format),
          status: "review",
          caption: `${p.hook}\n\n${p.caption}\n\n${p.cta}\n\n${(p.hashtags as string[]).join(" ")}`,
          visual_prompt: String(p.visual_prompt),
          shot_list: p.shot_list as string[],
          publish_at: d.toISOString(),
          disclosure: String(p.disclosure ?? ""),
          trend_note: trend?.summary || null,
        };
      }),
    );
  }
  return (
    <Modal close={close}>
      <small>ATLAS WEEKLY DIRECTOR</small>
      <h2>Создать неделю контента</h2>
      {!plan ? (
        <div className="form">
          <label>
            AI-модель
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </label>
          <div className="week-platforms">
            <small>ПЛОЩАДКИ ИЗ ПОДКЛЮЧЁННЫХ АККАУНТОВ</small>
            <div>
              {platformLabels.map((p) => (
                <span key={p} className="platform-chip">{p}</span>
              ))}
            </div>
          </div>
          <label>
            Главная тема недели — необязательно
            <input
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
              placeholder="Оставь пустым — Atlas предложит тему по трендам"
            />
          </label>
          <label>
            Цель недели
            <select value={goal} onChange={(e) => setGoal(e.target.value)}>
              <option>Рост аудитории и укрепление образа модели</option>
              <option>Вовлечение существующей аудитории</option>
              <option>Подготовка к рекламной интеграции</option>
              <option>Продвижение продукта</option>
            </select>
          </label>
          <label>
            Начало недели
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <div className="week-info">
            Atlas проверит тренды, подготовит и проверит тему, затем создаст 7
            связанных публикаций под площадки выше — без повтора последних
            материалов.
          </div>
          <button onClick={runPipeline} disabled={loading || !modelId}>
            {stage === "trend"
              ? "1/3 · Проверяем, что сейчас популярно…"
              : stage === "validate"
                ? "2/3 · Проверяем тему…"
                : stage === "generate"
                  ? "3/3 · Генерируем неделю…"
                  : "✦ Сгенерировать неделю"}
          </button>
          {trendError && <small className="trend-warning">{trendError}</small>}
          {error && <strong className="generation-error">{error}</strong>}
        </div>
      ) : (
        <div className="week-result">
          <div className="week-summary">
            <small>ТЕМА НЕДЕЛИ</small>
            <h3>{plan.week_theme}</h3>
            <p>{plan.strategy}</p>
            {trend && (
              <div className="trend-badge">
                <b>Учтён тренд</b>
                <span>{trend.summary}</span>
              </div>
            )}
          </div>
          {warnings.length > 0 && (
            <div className="week-warnings">
              <b>Проверь перед добавлением в календарь:</b>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="week-posts">
            {plan.posts.map((p, i) => (
              <article key={`${String(p.day_offset)}-${String(p.publish_time)}-${String(p.platform)}-${String(p.format)}-${String(p.title)}-${String(p.goal)}`}>
                <span>{i + 1}</span>
                <div>
                  <b>{String(p.title)}</b>
                  <small>
                    {String(p.platform)} · {String(p.format)} ·{" "}
                    {String(p.publish_time)}
                  </small>
                </div>
                <i>{String(p.goal)}</i>
              </article>
            ))}
          </div>
          <div className="week-actions">
            <button onClick={() => setPlan(null)}>Изменить задачу</button>
            <button onClick={commit}>
              ✓ Добавить 7 публикаций на проверку
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
const PLATFORM_LIMITS: Record<string, number> = {
  Instagram: 2200,
  TikTok: 2200,
  Telegram: 4096,
  "YouTube Shorts": 5000,
  Reddit: 300,
  X: 280,
};
function PostTextEditor({
  value,
  onChange,
  placeholder,
  platform,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  platform?: string | null;
}) {
  const limit = platform ? PLATFORM_LIMITS[platform] : undefined;
  const len = value.length;
  const over = limit ? len > limit : false;
  const hashtags = value.match(/#[\p{L}\d_]+/gu) || [];
  return (
    <div className="post-editor">
      <textarea
        className="post-editor-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={Math.min(14, Math.max(3, value.split("\n").length + 1))}
      />
      <div className="post-editor-meta">
        <span>{hashtags.length > 0 ? `${hashtags.length} хэштегов` : ""}</span>
        <span className={over ? "post-editor-count over" : "post-editor-count"}>
          {len}
          {limit ? ` / ${limit}` : ""}
        </span>
      </div>
    </div>
  );
}
function Modal({
  children,
  close,
}: {
  children: React.ReactNode;
  close: () => void;
}) {
  return (
    <div className="overlay">
      <section className="modal">
        <button className="close" onClick={close}>
          ×
        </button>
        {children}
      </section>
    </div>
  );
}
function Empty({ text, action }: { text: string; action?: () => void }) {
  return (
    <div className="empty">
      <b>{text}</b>
      {action && <button onClick={action}>Создать</button>}
    </div>
  );
}
