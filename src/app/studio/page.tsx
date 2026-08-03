import { redirect } from "next/navigation";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import StudioV2Client from "./studio-v2-client";

export default async function AtlasStudioPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [modelsResult, referencesResult, itemsResult, accountsResult] =
    await Promise.all([
      supabase.from("ai_models").select("*").order("created_at"),
      supabase
        .from("model_references")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("content_items")
        .select("*")
        .order("created_at", { ascending: false }),
      supabase.from("social_accounts").select("*").order("created_at"),
    ]);

  let tasks: unknown[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    const admin = createServiceClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data } = await admin
      .from("agent_image_tasks")
      .select("id,model_id,content_item_id,title,instructions,status,reference_ids,result_url,result_storage_path,result_notes,claimed_by,claimed_at,completed_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(150);
    tasks = data || [];
  }

  return (
    <StudioV2Client
      models={modelsResult.data || []}
      references={referencesResult.data || []}
      items={itemsResult.data || []}
      accounts={accountsResult.data || []}
      initialTasks={tasks as never[]}
    />
  );
}
