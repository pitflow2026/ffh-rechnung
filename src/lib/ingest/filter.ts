import type { IncomingMail } from "./types";

/**
 * Vorfilter: Nur Mails, deren Betreff, Dateinamen oder Textanfang nach
 * Rechnung, Mahnung, Gutschrift o. ä. aussehen, werden zu Belegen.
 * Alles andere wird gar nicht erst gespeichert oder von der KI gelesen.
 * Deutsch und Englisch; XML-Anhänge (E-Rechnungen) gehen immer durch.
 */
const TERMS = [
  // Rechnung
  "rechnung", "rechnungs", "e-rechnung", "xrechnung", "zugferd", "factur-x", "faktura", "abrechnung",
  "beitragsrechnung", "abschlagsrechnung", "teilrechnung", "schlussrechnung", "sammelrechnung",
  "invoice", "invoicing", "billing", "receipt", "quittung",
  // Gutschrift / Korrektur
  "gutschrift", "storno", "stornorechnung", "korrekturrechnung", "credit note", "creditnote", "credit memo",
  // Mahnung / Zahlung
  "mahnung", "zahlungserinnerung", "zahlungsaufforderung", "offene posten", "offener posten", "offener betrag",
  "payment reminder", "dunning", "overdue", "past due", "payment due", "amount due",
];

// Kürzel, die nur als eigenes Wort zählen (sonst Treffer in "billig", "inventar" …)
const WORD_PATTERNS = [/\bbill\b/, /\bbeleg(e|nr)?\b/, /\bre[-.\s]?nr\b/, /\brg[-.\s]?nr\b/, /\binv[-_]?\d/, /\bre[-_]\d{3,}/, /\brg[-_]?\d{3,}/];

export function looksLikeInvoiceMail(mail: IncomingMail): boolean {
  if (mail.attachments.some((a) => a.filename.toLowerCase().endsWith(".xml") || a.contentType.toLowerCase().includes("xml"))) {
    return true;
  }
  const haystack = [mail.subject ?? "", ...mail.attachments.map((a) => a.filename), (mail.bodyPreview ?? "").slice(0, 3000)]
    .join(" \n ")
    .toLowerCase()
    .replace(/[_]+/g, " ");
  return TERMS.some((t) => haystack.includes(t)) || WORD_PATTERNS.some((r) => r.test(haystack));
}
