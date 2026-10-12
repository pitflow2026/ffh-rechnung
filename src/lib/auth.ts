import "server-only";
import { redirect } from "next/navigation";
import { createAdminClient, createAuthClient } from "@/lib/supabase/server";

export type AppUser = { email: string; name: string | null; role: "admin" | "buchhaltung" };

export async function isAllowed(email: string): Promise<AppUser | null> {
  const db = createAdminClient();
  const { data } = await db
    .from("allowed_users")
    .select("email, name, role")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return (data as AppUser | null) ?? null;
}

/** Liefert den angemeldeten, freigeschalteten Nutzer oder null. */
export async function getUser(): Promise<AppUser | null> {
  const supabase = await createAuthClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) return null;
  return isAllowed(email);
}

/** Für Seiten und Server Actions: ohne gültige Anmeldung zur Login-Seite. */
export async function requireUser(): Promise<AppUser> {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}
