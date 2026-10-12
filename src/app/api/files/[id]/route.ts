import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

// Liefert eine Originaldatei über einen kurzlebigen, signierten Link aus.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "Ungültig" }, { status: 400 });

  const db = createAdminClient();
  const { data: file } = await db.from("document_files").select("filename, storage_path").eq("id", id).maybeSingle();
  if (!file) return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });

  const download = request.nextUrl.searchParams.get("download") === "1";
  const { data, error } = await db.storage
    .from("belege")
    .createSignedUrl(file.storage_path, 60, download ? { download: file.filename } : undefined);
  if (error || !data) return NextResponse.json({ error: "Datei nicht verfügbar" }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}
