export type IncomingAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

export type IncomingMail = {
  providerMessageId: string;
  internetMessageId: string | null;
  fromAddress: string | null;
  fromName: string | null;
  subject: string | null;
  receivedAt: Date;
  attachments: IncomingAttachment[];
  /** Nur IMAP: UID für den Fortschrittszeiger */
  uid?: number;
};

export type Mailbox = {
  id: string;
  address: string;
  provider: "graph" | "imap";
  default_company_id: string | null;
  folder: string;
  active: boolean;
  synced_until: string | null;
  imap_uidvalidity: number | null;
  imap_last_uid: number | null;
};

/** Nur Rechnungsrelevante Dateitypen werden übernommen. */
export function isRelevantAttachment(filename: string, contentType: string): boolean {
  const f = filename.toLowerCase();
  const t = contentType.toLowerCase();
  return f.endsWith(".pdf") || f.endsWith(".xml") || t === "application/pdf" || t.endsWith("/xml");
}
