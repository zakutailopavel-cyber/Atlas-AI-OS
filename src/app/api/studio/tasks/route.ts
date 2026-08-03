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

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "STUDIO_TASK_ERROR";
  const status = code === "UNAUTHORIZED" ? 401 : code === "NOT_FOUND" ? 404 : code === "INVALID_STATUS" ? 400 : 500;
  return Response.json({ error: code }, { status });
}

export async function GET() {
  try {
    await currentUser();
    const admin = serviceClient();
    const { data, error } = await admin
      .from("agent_image_tasks")
      .select("id,model_id,content_item_id,title,instructions,status,reference_ids,result_url,result_storage_path,result_notes,claimed_by,claimed_at,completed_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(150);
    if (error) throw error;
    return Response.json({ tasks: data || [] });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await currentUser();
    const admin = serviceClient();
    const body = await request.json();
    const modelId = String(body.model_id || "");
    const title = String(body.title || "Новая задача").trim().slice(0, 180);
    const instructions = String(body.instructions || "").trim().slice(0, 12000);
    if (!modelId || !instructions) return Response.json({ error: "MODEL_AND_INSTRUCTIONS_REQUIRED" }, { status: 400 });

    const { data: primary } = await admin
      .from("model_references")
      .select("id")
      .eq("model_id", modelId)
      .eq("kind", "primary")
      .maybeSingle();
    if (!primary) return Response.json({ error: "PRIMARY_FACE_REQUIRED" }, { status: 400 });

    const requested = Array.isArray(body.reference_ids) ? body.reference_ids.map(String) : [];
    const referenceIds = Array.from(new Set([primary.id, ...requested])).slice(0, 8);
    const { data, error } = await admin
      .from("agent_image_tasks")
      .insert({
        model_id: modelId,
        content_item_id: body.content_item_id || null,
        title,
        instructions,
        status: "queued",
        reference_ids: referenceIds,
        created_by: user.id,
      })
      .select("*")
      .single();
    if (error) throw error;

    await admin.from("agent_audit_log").insert({
      actor_id: user.id,
      action: "studio.task.create",
      resource_type: "agent_image_task",
      resource_id: data.id,
      model_id: modelId,
      metadata: { reference_count: referenceIds.length },
    });
    return Response.json({ task: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await currentUser();
    const admin = serviceClient();
    const body = await request.json();
    const id = String(body.id || "");
    const action = String(body.action || "");
    const { data: existing, error: readError } = await admin
      .from("agent_image_tasks")
      .select("id,model_id,content_item_id,status,result_url")
      .eq("id", id)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) throw new Error("NOT_FOUND");

    if (action === "approve") {
      const { data, error } = await admin
        .from("agent_image_tasks")
        .update({ status: "completed", result_notes: body.notes || null, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      if (existing.content_item_id) {
        await admin.from("content_items").update({ status: "review", asset_url: existing.result_url || null }).eq("id", existing.content_item_id);
      }
      await admin.from("agent_audit_log").insert({ actor_id: user.id, action: "studio.task.approve", resource_type: "agent_image_task", resource_id: id, model_id: existing.model_id, metadata: {} });
      return Response.json({ task: data });
    }

    if (action === "request_changes") {
      const notes = String(body.notes || "").trim();
      if (!notes) return Response.json({ error: "NOTES_REQUIRED" }, { status: 400 });
      const { data, error } = await admin
        .from("agent_image_tasks")
        .update({ status: "queued", result_notes: notes, claimed_by: null, claimed_at: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      await admin.from("agent_audit_log").insert({ actor_id: user.id, action: "studio.task.request_changes", resource_type: "agent_image_task", resource_id: id, model_id: existing.model_id, metadata: { notes } });
      return Response.json({ task: data });
    }

    throw new Error("INVALID_STATUS");
  } catch (error) {
    return errorResponse(error);
  }
}
