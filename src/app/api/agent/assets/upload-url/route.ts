import { agentError, assertAllowedModel, auditAgent, authorizeAgent } from "@/lib/agent-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const context = authorizeAgent(request, "asset:write");
    const body = await request.json();
    assertAllowedModel(context, body.model_id);
    const taskId = String(body.task_id || "");
    const extension = ["png", "jpg", "jpeg", "webp"].includes(String(body.extension).toLowerCase()) ? String(body.extension).toLowerCase() : "png";
    const { data: task } = await context.supabase.from("agent_image_tasks").select("id,model_id,status").eq("id", taskId).maybeSingle();
    if (!task || task.model_id !== body.model_id) throw new Error("TASK_NOT_FOUND");
    const path = `agent-results/${body.model_id}/${taskId}-${crypto.randomUUID()}.${extension}`;
    const { data, error } = await context.supabase.storage.from("atlas-assets").createSignedUploadUrl(path);
    if (error) throw error;
    await auditAgent(context, { action: "asset.upload_url.create", resourceType: "agent_image_task", resourceId: taskId, modelId: body.model_id, metadata: { path } });
    return Response.json({ path, signed_url: data.signedUrl, token: data.token });
  } catch (error) {
    return agentError(error);
  }
}
