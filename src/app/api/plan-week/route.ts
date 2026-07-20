import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";
export const runtime = "nodejs";
const item = {
  type: "object",
  additionalProperties: false,
  properties: {
    day_offset: { type: "integer", minimum: 0, maximum: 6 },
    title: { type: "string" },
    platform: {
      type: "string",
      enum: ["Instagram", "TikTok", "YouTube Shorts", "Telegram"],
    },
    format: { type: "string", enum: ["Reels", "Карусель", "Пост", "Stories"] },
    goal: { type: "string" },
    hook: { type: "string" },
    caption: { type: "string" },
    cta: { type: "string" },
    shot_list: {
      type: "array",
      items: { type: "string" },
      minItems: 4,
      maxItems: 7,
    },
    visual_prompt: { type: "string" },
    hashtags: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 10,
    },
    publish_time: { type: "string", pattern: "^[0-2][0-9]:[0-5][0-9]$" },
    disclosure: { type: "string" },
  },
  required: [
    "day_offset",
    "title",
    "platform",
    "format",
    "goal",
    "hook",
    "caption",
    "cta",
    "shot_list",
    "visual_prompt",
    "hashtags",
    "publish_time",
    "disclosure",
  ],
};
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    week_theme: { type: "string" },
    strategy: { type: "string" },
    posts: { type: "array", items: item, minItems: 7, maxItems: 7 },
  },
  required: ["week_theme", "strategy", "posts"],
};
export async function POST(req: Request) {
  const supabase = await createClient(),
    {
      data: { user },
    } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Требуется авторизация" },
      { status: 401 },
    );
  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json(
      { error: "OpenAI API не настроен" },
      { status: 503 },
    );
  const body = await req.json();
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: { effort: "low" },
      store: false,
      max_output_tokens: 7000,
      instructions:
        "Ты — контент-стратег Atlas AI OS. Создай целостную неделю контента на русском языке. Все 7 публикаций должны отличаться по углу, задаче и формату, но развивать текущую сюжетную линию персонажа. Строго соблюдай биографию, неизменяемые факты, словарь, ценности, бренды и запрещённые темы из памяти модели. Не повторяй идеи из переданной истории. Визуальные промпты пиши на английском, строго сохраняя внешность цифровой модели. Хэштеги возвращай с #. У каждого из 7 постов поле disclosure — короткая (до 12 слов) фраза о том, что это ИИ-персонаж, подходящая для видимого размещения в подписи. Никогда не оставляй пустым.",
      input: `Модель и её полная память: ${JSON.stringify(body.model)}\nЦель недели: ${body.goal}\nГлавная тема: ${body.theme}\nПлощадки: ${body.platforms?.join(", ")}\nНедавний контент, который нельзя повторять: ${JSON.stringify(body.history || [])}`,
      text: {
        format: {
          type: "json_schema",
          name: "atlas_week_plan",
          strict: true,
          schema,
        },
      },
    });
    if (!r.output_text) throw new Error("Пустой ответ");
    return NextResponse.json(JSON.parse(r.output_text));
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      {
        error:
          "Не удалось создать неделю. Проверь баланс API и повтори попытку.",
      },
      { status: 502 },
    );
  }
}
