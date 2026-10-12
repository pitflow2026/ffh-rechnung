import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "@/lib/env";

export type Company = { id: string; name: string; hints: string };

export const Extraction = z.object({
  doc_type: z.preprocess((v) => (typeof v === "string" ? v.toLowerCase() : v), z.enum(["rechnung", "mahnung", "gutschrift", "sonstiges"])),
  company_id: z.string().nullable(),
  company_confidence: z.number().transform((n) => Math.min(1, Math.max(0, n))),
  company_reason: z.string(),
  supplier: z.string().nullable(),
  invoice_number: z.string().nullable(),
  invoice_date: z.string().nullable(),
  due_date: z.string().nullable(),
  net: z.number().nullable(),
  vat: z.number().nullable(),
  gross: z.number().nullable(),
  currency: z.string().nullable(),
  reference_number: z.string().nullable(),
});
export type Extraction = z.infer<typeof Extraction>;

const TOOL = {
  name: "beleg_erfassen",
  description: "Erfasst die ausgelesenen Daten eines eingegangenen Belegs.",
  input_schema: {
    type: "object" as const,
    properties: {
      doc_type: {
        type: "string",
        enum: ["rechnung", "mahnung", "gutschrift", "sonstiges"],
        description:
          "rechnung = Eingangsrechnung oder Abschlagsrechnung; mahnung = Zahlungserinnerung/Mahnung; gutschrift = Gutschrift/Rechnungskorrektur zu unseren Gunsten; sonstiges = kein Buchungsbeleg (AGB, Lieferschein, Werbung, Angebot, Auftragsbestätigung …)",
      },
      company_id: {
        type: ["string", "null"],
        description: "ID des Unternehmens, an das der Beleg adressiert ist (Rechnungsempfänger), oder null wenn nicht eindeutig.",
      },
      company_confidence: { type: "number", description: "Sicherheit der Zuordnung von 0 bis 1." },
      company_reason: { type: "string", description: "Ein kurzer Satz auf Deutsch, woran die Zuordnung festgemacht wurde." },
      supplier: { type: ["string", "null"], description: "Name des Rechnungsstellers / Lieferanten." },
      invoice_number: { type: ["string", "null"], description: "Rechnungs- bzw. Belegnummer." },
      invoice_date: { type: ["string", "null"], description: "Rechnungsdatum im Format YYYY-MM-DD." },
      due_date: { type: ["string", "null"], description: "Fälligkeitsdatum YYYY-MM-DD, falls angegeben oder aus dem Zahlungsziel berechenbar." },
      net: { type: ["number", "null"], description: "Nettobetrag gesamt." },
      vat: { type: ["number", "null"], description: "Umsatzsteuer gesamt." },
      gross: { type: ["number", "null"], description: "Bruttobetrag / Zahlbetrag gesamt." },
      currency: { type: ["string", "null"], description: "ISO-Währung, meist EUR." },
      reference_number: {
        type: ["string", "null"],
        description: "Nur bei Mahnungen/Gutschriften: die Nummer der Rechnung, auf die sich der Beleg bezieht.",
      },
    },
    required: [
      "doc_type", "company_id", "company_confidence", "company_reason", "supplier", "invoice_number",
      "invoice_date", "due_date", "net", "vat", "gross", "currency", "reference_number",
    ],
    additionalProperties: false,
  },
};

let client: Anthropic | null = null;
function anthropic() {
  if (!client) {
    // Organisationsweite Schlüssel brauchen die Workspace-ID als Header;
    // Workspace-gebundene Schlüssel kommen ohne aus.
    const workspace = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
    client = new Anthropic({
      apiKey: env.anthropicKey().trim(),
      defaultHeaders: workspace ? { "anthropic-workspace-id": workspace } : undefined,
    });
  }
  return client;
}

export async function extractDocument(input: {
  companies: Company[];
  mailboxAddress: string;
  mailboxCompanyId: string | null;
  subject: string | null;
  fromAddress: string | null;
  primaryFile: { filename: string; contentType: string; content: Buffer };
}): Promise<Extraction> {
  const { primaryFile } = input;
  const isXml = primaryFile.filename.toLowerCase().endsWith(".xml") || primaryFile.contentType.includes("xml");

  const companyList = input.companies
    .map((c) => `- ${c.id}: ${c.name}${c.hints ? ` (auch: ${c.hints})` : ""}`)
    .join("\n");

  const context = [
    `Unsere Unternehmen (mögliche Rechnungsempfänger):\n${companyList}`,
    `Eingegangen im Postfach: ${input.mailboxAddress}` +
      (input.mailboxCompanyId
        ? ` – dieses Postfach gehört normalerweise zu „${input.mailboxCompanyId}“. Entscheidend ist aber der Rechnungsempfänger auf dem Beleg.`
        : " – Sammelpostfach für mehrere Unternehmen."),
    `Absender: ${input.fromAddress ?? "unbekannt"}`,
    `Betreff: ${input.subject ?? "(kein Betreff)"}`,
    `Dateiname: ${primaryFile.filename}`,
    "Lies den Beleg aus und antworte ausschließlich im vorgegebenen JSON-Format. Erfinde nichts: Was nicht auf dem Beleg steht, ist null. " +
      "Ordne nur dann ein Unternehmen zu, wenn Name oder Anschrift des Rechnungsempfängers dazu passt; sonst company_id = null.",
  ].join("\n\n");

  const fileBlock = isXml
    ? ({ type: "text", text: `Inhalt der E-Rechnung (XML):\n\n${primaryFile.content.toString("utf8").slice(0, 150_000)}` } as const)
    : ({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: primaryFile.content.toString("base64") },
      } as const);

  // Strukturierte Ausgabe: die Antwort ist garantiert JSON nach SCHEMA
  const res = await anthropic().messages.create({
    model: env.anthropicModel(),
    max_tokens: 4096,
    output_config: { format: { type: "json_schema", schema: TOOL.input_schema } },
    messages: [{ role: "user", content: [fileBlock, { type: "text", text: context }] }],
  });

  if (res.stop_reason === "refusal") throw new Error("KI hat das Auslesen abgelehnt");
  if (res.stop_reason === "max_tokens") throw new Error("Antwort der KI abgeschnitten");
  const text = res.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("KI hat keine Daten geliefert");
  const parsed = Extraction.parse(JSON.parse(text.text));
  if (parsed.company_id && !input.companies.some((c) => c.id === parsed.company_id)) {
    parsed.company_id = null;
    parsed.company_confidence = 0;
  }
  return parsed;
}
