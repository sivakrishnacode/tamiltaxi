import "server-only";

import { cache } from "react";

import type { AdminAccess } from "./access";
import { adminApi } from "./api";

/** The signed-in admin's access now (GET /admin/me), once per request; null when the API can't say. */
export const getAccess = cache(async (): Promise<AdminAccess | null> => adminApi.me().catch(() => null));
