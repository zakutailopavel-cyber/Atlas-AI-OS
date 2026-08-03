import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

export type AgentScope = "read" | "content:write" | "model:write" | "reference:write" | "generate";

export type AgentContext = {
  supabase: SupabaseClient;
  actorId: string;
  allowedModelIds: "*" | string[];
  scopes: Set<string>;
};

function equalSecret(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function authorizeAgent(request: Request, required: AgentScope): AgentContext {
  const token = process.env.ATLAS_AGENT_TOKEN || "";
  const actorId = process.env.ATLAS_AGENT_ACTOR_ID || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  if (token.length < 32 || !actorId || !serviceKey || !url) throw new Error("AGENT_NOT_CONFIGURED");

  const header = request.headers.get("authorization") || "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!supplied || !equalSecret(supplied, token)) throw new Error("AGENT_UNAUTHORIZED");

  const scopes = new Set((process.env.ATLAS_AGENT_SCOPES || "read").split(",").map((value) => value.trim()).filter(Boolean));
  if (!scopes.has(required)) throw new Error("AGENT_FORBIDDEN");

  const rawModels = (process.env.ATLAS_AGENT_MODEL_IDS || "").trim();
  const allowedModelIds = rawModels === "*" ? "*" : rawModels.split(",").map((value) => value.trim()).filter(Boolean);
  if (allowedModelIds !== "*" && !allowedModelIds.length) throw new Error("AGENT_MODEL_ALLOWLIST_EMPTY");

  return {
    supabase: createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    actorId,
    allowedModelIds,
    scopes,
  };
}

export function agentError(error: unknown) {
  const code = error instanceof Error ? error.message : "AGENT_ERROR";
  const status = code === "AGENT_UNAUTHORIZED" ? 401 : code === "AGENT_FORBIDDEN" ? 403 : code === "AGENT_NOT_CONFIGURED" || code === "AGENT_MODEL_ALLOWLIST_EMPTY" ? 503 : 500;
  return Response.json({ error: code }, { status });
}

export function assertAllowedModel(context: AgentContext, modelId: string) {
  if (context.allowedModelIds !== "*" && !context.allowedModelIds.includes(modelId)) throw new Error("MODEL_NOT_ALLOWED");
}

export function applyModelFilter<T>(query: T, context: AgentContext): T {
  if (context.allowedModelIds === "*") return query;
  return (query as { in: (column: string, values: string[]) => T }).in("model_id", context.allowedModelIds);
}

export async function auditAgent(context: AgentContext, input: { action: string; resourceType: string; resourceId?: string | null; modelId?: string | null; metadata?: Record<string, unknown> }) {
  const { error } = await context.supabase.from("agent_audit_log").insert({
    actor_id: context.actorId,
    action: input.action,
    resource_type: input.resourceType,
    resource_id: input.resourceId || null,
    model_id: input.modelId || null,
    metadata: input.metadata || {},
  });
  if (error) throw new Error(`AUDIT_FAILED:${error.message}`);
}
