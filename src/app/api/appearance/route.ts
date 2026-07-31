import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";
export const runtime = "nodejs";
const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    appearance: { type: "string" },
  },
  required: ["appearance"],
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
  const model = body.model || {};
  try {
    const { data: others } = await supabase
      .from("ai_models")
      .select("id, name, visual_passport")
      .neq("id", model.id || "00000000-0000-0000-0000-000000000000")
      .limit(60);
    const usedLooks = (others || [])
      .map((m) => String(m.visual_passport?.appearance || "").trim())
      .filter((text) => text.length > 0)
      .slice(0, 30);
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const r = await openai.responses.create({
      model: "gpt-5.4-mini",
      reasoning: { effort: "low" },
      store: false,
      max_output_tokens: 400,
      instructions:
        "Ты создаёшь одно уникальное, конкретное описание внешности вымышленной совершеннолетней (21+, точный возраст обязателен) AI-персоны для системы генерации фотореалистичных портретов. Опиши на английском (это часть промпта для image-модели), 70-100 слов, в свободной форме одним абзацем: точный возраст, этническое происхождение, форму лица, глаза, нос, губы, цвет и структуру волос, тип и тон кожи, телосложение и одну отличительную деталь (родинка, лёгкая асимметрия, шрам и т.п.). Обязательно выбери сочетание этничности, цвета волос и формы лица, которое НЕ повторяет ни один из уже использованных образов ниже — если задан ниша/био персонажа, они не обязывают к конкретной внешности, ориентируйся только на уникальность. Никаких меток, списков и комментариев — только сам абзац описания.",
      input: `Имя персонажа: ${model.name || "не указано"}\nНиша: ${model.niche || "не указана"}\nБио: ${model.bio || ""}\nУже использованные образы других персонажей (не повторять комбинацию этничность+волосы+форма лица):\n${usedLooks.map((t, i) => `${i + 1}. ${t}`).join("\n") || "(пока нет других образов)"}`,
      text: {
        format: {
          type: "json_schema",
          name: "atlas_appearance",
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
        error: "Не удалось сгенерировать внешность. Попробуй ещё раз.",
      },
      { status: 502 },
    );
  }
}
