import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

/** Supabase-Client mit der Sitzung des angemeldeten Nutzers (nur für Auth). */
export async function createAuthClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // In Server Components nicht setzbar – der Proxy erneuert die Sitzung.
        }
      },
    },
  });
}

/**
 * Service-Role-Client für alle Datenzugriffe. Nur serverseitig nutzen,
 * und nur nachdem requireUser() oder das Cron-Secret geprüft wurde.
 */
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.supabaseServiceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
