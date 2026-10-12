import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import type { Company } from "@/lib/extract";
import { fetchGraphMails } from "./graph";
import { fetchImapMails } from "./imap";
import { processMail } from "./process";
import type { IncomingMail, Mailbox } from "./types";

const MAILS_PER_MAILBOX = 40;

export type MailboxRun = {
  address: string;
  mails: number;
  created: number;
  duplicates: number;
  error: string | null;
};

/**
 * Ruft alle aktiven Postfächer ab. Läuft pro Postfach in der Reihenfolge
 * des Eingangs und bleibt bei einem Fehler an dieser Mail stehen, damit
 * nichts übersprungen wird. `deadline` begrenzt die Laufzeit (Vercel).
 */
export async function runSync(opts: { deadline: number }): Promise<MailboxRun[]> {
  const db = createAdminClient();
  const [{ data: boxes, error: boxErr }, { data: companies, error: coErr }] = await Promise.all([
    // Am längsten nicht abgerufene Postfächer zuerst – so kommt bei
    // begrenzter Laufzeit jedes Postfach reihum dran.
    db.from("mailboxes").select("*").eq("active", true).order("last_run_at", { ascending: true, nullsFirst: true }),
    db.from("companies").select("id, name, hints").order("sort"),
  ]);
  if (boxErr || coErr) throw new Error(boxErr?.message ?? coErr?.message);

  const runs: MailboxRun[] = [];
  for (const mailbox of (boxes ?? []) as Mailbox[]) {
    if (Date.now() > opts.deadline) break;
    runs.push(await syncMailbox(mailbox, (companies ?? []) as Company[], opts.deadline));
  }
  return runs;
}

async function syncMailbox(mailbox: Mailbox, companies: Company[], deadline: number): Promise<MailboxRun> {
  const db = createAdminClient();
  const run: MailboxRun = { address: mailbox.address, mails: 0, created: 0, duplicates: 0, error: null };
  const since = mailbox.synced_until
    ? new Date(mailbox.synced_until)
    : new Date(Date.now() - env.initialSyncDays() * 24 * 3600 * 1000);

  let syncedUntil = mailbox.synced_until;
  let lastUid = mailbox.imap_last_uid;
  let uidValidity = mailbox.imap_uidvalidity;

  try {
    let mails: IncomingMail[];
    if (mailbox.provider === "graph") {
      mails = await fetchGraphMails(mailbox, since, MAILS_PER_MAILBOX);
    } else {
      const res = await fetchImapMails(mailbox, since, MAILS_PER_MAILBOX);
      mails = res.mails;
      if (uidValidity !== res.uidValidity) lastUid = null;
      uidValidity = res.uidValidity;
    }

    for (const mail of mails) {
      if (Date.now() > deadline) break;
      const r = await processMail(db, mailbox, companies, mail);
      if (!r.skippedMail) run.mails++;
      run.created += r.created;
      run.duplicates += r.duplicates;
      if (r.errors.length) run.error = r.errors.join(" | ");
      syncedUntil = mail.receivedAt.toISOString();
      if (mail.uid != null) lastUid = mail.uid;
    }
  } catch (e) {
    run.error = e instanceof Error ? e.message : String(e);
  }

  await db
    .from("mailboxes")
    .update({
      synced_until: syncedUntil,
      imap_last_uid: lastUid,
      imap_uidvalidity: uidValidity,
      last_run_at: new Date().toISOString(),
      ...(run.error ? { last_error: run.error.slice(0, 1000), last_error_at: new Date().toISOString() } : { last_error: null }),
    })
    .eq("id", mailbox.id);

  return run;
}
