import type { Filters } from "./queries";

export function eur(n: number | null | undefined, currency = "EUR") {
  if (n == null) return "–";
  return Number(n).toLocaleString("de-DE", { style: "currency", currency });
}

export function dateDE(s: string | null | undefined) {
  if (!s) return "–";
  const [y, m, d] = s.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export function dateTimeDE(s: string | null | undefined) {
  if (!s) return "–";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s));
}

export function monthLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function lastMonths(n: number) {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

/** Baut die URL für eine geänderte Filterauswahl. */
export function hrefFor(f: Filters, patch: Partial<Filters>, base = "/") {
  const next = { ...f, ...patch };
  const sp = new URLSearchParams();
  if (next.co !== "alle") sp.set("co", next.co);
  if (next.status !== "alle") sp.set("status", next.status);
  if (next.period !== "alle") sp.set("period", next.period);
  if (next.box !== "alle") sp.set("box", next.box);
  if (next.q) sp.set("q", next.q);
  if (next.sel) sp.set("sel", next.sel);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

export const DOC_TYPE_LABEL: Record<string, string> = {
  rechnung: "Rechnung",
  mahnung: "Mahnung",
  gutschrift: "Gutschrift",
  sonstiges: "Sonstiges",
};

export const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  gebucht: "Gebucht",
  pruefen: "Prüfen",
  ignoriert: "Ignoriert",
};
