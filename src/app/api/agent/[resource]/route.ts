import { agentError, assertAllowedModel, auditAgent, authorizeAgent } from "@/lib/agent-api";

export const runtime = "nodejs";

type Params = { params: Promise<{ resource: string }> };

function limitedIds(context: ReturnType<typeof authorizeAgent>) {
  return context.allowedModelIds === "*" ? null : context.allowedModelIds;
}

async function allowedModel(context: ReturnType<typeof authorizeAgent>, modelId: string) {
  assertAllowedModel(context, modelId);
  const { data } = await context.supabase.from("ai_models").select("id,name,visual_passport,niche,bio,status").eq("id", modelId).maybeSingle();
  if (!data) throw new Error("MODEL_NOT_FOUND");
  return data;
}

export async function GET(request: Request, contextParams: Params) {
  try {
    const context = authorizeAgent(request, "read");
    const { resource } = await contextParams.params;
    const ids = limitedIds(context);

    if (resource === "models") {
      let query = context.supabase.from("ai_models").select("id,name,handle,niche,bio,status,visual_passport,created_at").order("created_at");
      if (ids) query = query.in("id", ids);
      const { data, error } = await query;
      if (error) throw error;
      return Response.json({ models: data || [] });
    }

    if (resource === "content") {
      let query = context.supabase.from("content_items").select("id,model_id,title,platform,format,status,caption,visual_prompt,shot_list,asset_url,publish_at,disclosure,trend_note,created_at").order("created_at", { ascending: false }).limit(100);
      if (ids) query = query.in("model_id", ids);
      const { data, error } = await query;
      if (error) throw error;
      return Response.json({ items: data || [] });
    }

    if (resource === "jobs") {
      let query = context.supabase.from("generation_jobs").select("id,model_id,kind,prompt,style,status,output_urls,error,created_at").order("created_at", { ascending: false }).limit(100);
      if (ids) query = query.in("model_id", ids);
      const { data, error } = await query;
      if (error) throw error;
      return Response.json({ jobs: data || [] });
    }

    if (resource === "references") {
      let query = context.supabase.from("model_references").select("id,model_id,storage_path,kind,generation_job_id,created_at").order("created_at", { ascending: false }).limit(150);
      if (ids) query = query.in("model_id", ids);
      const { data, error } = await query;
      if (error) throw error;
      return Response.json({ references: data || [] });
    }

    if (resource === "status") {
      let modelQuery = context.supabase.from("ai_models").select("id,name,status,visual_passport");
      let jobsQuery = context.supabase.from("generation_jobs").select("id,model_id,status,kind,created_at").order("created_at", { ascending: false }).limit(100);
      let contentQuery = context.supabase.from("content_items").select("id,model_id,status,created_at").order("created_at", { ascending: false }).limit(200);
      let costQuery = context.supabase.from("cost_ledger").select("model_id,estimated_cost_usd,created_at").gte("created_at", new Date(Date.now() - 7 * 86400000).toISOString());
      if (ids) {
        modelQuery = modelQuery.in("id", ids);
        jobsQuery = jobsQuery.in("model_id", ids);
        contentQuery = contentQuery.in("model_id", ids);
        costQuery = costQuery.in("model_id", ids);
      }
      const [models, jobs, content, costs] = await Promise.all([modelQuery, jobsQuery, contentQuery, costQuery]);
      for (const result of [models, jobs, content, costs]) if (result.error) throw result.error;
      const totalCost = (costs.data || []).reduce((sum, row) => sum + Number(row.estimated_cost_usd || 0), 0);
      return Response.json({
        ok: true,
        models: models.data || [],
        queue: {
          queued: (jobs.data || []).filter((job) => job.status === "queued").length,
          failed: (jobs.data || []).filter((job) => job.status === "failed").length,
          completed: (jobs.data || []).filter((job) => job.status === "completed").length,
        },
        content: {
          draft: (content.data || []).filter((item) => item.status === "draft").length,
          review: (content.data || []).filter((item) => item.status === "review").length,
          scheduled: (content.data || []).filter((item) => item.status === "scheduled").length,
        },
        estimated_cost_usd_7d: Number(totalCost.toFixed(4)),
      });
    }

    return Response.json({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return agentError(error);
  }
}

export async function POST(request: Request, contextParams: Params) {
  try {
    const { resource } = await contextParams.params;
    const required = resource === "content" ? "content:write" : resource === "references" ? "reference:write" : resource === "generate" ? "generate" : "read";
    const context = authorizeAgent(request, required);
    const body = await request.json();

    if (resource === "content") {
      await allowedModel(context, body.model_id);
      const status = body.status === "review" ? "review" : "draft";
      const { data, error } = await context.supabase.from("content_items").insert({
        model_id: body.model_id,
        title: String(body.title || "Новый материал").slice(0, 180),
        platform: body.platform || null,
        format: body.format || null,
        status,
        caption: body.caption || null,
        visual_prompt: body.visual_prompt || null,
        shot_list: Array.isArray(body.shot_list) ? body.shot_list.slice(0, 20) : null,
        asset_url: body.asset_url || null,
        publish_at: body.publish_at || null,
        disclosure: body.disclosure || null,
        trend_note: body.trend_note || null,
        created_by: context.actorId,
      }).select("*").single();
      if (error) throw error;
      await auditAgent(context, { action: "content.create", resourceType: "content_item", resourceId: data.id, modelId: body.model_id, metadata: { status, platform: body.platform || null } });
      return Response.json({ item: data }, { status: 201 });
    }

    if (resource === "references") {
      await allowedModel(context, body.model_id);
      const kind = body.kind === "primary" ? "primary" : "reference";
      const { data, error } = await context.supabase.from("model_references").insert({ model_id: body.model_id, storage_path: body.storage_path, kind, generation_job_id: body.generation_job_id || null, created_by: context.actorId }).select("*").single();
      if (error) throw error;
      await auditAgent(context, { action: "reference.create", resourceType: "model_reference", resourceId: data.id, modelId: body.model_id, metadata: { kind } });
      return Response.json({ reference: data }, { status: 201 });
    }

    if (resource === "generate") {
      const model = await allowedModel(context, body.model_id);
      const kind = body.kind === "scene" ? "scene" : body.kind === "faceswap" ? "faceswap" : "avatar";
      if (kind !== "avatar" && !model.visual_passport?.avatar) return Response.json({ error: "PRIMARY_FACE_REQUIRED" }, { status: 400 });
      if (kind === "scene" && !String(body.prompt || "").trim()) return Response.json({ error: "SCENE_PROMPT_REQUIRED" }, { status: 400 });
      if (kind === "faceswap" && !body.base_photo_url) return Response.json({ error: "BASE_PHOTO_REQUIRED" }, { status: 400 });
      const { data: overBudget, error: budgetError } = await context.supabase.rpc("is_over_budget", { target_model_id: model.id });
      if (budgetError) throw budgetError;
      if (overBudget) return Response.json({ error: "BUDGET_LIMIT_REACHED" }, { status: 402 });
      const count = kind === "avatar" ? Math.min(Math.max(Number(body.count) || 1, 1), 3) : 1;
      const { data: job, error } = await context.supabase.from("generation_jobs").insert({ model_id: model.id, kind, prompt: String(body.prompt || "Agent request").slice(0, 2000), style: String(body.style || "photorealistic").slice(0, 200), count, status: "queued", created_by: context.actorId }).select("*").single();
      if (error) throw error;
      const unitCost = kind === "avatar" ? 0.025 : kind === "scene" ? 0.04 : 0.06;
      const { error: ledgerError } = await context.supabase.from("cost_ledger").insert({ model_id: model.id, category: "modal_image", provider: "modal", estimated_cost_usd: unitCost * count, request_ref: job.id, created_by: context.actorId });
      if (ledgerError) throw ledgerError;
      await auditAgent(context, { action: "generation.queue", resourceType: "generation_job", resourceId: job.id, modelId: model.id, metadata: { kind, count } });
      if (process.env.MODAL_AVATAR_URL) {
        try {
          const worker = await fetch(process.env.MODAL_AVATAR_URL, { method: "POST", headers: { "content-type": "application/json", "x-atlas-secret": process.env.ATLAS_WORKER_SECRET || "" }, body: JSON.stringify({ job_id: job.id, model, request: { kind, prompt: body.prompt || "", style: body.style || "photorealistic", framing: body.framing || "waist_up", count, seed: body.seed || null, reference_url: model.visual_passport?.avatar || null, base_photo_url: body.base_photo_url || null } }) });
          if (!worker.ok) throw new Error(`Modal ${worker.status}`);
        } catch (workerError) {
          await context.supabase.from("generation_jobs").update({ status: "failed", error: workerError instanceof Error ? workerError.message : "Worker unavailable" }).eq("id", job.id);
        }
      }
      return Response.json({ job, worker_connected: Boolean(process.env.MODAL_AVATAR_URL) }, { status: 201 });
    }

    return Response.json({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return agentError(error);
  }
}

export async function PATCH(request: Request, contextParams: Params) {
  try {
    const { resource } = await contextParams.params;
    const context = authorizeAgent(request, resource === "models" ? "model:write" : "content:write");
    const body = await request.json();

    if (resource === "models") {
      const model = await allowedModel(context, body.id);
      const passport = { ...(model.visual_passport || {}) };
      for (const key of ["appearance", "tone", "biography", "storyline", "style", "immutable_facts"]) if (body.visual_passport?.[key] !== undefined) passport[key] = body.visual_passport[key];
      const update = { bio: body.bio === undefined ? model.bio : String(body.bio).slice(0, 8000), niche: body.niche === undefined ? model.niche : String(body.niche).slice(0, 300), visual_passport: passport };
      const { data, error } = await context.supabase.from("ai_models").update(update).eq("id", body.id).select("id,name,niche,bio,status,visual_passport").single();
      if (error) throw error;
      await auditAgent(context, { action: "model.update_brain", resourceType: "ai_model", resourceId: body.id, modelId: body.id, metadata: { fields: Object.keys(body) } });
      return Response.json({ model: data });
    }

    if (resource === "content") {
      const { data: existing } = await context.supabase.from("content_items").select("id,model_id,status").eq("id", body.id).maybeSingle();
      if (!existing?.model_id) throw new Error("CONTENT_NOT_FOUND");
      assertAllowedModel(context, existing.model_id);
      if (body.status === "published") return Response.json({ error: "PUBLISHING_NOT_ALLOWED" }, { status: 403 });
      const allowed: Record<string, unknown> = {};
      for (const key of ["title", "platform", "format", "caption", "visual_prompt", "shot_list", "asset_url", "publish_at", "disclosure", "trend_note"]) if (body[key] !== undefined) allowed[key] = body[key];
      if (["draft", "review", "scheduled", "rejected"].includes(body.status)) allowed.status = body.status;
      const { data, error } = await context.supabase.from("content_items").update(allowed).eq("id", body.id).select("*").single();
      if (error) throw error;
      await auditAgent(context, { action: "content.update", resourceType: "content_item", resourceId: body.id, modelId: existing.model_id, metadata: { fields: Object.keys(allowed) } });
      return Response.json({ item: data });
    }

    return Response.json({ error: "RESOURCE_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return agentError(error);
  }
}
