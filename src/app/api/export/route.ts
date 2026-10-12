import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/auth";
import { buildListQuery, parseFilters } from "@/lib/queries";
import { createAdminClient } from "@/lib/supabase/server";

export const maxDuration = 120;

const MAX_DOCS = 500;

type ExportDoc = {
  id: string;
  company_id: string | null;
  received_at: string;
  invoice_date: string | null;
  due_date: string | null;
  supplier: string | null;
  invoice_number: string | null;
  doc_type: string;
  status: string;
  net: number | null;
  vat: number | null;
  gross: number | null;
};

function clean(s: string) {
  return s.normalize("NFC").replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 60);
}

function money(n: number | null) {
  return n == null ? "" : n.toFixed(2).replace(".", ",");
}

function csvCell(s: string) {
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ZIP mit allen Originaldateien der aktuellen Filterauswahl, sortiert
// nach Unternehmen/Monat, plus Belegliste.csv (Excel-tauglich, Semikolon).
export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });

  const sp = Object.fromEntries(request.nextUrl.searchParams.entries());
  const filters = parseFilters(sp);
  const db = createAdminClient();

  const { data, error } = await buildListQuery(
    filters,
    "id, company_id, received_at, invoice_date, due_date, supplier, invoice_number, doc_type, status, net, vat, gross",
  ).limit(MAX_DOCS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const docs = (data ?? []) as unknown as ExportDoc[];

  const [{ data: companies }, { data: files }] = await Promise.all([
    db.from("companies").select("id, name"),
    docs.length
      ? db.from("document_files").select("document_id, filename, storage_path").in("document_id", docs.map((d) => d.id))
      : Promise.resolve({ data: [] as { document_id: string; filename: string; storage_path: string }[] }),
  ]);
  const coName = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]));

  const zip = new JSZip();
  const csv = ["Unternehmen;Typ;Status;Lieferant;Rechnungsnr.;Rechnungsdatum;Fällig;Netto;USt;Brutto;Eingang;Datei"];
  const used = new Set<string>();

  for (const d of docs) {
    const company = d.company_id ? coName.get(d.company_id) ?? d.company_id : "Nicht zugeordnet";
    const month = (d.invoice_date ?? d.received_at).slice(0, 7);
    const base = clean(
      [d.invoice_date ?? d.received_at.slice(0, 10), d.supplier ?? "Unbekannt", d.invoice_number ?? ""].filter(Boolean).join("_"),
    );
    const docFiles = (files ?? []).filter((f) => f.document_id === d.id);
    const names: string[] = [];

    for (const f of docFiles) {
      const ext = f.filename.includes(".") ? f.filename.slice(f.filename.lastIndexOf(".")) : "";
      let path = `${clean(company)}/${month}/${base}${d.doc_type === "mahnung" ? "_Mahnung" : ""}${ext}`;
      for (let i = 2; used.has(path); i++) path = path.replace(/(\.[^.]+)?$/, `_${i}$1`);
      used.add(path);

      const { data: blob } = await db.storage.from("belege").download(f.storage_path);
      if (!blob) continue;
      zip.file(path, Buffer.from(await blob.arrayBuffer()));
      names.push(path);
    }

    csv.push(
      [
        company,
        d.doc_type,
        d.status,
        d.supplier ?? "",
        d.invoice_number ?? "",
        d.invoice_date ?? "",
        d.due_date ?? "",
        money(d.net),
        money(d.vat),
        money(d.gross),
        d.received_at.slice(0, 10),
        names.join(" + "),
      ]
        .map((c) => csvCell(String(c)))
        .join(";"),
    );
  }

  zip.file("Belegliste.csv", "﻿" + csv.join("\r\n"));
  const content = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  const label = filters.period !== "alle" ? filters.period : new Date().toISOString().slice(0, 10);
  const scope = filters.co !== "alle" ? `_${filters.co}` : "";
  return new NextResponse(Buffer.from(content), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="Rechnungen${scope}_${label}.zip"`,
    },
  });
}
