import { agentError, assertAllowedModel, auditAgent, authorizeAgent } from "@/lib/agent-api";

export const runtime = "nodejs";

function allowedHost(hostname: string) {
  const hosts = (process.env.ATLAS_AGENT_ASSET_HOSTS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

export async function POST(request: Request) {
  try {
    const context = authorizeAgent(request, "asset:write");
    const body = await request.json();
    assertAllowedModel(context, body.model_id);
    const source = new URL(String(body.source_url || ""));
    if (source.protocol !== "https:" || !allowedHost(source.hostname.toLowerCase())) {
      return Response.json({ error: "SOURCE_HOST_NOT_ALLOWED" }, { status: 403 });
    }
    const { data: task } = await context.supabase.from("agent_image_tasks").select("id,model_id").eq("id", body.task_id).maybeSingle();
    if (!task || task.model_id !== body.model_id) throw new Error("TASK_NOT_FOUND");

    const response = await fetch(source, { redirect: "error", signal: AbortSignal.timeout(20000) });
    if (!response.ok) return Response.json({ error: "SOURCE_FETCH_FAILED" }, { status: 502 });
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return Response.json({ error: "SOURCE_NOT_IMAGE" }, { status: 415 });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 20 * 1024 * 1024) return Response.json({ error: "IMAGE_TOO_LARGE" }, { status: 413 });
    const extension = contentType.includes("webp") ? "webp" : contentType.includes("jpeg") ? "jpg" : "png";
    const path = `agent-results/${body.model_id}/${body.task_id}-${crypto.randomUUID()}.${extension}`;
    const { error } = await context.supabase.storage.from("atlas-assets").upload(path, bytes, { contentType, upsert: false });
    if (error) throw error;
    const publicUrl = context.supabase.storage.from("atlas-assets").getPublicUrl(path).data.publicUrl;
    await auditAgent(context, { action: "asset.import", resourceType: "agent_image_task", resourceId: body.task_id, modelId: body.model_id, metadata: { path, source_host: source.hostname } });
    return Response.json({ path, public_url: publicUrl });
  } catch (error) {
    return agentError(error);
  }
}
