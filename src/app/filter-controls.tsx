"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { hrefFor, monthLabel } from "@/lib/format";
import type { Filters } from "@/lib/queries";

const fieldClass =
  "h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:outline-2 focus:outline-accent";

export function FilterControls({
  filters,
  months,
  mailboxes,
}: {
  filters: Filters;
  months: string[];
  mailboxes: { id: string; address: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(filters.q);
  const [min, setMin] = useState(filters.min);
  const [max, setMax] = useState(filters.max);
  const first = useRef(true);

  const go = (patch: Partial<Filters>) =>
    startTransition(() => router.replace(hrefFor(filters, { ...patch, sel: null }), { scroll: false }));

  // Suche mit kurzer Verzögerung, damit nicht jeder Tastendruck lädt
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => go({ q, min: min.trim(), max: max.trim() }), 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, min, max]);

  return (
    <div className="flex flex-1 flex-wrap items-end gap-4" aria-busy={pending}>
      <div className="flex min-w-[220px] flex-[2_1_240px] flex-col gap-1.5">
        <label htmlFor="q" className="text-xs font-semibold text-muted">
          Suche
        </label>
        <input
          id="q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Lieferant, Rechnungsnr., Betrag …"
          className={fieldClass}
        />
      </div>
      <fieldset className="flex flex-[1_1_220px] flex-col gap-1.5">
        <legend className="mb-1.5 text-xs font-semibold text-muted">Brutto (€)</legend>
        <div className="flex items-center gap-2">
          <label htmlFor="min" className="sr-only">
            Brutto ab
          </label>
          <input
            id="min"
            inputMode="decimal"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="von"
            className={fieldClass}
          />
          <span aria-hidden="true" className="text-muted">
            –
          </span>
          <label htmlFor="max" className="sr-only">
            Brutto bis
          </label>
          <input
            id="max"
            inputMode="decimal"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="bis"
            className={fieldClass}
          />
        </div>
      </fieldset>
      <div className="flex flex-[1_1_160px] flex-col gap-1.5">
        <label htmlFor="period" className="text-xs font-semibold text-muted">
          Eingang
        </label>
        <select id="period" value={filters.period} onChange={(e) => go({ period: e.target.value })} className={fieldClass}>
          <option value="alle">Alle Zeiträume</option>
          {months.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-[1_1_220px] flex-col gap-1.5">
        <label htmlFor="box" className="text-xs font-semibold text-muted">
          Postfach
        </label>
        <select id="box" value={filters.box} onChange={(e) => go({ box: e.target.value })} className={fieldClass}>
          <option value="alle">Alle Postfächer</option>
          {mailboxes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.address}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
