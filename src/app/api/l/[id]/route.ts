import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "nodejs";

// Public tracking redirect: GET /api/l/{content_item_id}.
//
// Deliberately no auth check: the people hitting this link are anonymous
// fans clicking a bio link on a free platform, not logged-in Atlas
// users. It looks up the destination through get_tracking_destination()
// (a security-definer function that returns only the URL, not the row)
// rather than selecting from content_items directly, so this endpoint
// can never leak captions/prompts/other content fields to the public.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: destination, error } = await supabase.rpc(
    "get_tracking_destination",
    { target_id: id },
  );
  if (error || !destination) {
    return NextResponse.json(
      { error: "Ссылка не настроена или публикация не найдена" },
      { status: 404 },
    );
  }

  // Best-effort logging: a failed insert should never block the redirect
  // itself, since the fan is waiting on the other end of this link.
  const { error: clickError } = await supabase.from("link_clicks").insert({
    content_item_id: id,
    referrer: request.headers.get("referer"),
    user_agent: request.headers.get("user-agent"),
  });
  if (clickError) console.error("link_clicks insert failed", clickError);

  return NextResponse.redirect(destination, { status: 302 });
}
