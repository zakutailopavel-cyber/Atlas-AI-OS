import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("STUDIO_SERVICE_NOT_CONFIGURED");
  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function currentUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("UNAUTHORIZED");
  return user;
}

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function normalizeWindows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry).trim())
    .filter((entry) => /^([01]\d|2[0-3]):[0-5]\d$/.test(entry))
    .slice(0, 8);
}

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "STUDIO_MODEL_ERROR";
  const status = code === "UNAUTHORIZED" ? 401 : code === "MODEL_NOT_FOUND" ? 404 : code.startsWith("INVALID_") ? 400 : 500;
  return Response.json({ error: code }, { status });
}

export async function PATCH(request: Request) {
  try {
    const user = await currentUser();
    const admin = serviceClient();
    const body = await request.json();
    const modelId = String(body.id || "");
    if (!modelId) throw new Error("MODEL_NOT_FOUND");

    const { data: model, error: readError } = await admin
      .from("ai_models")
      .select("id,name,visual_passport")
      .eq("id", modelId)
      .maybeSingle();
    if (readError) throw readError;
    if (!model) throw new Error("MODEL_NOT_FOUND");

    const timezone = String(body.timezone || "").trim();
    if (!validTimezone(timezone)) throw new Error("INVALID_TIMEZONE");
    const postingWindows = normalizeWindows(body.posting_windows);
    if (!postingWindows.length) throw new Error("INVALID_POSTING_WINDOWS");

    const passport = {
      ...(model.visual_passport || {}),
      timezone,
      market: String(body.market || "").trim().slice(0, 160),
      language: String(body.language || "").trim().slice(0, 160),
      posting_windows: postingWindows,
      posts_per_day: Math.min(Math.max(Number(body.posts_per_day) || 1, 1), 6),
      automation_enabled: Boolean(body.automation_enabled),
      last_posted_at: body.last_posted_at || null,
    };

    const { data, error } = await admin
      .from("ai_models")
      .update({ visual_passport: passport })
      .eq("id", modelId)
      .select("id,name,handle,niche,bio,status,visual_passport")
      .single();
    if (error) throw error;

    await admin.from("agent_audit_log").insert({
      actor_id: user.id,
      action: "studio.model.automation_settings",
      resource_type: "ai_model",
      resource_id: modelId,
      model_id: modelId,
      metadata: {
        timezone,
        posting_windows: postingWindows,
        automation_enabled: passport.automation_enabled,
      },
    });

    return Response.json({ model: data });
  } catch (error) {
    return errorResponse(error);
  }
}
