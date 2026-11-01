import { isOwner } from "@/lib/access";
import { getSessionUser } from "@/lib/session";

/** Shows [children] to owner admins only (server components; the API refuses the action for support anyway). */
export async function OwnerOnly({ children }: { children: React.ReactNode }) {
  return isOwner(await getSessionUser()) ? <>{children}</> : null;
}
