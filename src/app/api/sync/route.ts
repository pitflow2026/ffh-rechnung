import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { runSync } from "@/lib/ingest/sync";

export const maxDuration = 300;

// Wird von Vercel Cron alle 15 Minuten aufgerufen (siehe vercel.json).
// Vercel schickt automatisch "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${env.cronSecret()}`) {
    return NextResponse.json({ error: "Nicht berechtigt" }, { status: 401 });
  }
  const runs = await runSync({ deadline: Date.now() + 270_000 });
  return NextResponse.json({ ok: true, runs });
}
