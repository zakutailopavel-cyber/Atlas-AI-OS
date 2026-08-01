import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";
export const runtime = "nodejs";
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    angles: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 5,
    },
  },
  required: ["summary", "angles"],
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
      max_output_tokens: 2600,
      tools: [{ type: "web_search" }],
      instructions:
        "Ты — контент-аналитик Atlas AI OS. Одним поиском найди, что сейчас (в течение последних 1–2 недель) реально заходит в нише пользователя на указанных площадках: форматы, темы, звуки/тренды, если применимо. Дай короткую (3–5 предложений) сводку на русском без ссылок и без дат из будущего. Затем предложи 3–5 конкретных углов подачи контента для этой ниши и площадок, которые учитывают тренд, но остаются в рамках биографии и ценностей персонажа. Не выдумывай несуществующие тренды — если поиск не даёт ничего конкретного, честно опирайся на устойчивые сезонные закономерности и явно скажи, что это не сиюминутный тренд.",
      input: `Ниша персонажа: ${body.niche || "не указана"}\nПлощадки: ${(body.platforms || []).join(", ") || "не указаны"}\nКраткое описание персонажа: ${body.bio || ""}`,
      text: {
        format: {
          type: "json_schema",
          name: "atlas_trend_brief",
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
          "Не удалось проверить тренды. Можно продолжить без них — план недели всё равно создастся.",
      },
      { status: 502 },
    );
  }
}
