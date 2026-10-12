import "server-only";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { env } from "@/lib/env";
import { isRelevantAttachment, type IncomingMail, type Mailbox } from "./types";

export type ImapResult = { mails: IncomingMail[]; uidValidity: number };

/**
 * Yahoo per IMAP. Fortschritt über UIDs: beim ersten Lauf ab `since`,
 * danach alles mit UID > imap_last_uid. Ändert sich UIDVALIDITY,
 * wird wieder über das Datum gesucht (Duplikate fängt die Datenbank ab).
 */
export async function fetchImapMails(mailbox: Mailbox, since: Date, limit: number): Promise<ImapResult> {
  const client = new ImapFlow({
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    auth: { user: env.yahooUser(), pass: env.yahooAppPassword() },
    logger: false,
  });
  await client.connect();
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
  } finally {
    lock.release();
    await client.logout().catch(() => undefined);
  }
}
