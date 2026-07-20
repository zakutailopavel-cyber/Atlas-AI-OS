import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

// First slice of Content Pipeline v1 manual approval (see
// docs/architecture/CONTENT_PIPELINE.md and the 202607202300 migration).
// This route is the only place that is allowed to set content_items to
// 'ready': it saves the current draft fields, computes a server-side
// payload hash for exactly those fields, and records an approval row
// bound to that hash and the item's current content_revision. If the
// payload changes afterwards, a database trigger reverts status back to
// 'review' and the old approval simply stops matching.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json(
      { error: "Требуется авторизация" },
      { status: 401 },
    );

  const body = await request.json();
  if (!body.content_item_id)
    return NextResponse.json(
      { error: "Не указана публикация" },
      { status: 400 },
    );

  // Persist whatever the reviewer had open in the dialog first, so the
  // hash we compute below matches exactly what's being approved — not a
  // stale DB row from before the reviewer's last edit.
  const { error: updateError } = await supabase
    .from("content_items")
    .update({
      title: body.title,
      caption: body.caption,
      visual_prompt: body.visual_prompt,
      disclosure: body.disclosure,
      asset_url: body.asset_url,
      review_comment: body.review_comment,
    })
    .eq("id", body.content_item_id);
  if (updateError) {
    console.error("Approve: failed to save draft before hashing", updateError);
    return NextResponse.json(
      { error: "Не удалось сохранить публикацию перед согласованием" },
      { status: 500 },
    );
  }

  const { data: item, error: itemError } = await supabase
    .from("content_items")
    .select("id, content_revision")
    .eq("id", body.content_item_id)
    .single();
  if (itemError || !item)
    return NextResponse.json(
      { error: "Публикация не найдена" },
      { status: 404 },
    );

  const { data: hash, error: hashError } = await supabase.rpc(
    "content_payload_hash_by_id",
    { target_id: item.id },
  );
  if (hashError || !hash) {
    console.error("Approve: hash rpc failed", hashError);
    return NextResponse.json(
      { error: "Не удалось вычислить hash публикации" },
      { status: 500 },
    );
  }

  const { error: approvalError } = await supabase
    .from("content_approvals")
    .insert({
      content_item_id: item.id,
      content_revision: item.content_revision,
      payload_hash: hash,
      decision: "approved",
      approved_by: user.id,
    });
  if (approvalError) {
    console.error("Approve: insert failed", approvalError);
    return NextResponse.json(
      { error: "Не удалось сохранить согласование" },
      { status: 500 },
    );
  }

  const { error: statusError } = await supabase
    .from("content_items")
    .update({ status: "ready" })
    .eq("id", item.id);
  if (statusError) {
    console.error("Approve: status update failed", statusError);
    return NextResponse.json(
      {
        error:
          "Согласование сохранено, но статус публикации не обновился. Обнови страницу и проверь вручную.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    content_revision: item.content_revision,
    payload_hash: hash,
  });
}
