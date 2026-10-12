import Link from "next/link";
import { assignCompany, setStatus, syncNow } from "@/app/actions";
import { signOut } from "@/app/login/actions";
import { requireUser } from "@/lib/auth";
import { DOC_TYPE_LABEL, STATUS_LABEL, dateDE, dateTimeDE, eur, hrefFor, lastMonths } from "@/lib/format";
import { STATUS_OPTIONS, loadDashboard, parseFilters, type DocRow, type Filters } from "@/lib/queries";
import { FilterControls } from "./filter-controls";
import { SubmitButton } from "./submit-button";

const CHIP: Record<string, string> = {
  offen: "bg-open-bg text-open-fg",
  gebucht: "bg-booked-bg text-booked-fg",
  pruefen: "bg-review-bg text-review-fg",
  ignoriert: "bg-line text-muted",
};

function StatusChip({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export default async function Page({ searchParams }: PageProps<"/">) {
  const user = await requireUser();
  const filters = parseFilters(await searchParams);
  const data = await loadDashboard(filters);

  const coName = new Map(data.companies.map((c) => [c.id, c.name]));
  const boxName = new Map(data.mailboxes.map((m) => [m.id, m.address]));
  const lastRun = data.mailboxes.reduce<string | null>((a, m) => (m.last_run_at && (!a || m.last_run_at > a) ? m.last_run_at : a), null);
  const failing = data.mailboxes.filter((m) => m.active && m.last_error);

  const listTitle =
    filters.co === "pruefen" ? "Zu prüfen" : filters.co === "alle" ? "Alle Unternehmen" : coName.get(filters.co) ?? "Unbekannt";
  const listSum = data.rows.reduce((a, r) => a + Number(r.gross ?? 0), 0);
  const exportHref = hrefFor({ ...filters, sel: null }, {}, "/api/export");

  const kpis = [
    { label: "Offen", value: data.kpis.open, sub: `${eur(data.kpis.openSum)} brutto`, tone: "" },
    {
      label: "Überfällig",
      value: data.kpis.overdue,
      sub: data.kpis.overdue ? `${eur(data.kpis.overdueSum)} brutto` : "nichts überfällig",
      tone: data.kpis.overdue ? "text-overdue" : "",
    },
    { label: "Zu prüfen", value: data.reviewCount, sub: "ohne sichere Zuordnung", tone: data.reviewCount ? "text-review-fg" : "" },
    { label: "Gebucht", value: data.kpis.booked, sub: filters.period === "alle" ? "insgesamt" : "im gewählten Monat", tone: "" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">FFH-Gruppe · Buchhaltung</p>
            <h1 className="text-2xl font-bold">Rechnungseingang</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {failing.length > 0 ? (
              <Link href="/postfaecher" className="rounded-full bg-review-bg px-3 py-1 text-xs font-semibold text-review-fg">
                {failing.length} Postfach{failing.length > 1 ? "fächer" : ""} mit Fehler
              </Link>
            ) : (
              <Link href="/postfaecher" className="text-[13px] text-muted underline-offset-2 hover:underline">
                {data.mailboxes.length} Postfächer · zuletzt abgerufen {dateTimeDE(lastRun)}
              </Link>
            )}
            <form action={syncNow}>
              <SubmitButton
                pendingLabel="Wird abgerufen …"
                className="h-11 rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold"
              >
                Jetzt abrufen
              </SubmitButton>
            </form>
            <form action={signOut}>
              <button type="submit" className="h-11 px-2 text-[13px] text-muted hover:text-ink" title={user.email}>
                Abmelden
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] flex-wrap items-start gap-6 px-4 py-6 sm:px-6">
        <nav aria-label="Unternehmen" className="flex w-full min-w-0 flex-col gap-1 rounded-xl border border-line bg-surface p-3 md:w-64 md:flex-none">
          <p className="px-2.5 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted">Unternehmen</p>
          {[{ id: "alle", name: "Alle Unternehmen" }, ...data.companies].map((c) => {
            const active = filters.co === c.id;
            return (
              <Link
                key={c.id}
                href={hrefFor(filters, { co: c.id, sel: null })}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 ${
                  active ? "bg-accent font-semibold text-white" : "font-medium hover:bg-subtle"
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span
                  className={`min-w-6 rounded-full px-2 py-px text-center font-mono text-xs font-semibold ${
                    active ? "bg-white/20 text-white" : "bg-ground text-muted"
                  }`}
                  aria-label={`${data.openByCompany[c.id] ?? 0} offen`}
                >
                  {data.openByCompany[c.id] ?? 0}
                </span>
              </Link>
            );
          })}
          <div className="mx-1 my-2 h-px bg-line" />
          <Link
            href={hrefFor(filters, { co: "pruefen", sel: null })}
            aria-current={filters.co === "pruefen" ? "page" : undefined}
            className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-2.5 font-semibold ${
              filters.co === "pruefen" ? "bg-review-fg text-white" : "text-review-fg hover:bg-review-bg"
            }`}
          >
            <span>Zu prüfen</span>
            <span
              className={`min-w-6 rounded-full px-2 py-px text-center font-mono text-xs ${
                filters.co === "pruefen" ? "bg-white/20" : "bg-review-bg"
              }`}
            >
              {data.reviewCount}
            </span>
          </Link>
          <p className="px-2.5 pt-2 text-xs text-muted">
            Belege, die keinem Unternehmen sicher zugeordnet werden konnten.
          </p>
        </nav>

        <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-5">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
            {kpis.map((k) => (
              <div key={k.label} className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
                <p className="text-[13px] text-muted">{k.label}</p>
                <p className={`font-mono text-[28px] font-medium tracking-tight ${k.tone}`}>{k.value}</p>
                <p className="text-xs text-muted">{k.sub}</p>
              </div>
            ))}
          </div>

          <section aria-label="Filter" className="flex flex-wrap items-end gap-4 rounded-xl border border-line bg-surface p-4">
            {filters.co !== "pruefen" && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-muted">Status</p>
                <div role="group" aria-label="Status" className="flex flex-wrap gap-1 rounded-[10px] bg-ground p-1">
                  {STATUS_OPTIONS.map((o) => {
                    const on = filters.status === o.id;
                    return (
                      <Link
                        key={o.id}
                        href={hrefFor(filters, { status: o.id, sel: null })}
                        aria-current={on ? "true" : undefined}
                        className={`flex min-h-9 items-center rounded-[7px] px-3.5 text-[13px] font-semibold ${
                          on ? "bg-surface text-ink shadow-sm" : "text-[#4a4e57] hover:text-ink"
                        }`}
                      >
                        {o.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            <FilterControls
              key={`${filters.period}|${filters.box}|${filters.co}|${filters.status}`}
              filters={filters}
              months={lastMonths(13)}
              mailboxes={data.mailboxes.map((m) => ({ id: m.id, address: m.address }))}
            />
            <a
              href={exportHref}
              className="flex h-11 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-white hover:bg-[#163a5b]"
            >
              ZIP-Export ({data.rows.length})
            </a>
          </section>

          <div className="flex flex-wrap items-start gap-5">
            <section aria-label="Belege" className="min-w-0 flex-[999_1_640px] overflow-hidden rounded-xl border border-line bg-surface">
              <div className="flex flex-wrap justify-between gap-2 border-b border-line px-4 py-3.5">
                <h2 className="font-semibold">{listTitle}</h2>
                <p className="text-[13px] text-muted">
                  {data.rows.length}
                  {data.truncated ? "+" : ""} Belege · {eur(listSum)} brutto
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[960px] border-collapse text-left">
                  <thead className="bg-subtle text-xs font-semibold text-muted">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Eingang</th>
                      <th className="px-3 py-2.5 font-semibold">Unternehmen</th>
                      <th className="px-3 py-2.5 font-semibold">Lieferant</th>
                      <th className="px-3 py-2.5 font-semibold">Belegnr.</th>
                      <th className="px-3 py-2.5 font-semibold">Postfach</th>
                      <th className="px-3 py-2.5 text-right font-semibold">Brutto</th>
                      <th className="px-3 py-2.5 font-semibold">Fällig</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <Row key={r.id} r={r} filters={filters} today={data.today} coName={coName} boxName={boxName} />
                    ))}
                  </tbody>
                </table>
                {data.rows.length === 0 && <p className="px-4 py-10 text-center text-muted">Keine Belege für diese Filter.</p>}
                {data.truncated && (
                  <p className="border-t border-line px-4 py-3 text-[13px] text-muted">
                    Es werden die neuesten 300 Belege angezeigt. Filter eingrenzen, um ältere zu sehen.
                  </p>
                )}
              </div>
            </section>

            <Detail data={data} filters={filters} coName={coName} boxName={boxName} />
          </div>
        </main>
      </div>
    </div>
  );
}

function Row({
  r,
  filters,
  today,
  coName,
  boxName,
}: {
  r: DocRow;
  filters: Filters;
  today: string;
  coName: Map<string, string>;
  boxName: Map<string, string>;
}) {
  const selected = filters.sel === r.id;
  const overdue = r.status === "offen" && r.due_date && r.due_date < today;
  return (
    <tr className={`border-b border-[#efede7] ${selected ? "bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]" : ""}`}>
      <td className="px-4 py-2.5 font-mono text-[13px]">{dateDE(r.received_at)}</td>
      <td className="max-w-[200px] truncate px-3 py-2.5">
        {r.company_id ? coName.get(r.company_id) : <span className="font-semibold italic text-review-fg">Nicht zugeordnet</span>}
      </td>
      <td className="px-3 py-2.5">
        <Link
          href={hrefFor(filters, { sel: r.id })}
          scroll={false}
          className="font-semibold text-accent underline underline-offset-[3px]"
        >
          {r.supplier || "Unbekannt"}
        </Link>
        {r.doc_type !== "rechnung" && (
          <span className="ml-2 rounded bg-ground px-1.5 py-px text-[11px] font-semibold text-muted">{DOC_TYPE_LABEL[r.doc_type]}</span>
        )}
      </td>
      <td className="max-w-[160px] truncate px-3 py-2.5 font-mono text-[13px]">{r.invoice_number ?? "–"}</td>
      <td className="max-w-[200px] truncate px-3 py-2.5 text-[13px] text-muted">{boxName.get(r.mailbox_id)}</td>
      <td className="px-3 py-2.5 text-right font-mono text-[13px]">{eur(r.gross, r.currency)}</td>
      <td className={`px-3 py-2.5 font-mono text-[13px] ${overdue ? "font-semibold text-overdue" : ""}`}>
        {dateDE(r.due_date)}
        {overdue && <span className="sr-only"> (überfällig)</span>}
      </td>
      <td className="px-4 py-2.5">
        <StatusChip status={r.status} />
      </td>
    </tr>
  );
}

function Detail({
  data,
  filters,
  coName,
  boxName,
}: {
  data: Awaited<ReturnType<typeof loadDashboard>>;
  filters: Filters;
  coName: Map<string, string>;
  boxName: Map<string, string>;
}) {
  const s = data.selected;
  if (!s) {
    return (
      <aside aria-label="Belegdetails" className="flex min-w-0 flex-[1_1_300px] flex-col gap-1.5 rounded-xl border border-line bg-surface p-5">
        <h2 className="font-semibold">Belegdetails</h2>
        <p className="text-[13px] text-muted">
          Lieferant in der Liste anklicken, um die ausgelesenen Daten, die Originaldateien und die Mail zu sehen.
        </p>
      </aside>
    );
  }
  const d = s.doc;
  const overdue = d.status === "offen" && d.due_date && d.due_date < data.today;
  const fields: [string, string, boolean?][] = [
    ["Belegnr.", d.invoice_number ?? "–", true],
    ["Belegdatum", dateDE(d.invoice_date), true],
    ["Netto", eur(d.net, d.currency), true],
    ["USt.", eur(d.vat, d.currency), true],
    ["Brutto", eur(d.gross, d.currency), true],
    ["Fällig", dateDE(d.due_date) + (overdue ? " · überfällig" : ""), true],
  ];

  return (
    <aside aria-label="Belegdetails" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted">
            {d.company_id ? coName.get(d.company_id) : "Nicht zugeordnet"} · {DOC_TYPE_LABEL[d.doc_type]}
            {d.einvoice_format ? ` · ${d.einvoice_format === "xrechnung" ? "XRechnung" : "ZUGFeRD"}` : ""}
          </p>
          <h2 className="text-lg font-bold">{d.supplier || "Unbekannt"}</h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={d.status} />
          <Link href={hrefFor(filters, { sel: null })} scroll={false} aria-label="Details schließen" className="p-1 text-muted hover:text-ink">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </Link>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[13px]">
        {fields.map(([k, v]) => (
          <div key={k}>
            <dt className="text-muted">{k}</dt>
            <dd className={`font-mono ${k === "Fällig" && overdue ? "font-semibold text-overdue" : ""} ${k === "Brutto" ? "font-medium" : ""}`}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      {s.related && (
        <p className="text-[13px]">
          {d.doc_type === "mahnung" ? "Mahnung zu " : "Gemahnt durch "}
          <Link href={hrefFor(filters, { sel: s.related.id })} scroll={false} className="font-semibold text-accent underline">
            {DOC_TYPE_LABEL[s.related.doc_type]} {s.related.invoice_number ?? ""}
          </Link>
        </p>
      )}

      <div className="flex flex-col gap-0.5 rounded-lg border border-line bg-subtle px-3 py-2.5 text-[13px]">
        <p className="text-muted">
          Eingang über {boxName.get(d.mailbox_id)} · {dateTimeDE(d.received_at)}
        </p>
        <p>Von: {s.email.from_name ? `${s.email.from_name} <${s.email.from_address}>` : s.email.from_address ?? "–"}</p>
        <p>Betreff: {s.email.subject ?? "–"}</p>
        {d.ai_note && <p className="text-muted">{d.ai_note}</p>}
        {d.extraction_error && <p className="text-review-fg">Auslesen fehlgeschlagen: {d.extraction_error}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-xs font-semibold text-muted">Originaldateien</p>
        {s.files.map((f) => (
          <div key={f.id} className="flex items-center gap-2">
            <a
              href={`/api/files/${f.id}`}
              target="_blank"
              rel="noopener"
              className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg border border-line-strong px-3 font-mono text-[13px] hover:bg-subtle"
            >
              <span className="truncate">{f.filename}</span>
            </a>
            <a
              href={`/api/files/${f.id}?download=1`}
              aria-label={`${f.filename} herunterladen`}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-strong hover:bg-subtle"
            >
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
            </a>
          </div>
        ))}
      </div>

      <form action={assignCompany} className="flex flex-col gap-1.5">
        <input type="hidden" name="id" value={d.id} />
        <label htmlFor="company_id" className="text-xs font-semibold text-muted">
          {d.company_id ? "Unternehmen ändern" : "Unternehmen zuordnen"}
        </label>
        <div className="flex gap-2">
          <select
            id="company_id"
            name="company_id"
            defaultValue={d.company_id ?? ""}
            required
            className="h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-surface px-2.5 text-sm"
          >
            <option value="" disabled>
              Bitte wählen …
            </option>
            {data.companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <SubmitButton pendingLabel="…" className="h-11 rounded-lg border border-line-strong px-3 text-sm font-semibold">
            Speichern
          </SubmitButton>
        </div>
      </form>

      <div className="flex flex-wrap gap-2">
        {d.status === "offen" && (
          <StatusForm id={d.id} status="gebucht" primary>
            Als gebucht markieren
          </StatusForm>
        )}
        {d.status === "gebucht" && (
          <StatusForm id={d.id} status="offen">
            Zurück auf „offen“
          </StatusForm>
        )}
        {d.status !== "ignoriert" ? (
          <StatusForm id={d.id} status="ignoriert">
            Ignorieren
          </StatusForm>
        ) : (
          d.company_id && (
            <StatusForm id={d.id} status="offen">
              Wiederherstellen
            </StatusForm>
          )
        )}
      </div>
      {d.booked_at && (
        <p className="text-xs text-muted">
          Gebucht am {dateTimeDE(d.booked_at)} von {d.booked_by}
        </p>
      )}

      {s.history.length > 0 && (
        <details className="text-xs text-muted">
          <summary className="cursor-pointer">Verlauf</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {s.history.map((h, i) => (
              <li key={i}>
                {dateTimeDE(h.at)} · {h.user_email} · {h.action}
              </li>
            ))}
          </ul>
        </details>
      )}
    </aside>
  );
}

function StatusForm({ id, status, primary, children }: { id: string; status: string; primary?: boolean; children: React.ReactNode }) {
  return (
    <form action={setStatus} className={primary ? "w-full" : ""}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <SubmitButton
        className={
          primary
            ? "h-11 w-full rounded-lg bg-accent text-sm font-semibold text-white"
            : "h-11 rounded-lg border border-line-strong px-3.5 text-sm font-semibold"
        }
      >
        {children}
      </SubmitButton>
    </form>
  );
}
