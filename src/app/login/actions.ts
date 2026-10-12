"use server";

import { redirect } from "next/navigation";
import { isAllowed } from "@/lib/auth";
import { env } from "@/lib/env";
import { createAuthClient } from "@/lib/supabase/server";

export type LoginState = { sent: boolean; error: string | null };

export async function sendLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { sent: false, error: "Bitte eine gültige E-Mail-Adresse eingeben." };

  // Nur freigeschaltete Adressen bekommen einen Link. Die Antwort ist
  // absichtlich immer gleich, damit niemand die Zugriffsliste abfragen kann.
  if (await isAllowed(email)) {
    const supabase = await createAuthClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${env.appUrl()}/auth/callback`, shouldCreateUser: true },
    });
    if (error) return { sent: false, error: "Der Link konnte nicht verschickt werden. Bitte später erneut versuchen." };
  }
  return { sent: true, error: null };
}

export async function signOut() {
  const supabase = await createAuthClient();
  await supabase.auth.signOut();
  redirect("/login");
}
