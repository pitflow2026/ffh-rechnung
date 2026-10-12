import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { isRelevantAttachment, type IncomingMail, type Mailbox } from "./types";

export type ImapResult = { mails: IncomingMail[]; uidValidity: number };

/**
 * IMAP-Postfächer (Yahoo, ALL-INKL …). Fortschritt über UIDs: beim ersten Lauf ab `since`,
 * danach alles mit UID > imap_last_uid. Ändert sich UIDVALIDITY,
 * wird wieder über das Datum gesucht (Duplikate fängt die Datenbank ab).
 */
export async function fetchImapMails(mailbox: Mailbox, since: Date, limit: number): Promise<ImapResult> {
  const { host, port, user, pass } = imapSettings(mailbox);
  const client = new ImapFlow({ host, port, secure: true, auth: { user, pass }, logger: false });
  try {
    await client.connect();
  } catch (e) {
    throw new Error(`IMAP-Anmeldung bei ${host} fehlgeschlagen: ${describeImapError(e)}`);
  }
  const lock = await client.getMailboxLock(mailbox.folder === "inbox" ? "INBOX" : mailbox.folder);
  try {
    const box = client.mailbox;
    const uidValidity = box ? Number(box.uidValidity) : 0;
    const sameValidity = mailbox.imap_uidvalidity === uidValidity && mailbox.imap_last_uid != null;

    const found = sameValidity
      ? await client.search({ uid: `${(mailbox.imap_last_uid ?? 0) + 1}:*` }, { uid: true })
      : await client.search({ since }, { uid: true });
    const uids = (Array.isArray(found) ? found : [])
      .filter((u) => !sameValidity || u > (mailbox.imap_last_uid ?? 0))
      .sort((a, b) => a - b)
      .slice(0, limit);

    const mails: IncomingMail[] = [];
    if (uids.length === 0) return { mails, uidValidity };

    for await (const msg of client.fetch(uids, { uid: true, source: true, internalDate: true }, { uid: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.value?.[0];
      mails.push({
        providerMessageId: `${uidValidity}:${msg.uid}`,
        internetMessageId: parsed.messageId ?? null,
        fromAddress: from?.address ?? null,
        fromName: from?.name || null,
        subject: parsed.subject ?? null,
        bodyPreview: (parsed.text ?? "").slice(0, 3000),
        receivedAt: msg.internalDate ? new Date(msg.internalDate) : parsed.date ?? new Date(),
        uid: msg.uid,
        attachments: parsed.attachments
          .filter((a) => isRelevantAttachment(a.filename ?? "", a.contentType ?? ""))
          .map((a) => ({
            filename: a.filename ?? "anhang.pdf",
            contentType: a.contentType ?? "application/octet-stream",
            content: a.content,
          })),
      });
    }
    mails.sort((a, b) => (a.uid ?? 0) - (b.uid ?? 0));
    return { mails, uidValidity };
  } catch (e) {
    throw new Error(`IMAP-Abruf fehlgeschlagen: ${describeImapError(e)}`);
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}

/** ImapFlow meldet oft nur "Command failed" – die eigentliche Ursache steckt in den Zusatzfeldern. */
function describeImapError(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  const x = e as Error & { responseText?: string; serverResponseCode?: string; authenticationFailed?: boolean; code?: string };
  if (x.authenticationFailed || x.serverResponseCode === "AUTHENTICATIONFAILED") {
    return "Benutzername oder Passwort falsch";
  }
  return [x.message, x.serverResponseCode, x.responseText, x.code].filter(Boolean).join(" · ");
}

/** Zugangsdaten je Postfach; das Passwort kommt aus der genannten Umgebungsvariable. */
function imapSettings(mailbox: Mailbox) {
  // Altbestand: Yahoo ohne eigene Spalten
  const host = mailbox.imap_host ?? "imap.mail.yahoo.com";
  if (host.includes("<")) throw new Error("IMAP-Server für dieses Postfach ist noch nicht eingetragen (Spalte imap_host)");
  const user = mailbox.imap_user ?? process.env.YAHOO_IMAP_USER ?? mailbox.address;
  const envName = mailbox.imap_password_env ?? "YAHOO_IMAP_APP_PASSWORD";
  const pass = process.env[envName]?.trim();
  if (!pass) throw new Error(`Passwort fehlt: Umgebungsvariable ${envName} in Vercel anlegen`);
  return { host, port: mailbox.imap_port ?? 993, user, pass };
}
