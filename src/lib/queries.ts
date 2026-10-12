import "server-only";
import { createAdminClient } from "@/lib/supabase/server";

export type Filters = {
  co: string; // 'alle' | Unternehmens-ID | 'pruefen'
  status: string; // 'alle' | 'offen' | 'gebucht' | 'mahnung' | 'ignoriert'
  period: string; // 'alle' | 'YYYY-MM'
  box: string; // 'alle' | Postfach-ID
  q: string;
  sel: string | null;
};

export const STATUS_OPTIONS = [
  { id: "alle", label: "Alle" },
  { id: "offen", label: "Offen" },
  { id: "gebucht", label: "Gebucht" },
  { id: "mahnung", label: "Mahnungen" },
  { id: "ignoriert", label: "Ignoriert" },
] as const;

export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v) ?? "";
  };
  const period = one("period");
  return {
    co: one("co") || "alle",
    status: STATUS_OPTIONS.some((o) => o.id === one("status")) ? one("status") : "alle",
    period: /^\d{4}-\d{2}$/.test(period) ? period : "alle",
    box: one("box") || "alle",
    q: one("q").slice(0, 100),
    sel: one("sel") || null,
  };
}

export type Company = { id: string; name: string };
export type MailboxRow = {
  id: string;
  address: string;
  provider: string;
  default_company_id: string | null;
  active: boolean;
  synced_until: string | null;
  last_run_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

export type DocRow = {
  id: string;
  company_id: string | null;
  mailbox_id: string;
  received_at: string;
  doc_type: "rechnung" | "mahnung" | "gutschrift" | "sonstiges";
  status: "offen" | "gebucht" | "pruefen" | "ignoriert";
  supplier: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  net: number | null;
  vat: number | null;
  gross: number | null;
  currency: string;
  einvoice_format: string | null;
  ai_note: string | null;
  reference_number: string | null;
  related_document_id: string | null;
  extraction_error: string | null;
  booked_at: string | null;
  booked_by: string | null;
};

const DOC_COLUMNS =
  "id, company_id, mailbox_id, received_at, doc_type, status, supplier, invoice_number, invoice_date, due_date, net, vat, gross, currency, einvoice_format, ai_note, reference_number, related_document_id, extraction_error, booked_at, booked_by";

export function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  return { from: from.toISOString(), to: to.toISOString() };
}

export function todayBerlin() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
}

/** Die Abfrage für die Liste – auch vom ZIP-Export genutzt. */
export function buildListQuery(f: Filters, columns = DOC_COLUMNS) {
  const db = createAdminClient();
  let q = db.from("documents").select(columns);

  if (f.co === "pruefen") {
    q = q.eq("status", "pruefen");
  } else {
    if (f.co !== "alle") q = q.eq("company_id", f.co);
    if (f.status === "offen") q = q.eq("status", "offen");
    else if (f.status === "gebucht") q = q.eq("status", "gebucht");
    else if (f.status === "ignoriert") q = q.eq("status", "ignoriert");
    else if (f.status === "mahnung") q = q.eq("doc_type", "mahnung").neq("status", "ignoriert");
    else q = q.neq("status", "ignoriert");
  }
  if (f.period !== "alle") {
    const { from, to } = monthRange(f.period);
    q = q.gte("received_at", from).lt("received_at", to);
  }
  if (f.box !== "alle") q = q.eq("mailbox_id", f.box);
  if (f.q.trim()) {
    const term = f.q.trim().replace(/[%,()*\\]/g, " ");
    q = q.or(`supplier.ilike.%${term}%,invoice_number.ilike.%${term}%,ai_note.ilike.%${term}%`);
  }
  return q.order("received_at", { ascending: false });
}

