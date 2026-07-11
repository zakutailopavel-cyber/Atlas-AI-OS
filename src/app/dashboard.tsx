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
  asset_url?: string | null;
  review_comment?: string | null;
};
const menu = [
  "Главная",
  "AI-модели",
  "Контент-студия",
  "Календарь",
  "Команда",
  "Настройки",
];
export default function Dashboard({ user }: { user: User }) {
  const s = useMemo(() => createClient(), []),
    [page, setPage] = useState("Главная"),
    [models, setModels] = useState<Model[]>([]),
    [items, setItems] = useState<Item[]>([]),
    [team, setTeam] = useState<{ email: string; role: string }[]>([]),
    [loading, setLoading] = useState(true),
    [modelOpen, setModelOpen] = useState<Model | null | undefined>(),
    [contentOpen, setContentOpen] = useState(false),
    [weekOpen, setWeekOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  async function load() {
    setLoading(true);
    const [m, c, t] = await Promise.all([
      s.from("ai_models").select("*").order("created_at"),
      s
        .from("content_items")
        .select("*")
        .order("created_at", { ascending: false }),
      s.from("profiles").select("email,role").order("created_at"),
    ]);
    setModels(m.data || []);
    setItems(c.data || []);
    setTeam(t.data || []);
    setLoading(false);
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
    await s.from("content_items").insert(posts.map((x) => ({ ...x, created_by: user.id })));
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
      })
      .eq("id", item.id);
    setSelectedItem(null);
    load();
  }
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
              className={page === n ? "active" : ""}
              onClick={() => setPage(n)}
            >
              {["⌂", "◉", "✦", "▦", "♙", "⚙"][i]} {n}
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
            <small>РАБОЧЕЕ ПРОСТРАНСТВО ATLAS</small>
            <h1>{page}</h1>
          </div>
          <span>● {loading ? "Синхронизация…" : "Все данные сохранены"}</span>
        </header>
        <div className="content">
          {page === "Главная" && (
            <Home
              models={models}
              items={items}
              create={() => setContentOpen(true)}
            />
          )}{" "}
          {page === "AI-модели" && (
            <Models
              models={models}
              add={() => setModelOpen(null)}
              edit={setModelOpen}
            />
          )}{" "}
          {page === "Контент-студия" && (
            <Studio
              items={items}
              models={models}
              add={() => setContentOpen(true)}
              status={status}
              open={setSelectedItem}
              plan={() => setWeekOpen(true)}
            />
          )}{" "}
          {page === "Календарь" && <Calendar items={items} />}{" "}
          {page === "Команда" && <Team team={team} />}{" "}
          {page === "Настройки" && <Settings user={user} />}
        </div>
      </main>
      {modelOpen !== undefined && (
        <ModelDialog
          model={modelOpen}
          close={() => setModelOpen(undefined)}
          save={saveModel}
        />
      )}{" "}
      {contentOpen && (
        <ContentDialog
          models={models}
          close={() => setContentOpen(false)}
          save={saveItem}
        />
      )}
      {selectedItem && (
        <PublicationDialog
          item={selectedItem}
          model={models.find((m) => m.id === selectedItem.model_id)}
          close={() => setSelectedItem(null)}
          save={updateItem}
        />
      )}
      {weekOpen && (
        <WeekPlanner
          models={models}
          history={items.slice(0, 20)}
          close={() => setWeekOpen(false)}
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
}: {
  models: Model[];
  items: Item[];
  create: () => void;
}) {
  return (
    <>
      <section className="hero">
        <small>ТВОЯ КОНТЕНТ-ФАБРИКА</small>
        <h2>
          Творческая вселенная
          <br />
          <em>работает вместе.</em>
        </h2>
        <p>
          Модели, идеи и публикации доступны команде в одном закрытом
          пространстве.
        </p>
        <button onClick={create}>✦ Создать контент</button>
      </section>
      <div className="stats">
        {[
          ["AI-МОДЕЛИ", models.length],
          ["КОНТЕНТ", items.length],
          ["ГОТОВО", items.filter((x) => x.status === "ready").length],
          ["ЗАПЛАНИРОВАНО", items.filter((x) => x.publish_at).length],
        ].map((x) => (
          <article>
            <small>{x[0]}</small>
            <b>{x[1]}</b>
            <span>общая база</span>
          </article>
        ))}
      </div>
      <h2>Последние публикации</h2>
      <ContentList items={items.slice(0, 5)} models={models} />
    </>
  );
}
function Models({
  models,
  add,
  edit,
}: {
  models: Model[];
  add: () => void;
  edit: (m: Model) => void;
}) {
  return (
    <>
      <div className="toolbar">
        <p>Создавай постоянные цифровые личности для всех каналов.</p>
        <button onClick={add}>+ Новая AI-модель</button>
      </div>
      {models.length ? (
        <div className="models">
          {models.map((m, i) => (
            <article onClick={() => edit(m)}>
              <div className={"portrait p" + (i % 3)} />
              <h3>{m.name}</h3>
              <p>{m.niche || "Ниша не указана"}</p>
              <small>{m.status}</small>
            </article>
          ))}
        </div>
      ) : (
        <Empty text="Пока нет AI-моделей" action={add} />
      )}
    </>
  );
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
        <div className="studio-actions"><button className="week-button" onClick={plan}>▦ Создать неделю</button><button onClick={add}>✦ Один материал</button></div>
      </div>
      {items.length ? (
        <ContentList items={items} models={models} status={status} open={open} />
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
        <article onClick={() => open?.(x)}>
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
function Calendar({ items }: { items: Item[] }) {
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
              <article>
                <time>
                  {new Date(x.publish_at!).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "long",
                  })}
                </time>
                <div>
                  <b>{x.title}</b>
                  <p>
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
function Team({ team }: { team: { email: string; role: string }[] }) {
  return (
    <div className="team">
      {team.map((x) => (
        <article>
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
function ModelDialog({
  model,
  close,
  save,
}: {
  model: Model | null;
  close: () => void;
  save: (m: Partial<Model>) => void;
}) {
  const [m, setM] = useState<Partial<Model>>(
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
      },
    },
  );
  return (
    <Modal close={close}>
      <small>ВИЗУАЛЬНАЯ ЛИЧНОСТЬ</small>
      <h2>{model ? "Редактировать модель" : "Новая AI-модель"}</h2>
      <div className="form">
        {(["name", "handle", "niche", "bio"] as const).map((k) => (
          <label>
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
          Описание внешности
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
          />
        </label>
        <label>
          Seed
          <input
            value={m.visual_passport?.seed || ""}
            onChange={(e) =>
              setM({
                ...m,
                visual_passport: { ...m.visual_passport, seed: e.target.value },
              })
            }
          />
        </label>
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
              <option value={m.id}>{m.name}</option>
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
        {generationError && <strong className="generation-error">{generationError}</strong>}
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
function WeekPlanner({models,history,close,save}:{models:Model[];history:Item[];close:()=>void;save:(x:Partial<Item>[])=>void}){
  const [modelId,setModelId]=useState(models[0]?.id||""),[theme,setTheme]=useState(""),[goal,setGoal]=useState("Рост аудитории и укрепление образа модели"),[start,setStart]=useState(new Date().toISOString().slice(0,10)),[loading,setLoading]=useState(false),[error,setError]=useState(""),[plan,setPlan]=useState<{week_theme:string;strategy:string;posts:Array<Record<string,unknown>>}|null>(null);
  async function create(){const model=models.find(m=>m.id===modelId);if(!model||!theme)return;setLoading(true);setError("");try{const r=await fetch('/api/plan-week',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,theme,goal,platforms:['Instagram','TikTok','Telegram'],history:history.map(x=>x.title)})}),data=await r.json();if(!r.ok)throw new Error(data.error);setPlan(data)}catch(e){setError(e instanceof Error?e.message:'Ошибка планирования')}finally{setLoading(false)}}
  function commit(){if(!plan)return;const base=new Date(start+'T09:00:00');save(plan.posts.map((p)=>{const d=new Date(base);d.setDate(d.getDate()+Number(p.day_offset));const [h,m]=String(p.publish_time).split(':');d.setHours(Number(h),Number(m));return {model_id:modelId,title:String(p.title),platform:String(p.platform),format:String(p.format),status:'draft',caption:`${p.hook}\n\n${p.caption}\n\n${p.cta}\n\n${(p.hashtags as string[]).join(' ')}`,visual_prompt:String(p.visual_prompt),shot_list:p.shot_list as string[],publish_at:d.toISOString()}}))}
  return <Modal close={close}><small>ATLAS WEEKLY DIRECTOR</small><h2>Создать неделю контента</h2>{!plan?<div className="form"><label>AI-модель<select value={modelId} onChange={e=>setModelId(e.target.value)}>{models.map(m=><option value={m.id}>{m.name}</option>)}</select></label><label>Главная тема недели<input value={theme} onChange={e=>setTheme(e.target.value)} placeholder="Например: мягкий переход к осеннему уходу"/></label><label>Цель недели<select value={goal} onChange={e=>setGoal(e.target.value)}><option>Рост аудитории и укрепление образа модели</option><option>Вовлечение существующей аудитории</option><option>Подготовка к рекламной интеграции</option><option>Продвижение продукта</option></select></label><label>Начало недели<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label><div className="week-info">Один AI-запрос создаст 7 связанных публикаций, не повторяя последние материалы.</div><button onClick={create} disabled={loading||!theme}>{loading?'Atlas планирует неделю…':'✦ Создать недельный план'}</button>{error&&<strong className="generation-error">{error}</strong>}</div>:<div className="week-result"><div className="week-summary"><small>ТЕМА НЕДЕЛИ</small><h3>{plan.week_theme}</h3><p>{plan.strategy}</p></div><div className="week-posts">{plan.posts.map((p,i)=><article><span>{i+1}</span><div><b>{String(p.title)}</b><small>{String(p.platform)} · {String(p.format)} · {String(p.publish_time)}</small></div><i>{String(p.goal)}</i></article>)}</div><div className="week-actions"><button onClick={()=>setPlan(null)}>Изменить задачу</button><button onClick={commit}>✓ Добавить 7 публикаций в календарь</button></div></div>}</Modal>
}
function PublicationDialog({item,model,close,save}:{item:Item;model?:Model;close:()=>void;save:(x:Partial<Item>)=>void}){
  const [draft,setDraft]=useState<Partial<Item>>(item),[tab,setTab]=useState("Предпросмотр");
  return <Modal close={close}><div className="publication-head"><div><small>{draft.platform} · {draft.format}</small><h2>{draft.title}</h2><p>{model?.name||"Без модели"}</p></div><select value={draft.status} onChange={e=>setDraft({...draft,status:e.target.value})}><option value="draft">Черновик</option><option value="review">На проверке</option><option value="ready">Согласовано</option><option value="published">Опубликовано</option></select></div><div className="publication-tabs">{["Предпросмотр","Материалы","Согласование"].map(x=><button className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</div>{tab==="Предпросмотр"&&<div className="social-preview"><div className="social-bar"><b>{model?.handle||model?.name}</b><span>•••</span></div><div className="visual-stage">{draft.asset_url?<img src={draft.asset_url}/>:<div><b>Визуал ещё не прикреплён</b><span>Добавь ссылку во вкладке «Материалы»</span></div>}</div><p>{draft.caption}</p></div>}{tab==="Материалы"&&<div className="form"><label>Ссылка на готовое изображение<input value={draft.asset_url||""} onChange={e=>setDraft({...draft,asset_url:e.target.value})} placeholder="https://..."/></label><label>Текст публикации<textarea value={draft.caption||""} onChange={e=>setDraft({...draft,caption:e.target.value})}/></label><label>Визуальный промпт<textarea value={draft.visual_prompt||""} onChange={e=>setDraft({...draft,visual_prompt:e.target.value})}/></label><label>Дата публикации<input type="datetime-local" onChange={e=>setDraft({...draft,publish_at:e.target.value?new Date(e.target.value).toISOString():null})}/></label></div>}{tab==="Согласование"&&<div className="approval"><div className="approval-state"><b>{draft.status==="ready"?"✓ Материал согласован":"Материал ожидает решения"}</b><p>Оставь комментарий для команды или измени статус публикации.</p></div><label>Комментарий редактора<textarea value={draft.review_comment||""} onChange={e=>setDraft({...draft,review_comment:e.target.value})} placeholder="Что изменить или проверить?"/></label><div className="approval-buttons"><button onClick={()=>setDraft({...draft,status:"review"})}>Вернуть на проверку</button><button onClick={()=>setDraft({...draft,status:"ready"})}>✓ Согласовать</button></div></div>}<button className="save-publication" onClick={()=>save(draft)}>Сохранить изменения</button></Modal>
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
