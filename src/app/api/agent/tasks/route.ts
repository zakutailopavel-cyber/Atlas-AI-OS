import { agentError, assertAllowedModel, auditAgent, authorizeAgent } from "@/lib/agent-api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = authorizeAgent(request, "read");
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const next = url.searchParams.get("next") === "true";
    let query = context.supabase
      .from("agent_image_tasks")
      .select("id,model_id,content_item_id,title,instructions,status,reference_ids,result_url,result_storage_path,result_notes,claimed_by,claimed_at,completed_at,created_at,updated_at")
      .order("created_at", { ascending: true });
    if (context.allowedModelIds !== "*") query = query.in("model_id", context.allowedModelIds);
    if (status) query = query.eq("status", status);
    if (next) query = query.eq("status", "queued").limit(1);
    else query = query.limit(100);
    const { data, error } = await query;
    if (error) throw error;
    return Response.json(next ? { task: data?.[0] || null } : { tasks: data || [] });
  } catch (error) {
    return agentError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = authorizeAgent(request, "task:write");
    const body = await request.json();
    assertAllowedModel(context, body.model_id);
    const { data: model } = await context.supabase.from("ai_models").select("id").eq("id", body.model_id).maybeSingle();
    if (!model) throw new Error("MODEL_NOT_FOUND");
    const referenceIds = Array.isArray(body.reference_ids) ? body.reference_ids.slice(0, 20) : [];
    const { data, error } = await context.supabase.from("agent_image_tasks").insert({
      model_id: body.model_id,
      content_item_id: body.content_item_id || null,
      title: String(body.title || "Image task").slice(0, 180),
      instructions: String(body.instructions || "").slice(0, 12000),
      reference_ids: referenceIds,
      created_by: context.actorId,
    }).select("*").single();
    if (error) throw error;
    await auditAgent(context, { action: "image_task.create", resourceType: "agent_image_task", resourceId: data.id, modelId: body.model_id, metadata: { reference_count: referenceIds.length } });
    return Response.json({ task: data }, { status: 201 });
  } catch (error) {
    return agentError(error);
  }
}
