import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

// Approximate cost estimate for gpt-5.4-mini text generation, USD per 1K
// tokens. Same governor estimate used in /api/fan-reply -- update if
// OpenAI pricing changes.
const COST_PER_1K_TOKENS_USD = 0.002;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    strategy: { type: "string" },
    hook: { type: "string" },
    caption: { type: "string" },
    cta: { type: "string" },
    shot_list: {
      type: "array",
      items: { type: "string" },
      minItems: 4,
      maxItems: 8,
    },
    visual_prompt: { type: "string" },
    negative_prompt: { type: "string" },
    hashtags: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 12,
    },
    best_time: { type: "string" },
    alternatives: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 3,
    },
    disclosure: { type: "string" },
  },
  required: [
    "title",
    "strategy",
    "hook",
    "caption",
    "cta",
    "shot_list",
    "visual_prompt",
    "negative_prompt",
    "hashtags",
    "best_time",
    "alternatives",
    "disclosure",
  ],
};

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Требуется авторизация" },
      { status: 401 },
    );
  if (!process.env.OPENAI_API_KEY)
    return NextResponse.json(
      { error: "OPENAI_API_KEY не настроен в Vercel" },
      { status: 503 },
    );
  const body = await request.json();
  if (!body.topic || !body.model)
    return NextResponse.json(
      { error: "Не указана тема или модель" },
      { status: 400 },
    );

  // Budget check happens before any paid call. Mirrors /api/fan-reply: an
  // RPC error logs and continues, a real budget breach always blocks.
  const { data: overBudget, error: budgetError } = await supabase.rpc(
    "is_over_budget",
    { target_model_id: body.model.id },
  );
  if (budgetError) {
    console.error("Budget check failed", budgetError);
  } else if (overBudget) {
    return NextResponse.json(
      {
        error:
          "Достигнут установленный бюджетный лимит для этой модели. Повысь лимит в budget_limits, чтобы продолжить генерацию.",
      },
      { status: 402 },
    );
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: "gpt-5.4-mini",
      reasoning: { effort: "low" },
      store: false,
      max_output_tokens: 3000,
      instructions:
        "Ты — главный креативный директор Atlas AI OS. Создавай уникальный, практически готовый к публикации контент на русском языке. Строго сохраняй личность, голос, биографию, неизменяемые факты, внешность и текущую сюжетную линию цифрового автора. Никогда не затрагивай запрещённые темы и не противоречь памяти персонажа. Не изображай реальных людей и не используй вводящие в заблуждение заявления. Визуальный промпт пиши на английском для генератора изображений. Хэштеги возвращай с символом #. Поле disclosure — короткая (до 12 слов) фраза о том, что это ИИ-персонаж, на языке публикации, подходящая для видимого размещения в подписи или профиле (например: 'AI-персонаж, сгенерировано ИИ'). Никогда не оставляй его пустым и не смягчай формулировку до неоднозначности.",
      input: `Создай полный контент-пакет.\nЦифровой автор: ${JSON.stringify(body.model)}\nПлощадка: ${body.platform}\nФормат: ${body.format}\nТема: ${body.topic}\nЦель: ${body.goal}\nАудитория и контекст должны точно соответствовать профилю. Дай конкретный сценарий, а не общие советы.`,
      text: {
        format: {
          type: "json_schema",
          name: "atlas_content_package",
          strict: true,
          schema,
        },
      },
    });
    if (!response.output_text) throw new Error("Модель не вернула результат");

    // response.usage is provided by the OpenAI SDK's Responses API; same
    // field used in /api/fan-reply.
    const totalTokens = response.usage?.total_tokens ?? 0;
    const estimatedCost = (totalTokens / 1000) * COST_PER_1K_TOKENS_USD;

    const { error: ledgerError } = await supabase.from("cost_ledger").insert({
      model_id: body.model.id,
      category: "openai_chat",
      provider: "openai",
      estimated_cost_usd: estimatedCost,
      request_ref: response.id ?? null,
      created_by: user.id,
    });
    if (ledgerError) console.error("Cost ledger insert failed", ledgerError);

    return NextResponse.json(JSON.parse(response.output_text));
  } catch (error) {
    console.error("Atlas generation failed", error);
    return NextResponse.json(
      {
        error:
          "AI-генерация временно недоступна. Проверь баланс API и попробуй снова.",
      },
      { status: 502 },
    );
  }
}
