import { authorizeAgent, agentError } from "@/lib/agent-api";

export const runtime = "nodejs";

type Passport = {
  avatar?: string;
  timezone?: string;
  market?: string;
  language?: string;
  posting_windows?: string[];
  posts_per_day?: number;
  automation_enabled?: boolean;
  last_posted_at?: string | null;
};

function localParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    date: `${value("year")}-${value("month")}-${value("day")}`,
    hour: value("hour"),
    minute: value("minute"),
  };
}

function isAllowed(modelId: string, allowed: "*" | string[]) {
  return allowed === "*" || allowed.includes(modelId);
}

export async function GET(request: Request) {
  try {
    const context = authorizeAgent(request, "read");
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - 70 * 60 * 1000).toISOString();

    const [modelsResult, referencesResult, tasksResult] = await Promise.all([
      context.supabase
        .from("ai_models")
        .select("id,name,handle,niche,bio,status,visual_passport")
        .eq("status", "active")
        .order("created_at"),
      context.supabase
        .from("model_references")
        .select("id,model_id,storage_path,kind")
        .eq("kind", "primary"),
      context.supabase
        .from("agent_image_tasks")
        .select("id,model_id,status,created_at")
        .gte("created_at", recentCutoff)
        .in("status", ["queued", "claimed", "completed"]),
    ]);

    for (const result of [modelsResult, referencesResult, tasksResult]) {
      if (result.error) throw result.error;
    }

    const primaryByModel = new Map(
      (referencesResult.data || []).map((reference) => [reference.model_id, reference]),
    );
    const recentlyQueued = new Set(
      (tasksResult.data || []).map((task) => task.model_id),
    );

    const due = (modelsResult.data || []).flatMap((model) => {
      if (!isAllowed(model.id, context.allowedModelIds)) return [];
      const passport = (model.visual_passport || {}) as Passport;
      if (!passport.automation_enabled || recentlyQueued.has(model.id)) return [];
      const primary = primaryByModel.get(model.id);
      if (!primary || !passport.avatar) return [];

      const timezone = passport.timezone || "Europe/Tallinn";
      let local;
      try {
        local = localParts(now, timezone);
      } catch {
        return [];
      }
      const windows = Array.isArray(passport.posting_windows)
        ? passport.posting_windows.filter((value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value))
        : [];
      const matchedWindow = windows.find((window) => window.slice(0, 2) === local.hour);
      if (!matchedWindow) return [];

      if (passport.last_posted_at) {
        try {
          const last = localParts(new Date(passport.last_posted_at), timezone);
          if (last.date === local.date && last.hour === local.hour) return [];
        } catch {
          // An invalid historical timestamp must not disable an otherwise valid schedule.
        }
      }

      return [{
        id: model.id,
        name: model.name,
        handle: model.handle,
        niche: model.niche,
        bio: model.bio,
        timezone,
        market: passport.market || "",
        language: passport.language || "",
        posting_windows: windows,
        posts_per_day: Math.min(Math.max(Number(passport.posts_per_day) || 1, 1), 6),
        due_window: matchedWindow,
        local_date: local.date,
        local_time: `${local.hour}:${local.minute}`,
        schedule_key: `${model.id}:${local.date}:${matchedWindow}`,
        primary_face_reference: {
          id: primary.id,
          url: primary.storage_path,
          kind: "primary",
        },
      }];
    });

    return Response.json({
      checked_at: now.toISOString(),
      due_count: due.length,
      personas: due,
    });
  } catch (error) {
    return agentError(error);
  }
}
