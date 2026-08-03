"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Model = {
  id: string;
  name: string;
  handle: string | null;
  niche: string | null;
  bio: string | null;
  status: string;
  visual_passport: Record<string, string> | null;
};

type Reference = {
  id: string;
  model_id: string;
  storage_path: string;
  kind: string;
  created_at: string;
};

type Item = {
  id: string;
  model_id: string | null;
  title: string;
  platform: string | null;
  format: string | null;
  status: string;
  asset_url: string | null;
  publish_at: string | null;
  created_at: string;
};

type Account = {
  id: string;
  model_id: string;
  platform: string;
  handle: string;
};

type Job = {
  id: string;
  model_id: string;
  kind: "avatar" | "scene" | "faceswap";
  status: string;
  output_urls: string[] | null;
  created_at: string;
};

function readiness(model: Model, refs: Reference[], items: Item[], accounts: Account[]) {
  const brainFields = [
    model.bio,
    model.visual_passport?.appearance,
    model.visual_passport?.tone,
    model.visual_passport?.biography,
    model.visual_passport?.storyline,
  ];
  const brain = brainFields.filter((value) => String(value || "").trim()).length;
  const checks = [
    brain >= 4,
    Boolean(model.visual_passport?.avatar),
    refs.length >= 3,
    accounts.length > 0,
    items.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

const kindLabel: Record<Job["kind"], string> = {
  avatar: "Лицо",
  scene: "Сцена",
  faceswap: "Фото",
};

export default function AtlasStudioClient({
  models,
  references,
  items,
  accounts,
}: {
  models: Model[];
  references: Reference[];
  items: Item[];
  accounts: Account[];
}) {
  const [modelId, setModelId] = useState(models[0]?.id || "");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsError, setJobsError] = useState("");

  useEffect(() => {
    let active = true;
    async function loadJobs() {
      try {
        const response = await fetch("/api/avatar");
        if (!response.ok) throw new Error("Не удалось загрузить очередь");
        const data = await response.json();
        if (active) setJobs(data.jobs || []);
      } catch (error) {
        if (active)
          setJobsError(error instanceof Error ? error.message : "Ошибка очереди");
      }
    }
    loadJobs();
    const timer = window.setInterval(loadJobs, 10000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  const model = models.find((entry) => entry.id === modelId) || models[0];
  const ownReferences = useMemo(
    () => references.filter((entry) => entry.model_id === model?.id),
    [references, model?.id],
  );
  const ownItems = useMemo(
    () => items.filter((entry) => entry.model_id === model?.id),
    [items, model?.id],
  );
  const ownAccounts = useMemo(
    () => accounts.filter((entry) => entry.model_id === model?.id),
    [accounts, model?.id],
  );
  const ownJobs = useMemo(
    () => jobs.filter((entry) => entry.model_id === model?.id),
    [jobs, model?.id],
  );

  if (!model) {
    return (
      <main className="atlas-studio-empty">
        <h1>Atlas Studio</h1>
        <p>Сначала создай AI-модель. Даже фабрике контента нужен хотя бы один работник.</p>
        <Link href="/">Вернуться в Atlas</Link>
      </main>
    );
  }

  const score = readiness(model, ownReferences, ownItems, ownAccounts);
  const activeContent = ownItems.filter((item) => item.status !== "published");

  return (
    <main className="atlas-studio-shell">
      <aside className="atlas-studio-models">
        <Link href="/" className="atlas-studio-back">← Atlas</Link>
        <div className="atlas-studio-brand">
          <small>ATLAS CREATIVE OS</small>
          <h1>Studio</h1>
          <p>Один персонаж. Один производственный поток.</p>
        </div>
        <div className="atlas-studio-model-list">
          {models.map((entry) => (
            <button
              key={entry.id}
              className={entry.id === model.id ? "active" : ""}
              onClick={() => setModelId(entry.id)}
            >
              <span
                className="atlas-studio-model-avatar"
                style={
                  entry.visual_passport?.avatar
                    ? { backgroundImage: `url(${entry.visual_passport.avatar})` }
                    : undefined
                }
              >
                {!entry.visual_passport?.avatar && entry.name.slice(0, 1)}
              </span>
              <span>
                <b>{entry.name}</b>
                <small>{entry.niche || "Ниша не задана"}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="atlas-studio-workspace">
        <header className="atlas-studio-header">
          <div>
            <small>ПРОИЗВОДСТВЕННЫЙ ЦЕНТР</small>
            <h2>{model.name}</h2>
            <p>{model.handle || "Профиль не указан"} · {model.niche || "Ниша не указана"}</p>
          </div>
          <div className="atlas-studio-score">
            <span>{score}%</span>
            <small>готовность</small>
          </div>
        </header>

        <section className="atlas-studio-hero">
          <div
            className="atlas-studio-portrait"
            style={
              model.visual_passport?.avatar
                ? { backgroundImage: `url(${model.visual_passport.avatar})` }
                : undefined
            }
          >
            {!model.visual_passport?.avatar && <span>{model.name.slice(0, 1)}</span>}
          </div>
          <div className="atlas-studio-identity">
            <small>IDENTITY SNAPSHOT</small>
            <h3>{model.visual_passport?.appearance || "Внешность ещё не зафиксирована"}</h3>
            <p>{model.bio || "Описание персонажа пока пустое."}</p>
            <div className="atlas-studio-pills">
              <span>{ownReferences.length} референсов</span>
              <span>{ownAccounts.length} площадок</span>
              <span>{ownItems.length} материалов</span>
            </div>
          </div>
        </section>

        <section className="atlas-studio-actions">
          <Link href="/?open=avatar&kind=avatar&modelId=" className="primary">Создать лицо</Link>
          <Link href="/?open=avatar&kind=scene&modelId=" className="primary">Создать сцену</Link>
          <Link href="/?open=avatar&kind=faceswap&modelId=" className="secondary">Загрузить фото</Link>
          <Link href="/?open=week&modelId=" className="secondary">План на неделю</Link>
        </section>

        <section className="atlas-studio-readiness">
          {[
            ["Character Brain", Boolean(model.bio && model.visual_passport?.tone && model.visual_passport?.biography)],
            ["Главное лицо", Boolean(model.visual_passport?.avatar)],
            ["Reference Library", ownReferences.length >= 3],
            ["Площадки", ownAccounts.length > 0],
            ["Контент-поток", ownItems.length > 0],
          ].map(([label, done]) => (
            <article key={String(label)} className={done ? "done" : "pending"}>
              <span>{done ? "✓" : "·"}</span>
              <div><b>{String(label)}</b><small>{done ? "Готово" : "Нужно заполнить"}</small></div>
            </article>
          ))}
        </section>

        <div className="atlas-studio-columns">
          <section className="atlas-studio-panel">
            <header><div><small>GENERATION QUEUE</small><h3>Последние генерации</h3></div><span>{ownJobs.length}</span></header>
            {jobsError && <p className="atlas-studio-error">{jobsError}</p>}
            <div className="atlas-studio-generation-grid">
              {ownJobs.slice(0, 6).map((job) => {
                const image = job.output_urls?.[0];
                return (
                  <article key={job.id}>
                    <div className="atlas-studio-generation-image" style={image ? { backgroundImage: `url(${image})` } : undefined}>
                      {!image && <span>{job.status}</span>}
                    </div>
                    <div><b>{kindLabel[job.kind]}</b><small>{new Date(job.created_at).toLocaleString("ru-RU")}</small></div>
                  </article>
                );
              })}
              {!ownJobs.length && <p className="atlas-studio-muted">У персонажа пока нет генераций.</p>}
            </div>
          </section>

          <section className="atlas-studio-panel">
            <header><div><small>CONTENT PIPELINE</small><h3>Контент в работе</h3></div><span>{activeContent.length}</span></header>
            <div className="atlas-studio-content-list">
              {activeContent.slice(0, 7).map((item) => (
                <Link href={`/?modelId=${model.id}&itemId=${item.id}`} key={item.id}>
                  <span className="atlas-studio-content-thumb" style={item.asset_url ? { backgroundImage: `url(${item.asset_url})` } : undefined} />
                  <div><b>{item.title}</b><small>{item.platform || item.format || "Без формата"}</small></div>
                  <em>{item.status}</em>
                </Link>
              ))}
              {!activeContent.length && <p className="atlas-studio-muted">Контент ещё не создан.</p>}
            </div>
          </section>
        </div>

        <section className="atlas-studio-library">
          <header><div><small>REFERENCE LIBRARY</small><h3>Визуальная память персонажа</h3></div><span>{ownReferences.length}</span></header>
          <div>
            {ownReferences.slice(0, 10).map((reference) => (
              <article key={reference.id} style={{ backgroundImage: `url(${reference.storage_path})` }}>
                <span>{reference.kind}</span>
              </article>
            ))}
            {!ownReferences.length && <p className="atlas-studio-muted">Сохрани первые эталонные изображения.</p>}
          </div>
        </section>
      </section>
    </main>
  );
}
