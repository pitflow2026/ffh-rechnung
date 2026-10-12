import "server-only";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Umgebungsvariable ${name} fehlt`);
  return v;
}

export const env = {
  supabaseUrl: () => req("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => req("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  supabaseServiceKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),

  msTenantId: () => req("MS_TENANT_ID"),
  msClientId: () => req("MS_CLIENT_ID"),
  msClientSecret: () => req("MS_CLIENT_SECRET"),

  yahooUser: () => req("YAHOO_IMAP_USER"),
  yahooAppPassword: () => req("YAHOO_IMAP_APP_PASSWORD"),

  anthropicKey: () => req("ANTHROPIC_API_KEY"),
  anthropicModel: () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",

  cronSecret: () => req("CRON_SECRET"),
  initialSyncDays: () => Number(process.env.INITIAL_SYNC_DAYS || "30"),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};
