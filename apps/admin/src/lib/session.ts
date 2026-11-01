import "server-only";

import { cookies } from "next/headers";

import type { AdminAccess } from "./access";

import { decodeJwt } from "./jwt";
import type { User } from "./types";

/** httpOnly cookie holding the API JWT. Never readable from client JS. */
export const TOKEN_COOKIE = "tt_admin_token";
/** httpOnly cookie with the signed-in admin's name/phone for the user menu. */
export const USER_COOKIE = "tt_admin_user";

export interface SessionUser extends AdminAccess {
  readonly name: string | null;
  readonly phone: string;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60;

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false",
    path: "/",
    maxAge,
  };
}

export async function getToken(): Promise<string | undefined> {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

/** Server Action / Route Handler only. Cookie lifetime follows the JWT expiry. */
export async function setSession(token: string, user: User): Promise<void> {
  const exp = decodeJwt(token)?.exp;
  const maxAge = exp ? Math.max(60, Math.floor(exp - Date.now() / 1000)) : THIRTY_DAYS;
  const store = await cookies();
  store.set(TOKEN_COOKIE, token, cookieOptions(maxAge));
  const session: SessionUser = { name: user.name, phone: user.phone, adminLevel: user.adminLevel, adminCityIds: user.adminCityIds };
  store.set(USER_COOKIE, JSON.stringify(session), cookieOptions(maxAge));
}

/** Server Action / Route Handler only. */
export async function clearSession(): Promise<void> {
  const store = await cookies();
  store.delete(TOKEN_COOKIE);
  store.delete(USER_COOKIE);
}
