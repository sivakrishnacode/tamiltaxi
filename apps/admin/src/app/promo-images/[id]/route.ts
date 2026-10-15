import { NextResponse } from "next/server";

import { apiBaseUrl, apiUrl } from "@/lib/api-core";

/**
 * A splash or banner picture for the admin list, from the API's public GET /promos/:id/image (the browser never
 * calls the API itself). A picture never changes, so the browser keeps it.
 */
export async function GET(_request: Request, ctx: RouteContext<"/promo-images/[id]">) {
  const { id } = await ctx.params;
  let res: Response;
  try {
    res = await fetch(apiUrl(apiBaseUrl(), `/promos/${encodeURIComponent(id)}/image`), { cache: "no-store" });
  } catch {
    return NextResponse.json({ message: "Cannot reach the Tamil Taxi API" }, { status: 503 });
  }
  if (!res.ok || !res.body) return NextResponse.json({ message: "Picture not found" }, { status: res.status });
  return new Response(res.body, {
    headers: {
      "content-type": res.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
