import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import AtlasStudioClient from "./studio-client";

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

  return (
    <AtlasStudioClient
      models={modelsResult.data || []}
      references={referencesResult.data || []}
      items={itemsResult.data || []}
      accounts={accountsResult.data || []}
    />
  );
}