export async function loadDashboard(f: Filters) {
  const db = createAdminClient();
  const today = todayBerlin();

  const [companies, mailboxes, list, openAll, reviewCount] = await Promise.all([
    db.from("companies").select("id, name").order("sort"),
    db
      .from("mailboxes")
      .select("id, address, provider, default_company_id, active, synced_until, last_run_at, last_error, last_error_at")
      .order("address"),
    buildListQuery(f).limit(300),
    db.from("documents").select("company_id, gross, due_date, received_at").eq("status", "offen"),
    db.from("documents").select("id", { count: "exact", head: true }).eq("status", "pruefen"),
  ]);
  for (const r of [companies, mailboxes, list, openAll, reviewCount]) {
    if (r.error) throw new Error(r.error.message);
  }

  // Kennzahlen im gewählten Unternehmen + Zeitraum
  let bookedQ = db.from("documents").select("id", { count: "exact", head: true }).eq("status", "gebucht");
  if (f.co !== "alle" && f.co !== "pruefen") bookedQ = bookedQ.eq("company_id", f.co);
  if (f.period !== "alle") {
    const { from, to } = monthRange(f.period);
    bookedQ = bookedQ.gte("received_at", from).lt("received_at", to);
  }
  const booked = await bookedQ;

  const openRows = (openAll.data ?? []) as { company_id: string | null; gross: number | null; due_date: string | null; received_at: string }[];
  const inScope = openRows.filter((r) => {
    if (f.co !== "alle" && f.co !== "pruefen" && r.company_id !== f.co) return false;
    if (f.period !== "alle" && r.received_at.slice(0, 7) !== f.period) return false;
    return true;
  });
  const overdue = inScope.filter((r) => r.due_date && r.due_date < today);
  const sum = (rows: { gross: number | null }[]) => rows.reduce((a, r) => a + Number(r.gross ?? 0), 0);

  const openByCompany: Record<string, number> = { alle: openRows.length };
  for (const r of openRows) if (r.company_id) openByCompany[r.company_id] = (openByCompany[r.company_id] ?? 0) + 1;

  const rows = (list.data ?? []) as unknown as DocRow[];

  let selected: null | {
    doc: DocRow;
    email: { subject: string | null; from_address: string | null; from_name: string | null };
    files: { id: string; filename: string; size: number }[];
    related: { id: string; supplier: string | null; invoice_number: string | null; doc_type: string } | null;
    history: { user_email: string | null; action: string; at: string }[];
  } = null;

  if (f.sel && /^[0-9a-f-]{36}$/.test(f.sel)) {
    const { data: doc } = await db.from("documents").select(`${DOC_COLUMNS}, email_id`).eq("id", f.sel).maybeSingle();
    if (doc) {
      const d = doc as unknown as DocRow & { email_id: string };
      const [email, files, related, history] = await Promise.all([
        db.from("emails").select("subject, from_address, from_name").eq("id", d.email_id).single(),
        db.from("document_files").select("id, filename, size").eq("document_id", d.id).order("filename"),
        d.related_document_id
          ? db.from("documents").select("id, supplier, invoice_number, doc_type").eq("id", d.related_document_id).maybeSingle()
          : db.from("documents").select("id, supplier, invoice_number, doc_type").eq("related_document_id", d.id).limit(1).maybeSingle(),
        db.from("audit_log").select("user_email, action, at").eq("document_id", d.id).order("at", { ascending: false }).limit(10),
      ]);
      selected = {
        doc: d,
        email: email.data ?? { subject: null, from_address: null, from_name: null },
        files: files.data ?? [],
        related: related.data ?? null,
        history: history.data ?? [],
      };
    }
  }

  return {
    today,
    companies: (companies.data ?? []) as Company[],
    mailboxes: (mailboxes.data ?? []) as MailboxRow[],
    rows,
    truncated: rows.length >= 300,
    openByCompany,
    reviewCount: reviewCount.count ?? 0,
    kpis: {
      open: inScope.length,
      openSum: sum(inScope),
      overdue: overdue.length,
      overdueSum: sum(overdue),
      booked: booked.count ?? 0,
    },
    selected,
  };
}
