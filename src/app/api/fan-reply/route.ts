import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

// Approximate cost estimate for gpt-5.4-mini text generation, USD per 1K
// tokens. This is a governor estimate for budget tracking, not an exact
// billing reconciliation — update if OpenAI pricing changes.
const COST_PER_1K_TOKENS_USD = 0.002;

// Heuristic signals that a fan message likely needs a human, not just the
// automated draft — purchase intent, custom requests, complaints. Tune
// this list from real conversation logs once there is data to tune it on.
const ESCALATION_PATTERNS =
  /(buy|purchase|custom|price|refund|cancel|scam|complaint|купить|цена|возврат|отмен|жалоб)/i;

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    reply: { type: "string" },
    tone_notes: { type: "string" },
  },
  required: ["reply", "tone_notes"],
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
  if (!body.model || !body.fan_message)
    return NextResponse.json(
      { error: "Не указана модель или сообщение фаната" },
      { status: 400 },
    );

  const escalate = ESCALATION_PATTERNS.test(body.fan_message);

  // Budget check happens before any paid call. If the RPC itself errors
  // (e.g. migration not applied yet) we log and continue rather than hard
  // failing the whole endpoint — but a real budget breach always blocks.
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
          "Достигнут установленный бюджетный лимит для этой модели. Ответь вручную либо повысь лимит в budget_limits.",
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
      max_output_tokens: 600,
      instructions:
        "Ты помогаешь цифровому автору Atlas отвечать фанатам в личных сообщениях. Строго сохраняй личность, голос и биографию персонажа. Никогда не выдавай персонажа за реального человека, если фанат прямо спрашивает о происхождении контента — раскрытие ИИ обязательно. Не обещай того, что не будет выполнено, и не дави на покупку. Тон: примерно 80% выстраивание отношений и только 20% продажа. Ответ короткий, тёплый, разговорный, без канцелярита и без явного маркетингового языка.",
      input: `Цифровой автор: ${JSON.stringify(body.model)}\nПоследние сообщения переписки (если есть): ${JSON.stringify(body.conversation_history ?? [])}\nНовое сообщение фаната: ${body.fan_message}\nНапиши черновик ответа от лица персонажа и короткую заметку модератору о тоне/контексте для проверки перед отправкой.`,
      text: {
        format: {
          type: "json_schema",
          name: "atlas_fan_reply",
          strict: true,
          schema,
        },
      },
    });
    if (!response.output_text) throw new Error("Модель не вернула результат");

    // response.usage is provided by the OpenAI SDK's Responses API; verify
    // the field name against the installed openai package version (repo
    // currently pins ^6.46.0) before relying on this in production.
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

    const parsed = JSON.parse(response.output_text);
    return NextResponse.json({
      ...parsed,
      needs_human_review: escalate,
    });
  } catch (error) {
    console.error("Atlas fan-reply generation failed", error);
    return NextResponse.json(
      {
        error:
          "AI-ответ временно недоступен. Проверь баланс API и попробуй снова.",
      },
      { status: 502 },
    );
  }
}
