import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { dateTimeDE } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Postfächer · Rechnungseingang" };

export default async function MailboxesPage() {
  await requireUser();
  const db = createAdminClient();
  const [{ data: boxes }, { data: companies }, { data: docs }] = await Promise.all([
    db.from("mailboxes").select("*").order("address"),
    db.from("companies").select("id, name"),
    db.from("documents").select("mailbox_id"),
  ]);
  const coName = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]));
  const count = new Map<string, number>();
  for (const d of docs ?? []) count.set(d.mailbox_id, (count.get(d.mailbox_id) ?? 0) + 1);

  return (
    <main className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6">
      <Link href="/" className="text-[13px] text-accent underline underline-offset-2">
        ← Zurück zum Rechnungseingang
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Postfächer</h1>
      <p className="mt-1 text-[13px] text-muted">
        Diese Postfächer werden alle 15 Minuten direkt abgerufen. Übernommen werden PDF- und XML-Anhänge aus dem Posteingang.
      </p>
      <div className="mt-5 overflow-x-auto rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-subtle text-xs text-muted">
            <tr>
              <th className="px-4 py-2.5 font-semibold">Postfach</th>
              <th className="px-3 py-2.5 font-semibold">Gehört zu</th>
              <th className="px-3 py-2.5 text-right font-semibold">Belege</th>
              <th className="px-3 py-2.5 font-semibold">Abgerufen bis</th>
              <th className="px-3 py-2.5 font-semibold">Letzter Lauf</th>
              <th className="px-4 py-2.5 font-semibold">Zustand</th>
            </tr>
          </thead>
          <tbody>
            {(boxes ?? []).map((b) => (
              <tr key={b.id} className="border-b border-[#efede7] align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold">{b.address}</p>
                  <p className="text-xs text-muted">{b.provider === "graph" ? "Microsoft 365" : "Yahoo (IMAP)"}</p>
                </td>
                <td className="px-3 py-3">{b.default_company_id ? coName.get(b.default_company_id) : <span className="text-muted">mehrere</span>}</td>
                <td className="px-3 py-3 text-right font-mono">{count.get(b.id) ?? 0}</td>
                <td className="px-3 py-3 font-mono text-[13px]">{dateTimeDE(b.synced_until)}</td>
                <td className="px-3 py-3 font-mono text-[13px]">{dateTimeDE(b.last_run_at)}</td>
                <td className="px-4 py-3">
                  {!b.active ? (
                    <span className="text-muted">deaktiviert</span>
                  ) : b.last_error ? (
                    <div className="max-w-[320px]">
                      <span className="rounded-full bg-review-bg px-2.5 py-0.5 text-xs font-semibold text-review-fg">Fehler</span>
                      <p className="mt-1 break-words text-xs text-review-fg">{b.last_error}</p>
                    </div>
                  ) : b.last_run_at ? (
                    <span className="rounded-full bg-booked-bg px-2.5 py-0.5 text-xs font-semibold text-booked-fg">OK</span>
                  ) : (
                    <span className="text-muted">noch nicht abgerufen</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
