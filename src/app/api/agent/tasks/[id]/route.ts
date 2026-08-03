import { agentError, assertAllowedModel, auditAgent, authorizeAgent } from "@/lib/agent-api";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function loadTask(request: Request, params: Params, scope: "read" | "task:write") {
  const context = authorizeAgent(request, scope);
  const { id } = await params.params;
  const { data: task } = await context.supabase.from("agent_image_tasks").select("*").eq("id", id).maybeSingle();
  if (!task) throw new Error("TASK_NOT_FOUND");
  assertAllowedModel(context, task.model_id);
  return { context, task };
}

export async function GET(request: Request, params: Params) {
  try {
    const { context, task } = await loadTask(request, params, "read");
    const { data: model } = await context.supabase.from("ai_models").select("id,name,handle,niche,bio,visual_passport").eq("id", task.model_id).single();
    let referencesQuery = context.supabase.from("model_references").select("id,model_id,storage_path,kind,created_at").eq("model_id", task.model_id).order("created_at", { ascending: false }).limit(12);
    if (task.reference_ids?.length) referencesQuery = referencesQuery.in("id", task.reference_ids);
    const { data: references, error } = await referencesQuery;
    if (error) throw error;
    let content = null;
    if (task.content_item_id) {
      const { data } = await context.supabase.from("content_items").select("id,title,platform,format,caption,visual_prompt,shot_list,status").eq("id", task.content_item_id).maybeSingle();
      content = data;
    }
    return Response.json({ task, model, references: references || [], content });
  } catch (error) {
    return agentError(error);
  }
}

export async function PATCH(request: Request, params: Params) {
  try {
    const { context, task } = await loadTask(request, params, "task:write");
    const body = await request.json();
    const action = body.action;

    if (action === "claim") {
      if (task.status !== "queued") return Response.json({ error: "TASK_NOT_QUEUED" }, { status: 409 });
      const { data, error } = await context.supabase.from("agent_image_tasks").update({ status: "claimed", claimed_by: String(body.agent_name || "custom-gpt").slice(0, 120), claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", task.id).eq("status", "queued").select("*").maybeSingle();
      if (error) throw error;
      if (!data) return Response.json({ error: "TASK_ALREADY_CLAIMED" }, { status: 409 });
      await auditAgent(context, { action: "image_task.claim", resourceType: "agent_image_task", resourceId: task.id, modelId: task.model_id, metadata: { agent_name: data.claimed_by } });
      return Response.json({ task: data });
    }

    if (action === "complete") {
      if (!body.result_url && !body.result_storage_path) return Response.json({ error: "RESULT_REQUIRED" }, { status: 400 });
      const resultUrl = body.result_url || (body.result_storage_path ? context.supabase.storage.from("atlas-assets").getPublicUrl(body.result_storage_path).data.publicUrl : null);
      const now = new Date().toISOString();
      const { data, error } = await context.supabase.from("agent_image_tasks").update({ status: "completed", result_url: resultUrl, result_storage_path: body.result_storage_path || null, result_notes: body.result_notes ? String(body.result_notes).slice(0, 4000) : null, completed_at: now, updated_at: now }).eq("id", task.id).select("*").single();
      if (error) throw error;
      const { data: reference, error: referenceError } = await context.supabase.from("model_references").insert({ model_id: task.model_id, storage_path: resultUrl, kind: "reference", created_by: context.actorId }).select("*").single();
      if (referenceError) throw referenceError;
      if (task.content_item_id) {
        const { error: contentError } = await context.supabase.from("content_items").update({ asset_url: resultUrl, status: "review" }).eq("id", task.content_item_id);
        if (contentError) throw contentError;
      }
      await auditAgent(context, { action: "image_task.complete", resourceType: "agent_image_task", resourceId: task.id, modelId: task.model_id, metadata: { content_item_id: task.content_item_id, reference_id: reference.id } });
      return Response.json({ task: data, reference, content_updated: Boolean(task.content_item_id) });
    }

    if (action === "fail") {
      const { data, error } = await context.supabase.from("agent_image_tasks").update({ status: "failed", result_notes: String(body.reason || "Agent failed").slice(0, 4000), updated_at: new Date().toISOString() }).eq("id", task.id).select("*").single();
      if (error) throw error;
      await auditAgent(context, { action: "image_task.fail", resourceType: "agent_image_task", resourceId: task.id, modelId: task.model_id, metadata: { reason: data.result_notes } });
      return Response.json({ task: data });
    }

    return Response.json({ error: "ACTION_NOT_SUPPORTED" }, { status: 400 });
  } catch (error) {
    return agentError(error);
  }
}
