import { NextResponse, type NextRequest } from "next/server";

import { canOpen, type AdminAccess } from "@/lib/access";
import { isUsableAdminToken } from "@/lib/jwt";
import { publicUrl } from "@/lib/public-url";

// Keep in sync with src/lib/session.ts (that module is server-only and uses next/headers).
const TOKEN_COOKIE = "tt_admin_token";
const USER_COOKIE = "tt_admin_user";

/** The admin level and cities saved at sign-in (the API checks them again on every call). */
function sessionAccess(request: NextRequest): AdminAccess | null {
  try {
    const raw = request.cookies.get(USER_COOKIE)?.value;
    return raw ? (JSON.parse(raw) as AdminAccess) : null;
  } catch {
    return null;
  }
}

/**
 * Optimistic auth check (Next 16 proxy, formerly middleware): no usable admin cookie → /login.
 * The API still verifies the JWT on every call; a 401 there also signs the admin out.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const isSignedIn = isUsableAdminToken(token);
  const isLogin = pathname === "/login";

  if (isLogin && isSignedIn) return NextResponse.redirect(publicUrl(request, "/"));
  if (isSignedIn && !canOpen(sessionAccess(request), pathname)) return NextResponse.redirect(publicUrl(request, "/"));
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
