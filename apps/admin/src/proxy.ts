import { NextResponse, type NextRequest } from "next/server";

import { canOpen, type AdminAccess } from "@/lib/access";
import { apiBaseUrl, apiUrl } from "@/lib/api-core";
import { isUsableAdminToken } from "@/lib/jwt";
import { publicUrl } from "@/lib/public-url";

// Keep in sync with src/lib/session.ts (that module is server-only and uses next/headers).
const TOKEN_COOKIE = "tt_admin_token";
const USER_COOKIE = "tt_admin_user";

/** Each token's access for a short while, so a page load costs at most one GET /admin/me. */
const ACCESS_TTL_MS = 30_000;
const accessCache = new Map<string, { at: number; access: AdminAccess | null }>();

/** The admin's access now (GET /admin/me); null when the API can't say (the pages and the API decide then). */
async function liveAccess(token: string): Promise<AdminAccess | null> {
  const hit = accessCache.get(token);
  if (hit && Date.now() - hit.at < ACCESS_TTL_MS) return hit.access;
  let access: AdminAccess | null = null;
  try {
    const res = await fetch(apiUrl(apiBaseUrl(), "/admin/me"), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(3_000) });
    if (res.ok) access = (await res.json()) as AdminAccess;
  } catch {
    // API unreachable: let the page load and show its own error.
  }
  if (accessCache.size > 500) accessCache.clear();
  accessCache.set(token, { at: Date.now(), access });
  return access;
}

/**
 * Optimistic auth check (Next 16 proxy, formerly middleware): no usable admin cookie → /login.
 * The API still verifies the JWT on every call; a 401 there also signs the admin out.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const isSignedIn = isUsableAdminToken(token);
  const isLogin = pathname === "/login";

  if (isLogin && isSignedIn) return NextResponse.redirect(publicUrl(request, "/"));
  // A staff member whose role doesn't open this page goes to the Dashboard.
  if (isSignedIn && token && !isLogin && pathname !== "/") {
    const access = await liveAccess(token);
    if (access && !canOpen(access, pathname)) return NextResponse.redirect(publicUrl(request, "/"));
  }
  if (isLogin || isSignedIn) return NextResponse.next();

  const url = publicUrl(request, "/login");
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  if (token) url.searchParams.set("expired", "1");
  const res = NextResponse.redirect(url);
  if (token) {
    res.cookies.delete(TOKEN_COOKIE);
    res.cookies.delete(USER_COOKIE);
  }
  return res;
}

export const config = {
  // Everything except Next internals, JSON route handlers (they answer 401 themselves), sign-out, the public live
  // trip page (/track/<token>, anyone with the link) and static files.
  matcher: ["/((?!_next/|api/|auth/signout|track/|favicon.ico|icon.png|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)"],
};
