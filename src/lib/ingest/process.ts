import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractDocument, type Company, type Extraction } from "@/lib/extract";
import type { IncomingAttachment, IncomingMail, Mailbox } from "./types";

const AUTO_ASSIGN_CONFIDENCE = 0.8;

export type ProcessResult = { skippedMail: boolean; created: number; duplicates: number; errors: string[] };

function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

function stem(filename: string) {
  return filename.toLowerCase().replace(/\.[^.]+$/, "");
}

function safeName(filename: string) {
  return filename.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-120) || "datei";
}

function isXml(a: IncomingAttachment) {
  return a.filename.toLowerCase().endsWith(".xml") || a.contentType.toLowerCase().includes("xml");
}

/** PDF mit eingebetteter Rechnungs-XML (ZUGFeRD / Factur-X)? */
function looksLikeZugferd(pdf: Buffer) {
  const s = pdf.toString("latin1");
  return /factur-x\.xml|zugferd-invoice\.xml|ZUGFeRD-invoice\.xml|xrechnung\.xml/i.test(s);
}

/**
 * Gruppiert die Anhänge einer Mail zu Belegen: eine XML-Rechnung und das
 * gleichnamige PDF gehören zusammen, jedes weitere PDF ist ein eigener Beleg.
 */
function groupAttachments(atts: IncomingAttachment[]) {
  const xmls = atts.filter(isXml);
  const pdfs = atts.filter((a) => !isXml(a));
  const groups: { primary: IncomingAttachment; files: IncomingAttachment[]; format: "xrechnung" | "zugferd" | null }[] = [];
  const usedPdfs = new Set<IncomingAttachment>();

  for (const x of xmls) {
    const partner =
      pdfs.find((p) => !usedPdfs.has(p) && stem(p.filename) === stem(x.filename)) ??
      (xmls.length === 1 && pdfs.length === 1 ? pdfs[0] : undefined);
    if (partner) usedPdfs.add(partner);
    groups.push({ primary: x, files: partner ? [x, partner] : [x], format: "xrechnung" });
  }
  for (const p of pdfs) {
    if (usedPdfs.has(p)) continue;
    groups.push({ primary: p, files: [p], format: looksLikeZugferd(p.content) ? "zugferd" : null });
  }
  return groups;
}

function decide(ex: Extraction | null, mailbox: Mailbox) {
  if (!ex) return { company_id: null as string | null, status: "pruefen", note: "Beleg konnte nicht ausgelesen werden" };
  if (ex.doc_type === "sonstiges") {
    return { company_id: ex.company_id ?? mailbox.default_company_id, status: "ignoriert", note: "Kein Buchungsbeleg erkannt" };
  }
  const pct = Math.round(ex.company_confidence * 100);
  if (ex.company_id && ex.company_confidence >= AUTO_ASSIGN_CONFIDENCE) {
    return { company_id: ex.company_id, status: "offen", note: `KI-Zuordnung ${pct} % · ${ex.company_reason}` };
  }
  if (mailbox.default_company_id && (!ex.company_id || ex.company_id === mailbox.default_company_id)) {
    return {
      company_id: mailbox.default_company_id,
      status: "offen",
      note: `Zuordnung über das Postfach ${mailbox.address} · ${ex.company_reason}`,
    };
  }
  return {
    company_id: null,
    status: "pruefen",
    note: `Unsicher (${pct} %)${ex.company_id ? `, Vorschlag: ${ex.company_id}` : ""} · ${ex.company_reason}`,
  };
}

function validDate(s: string | null | undefined) {
  return s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export async function processMail(
  db: SupabaseClient,
  mailbox: Mailbox,
  companies: Company[],
  mail: IncomingMail,
): Promise<ProcessResult> {
  const result: ProcessResult = { skippedMail: false, created: 0, duplicates: 0, errors: [] };

  const { data: existing } = await db
    .from("emails")
    .select("id")
    .eq("mailbox_id", mailbox.id)
    .eq("provider_message_id", mail.providerMessageId)
    .maybeSingle();
  if (existing) return { ...result, skippedMail: true };

  const { data: email, error: emailErr } = await db
    .from("emails")
    .insert({
      mailbox_id: mailbox.id,
      provider_message_id: mail.providerMessageId,
      internet_message_id: mail.internetMessageId,
      from_address: mail.fromAddress,
      from_name: mail.fromName,
      subject: mail.subject,
      received_at: mail.receivedAt.toISOString(),
    })
    .select("id")
    .single();
  if (emailErr || !email) {
    if (emailErr?.code === "23505") return { ...result, skippedMail: true };
    throw new Error(`Mail konnte nicht gespeichert werden: ${emailErr?.message}`);
  }

  for (const group of groupAttachments(mail.attachments)) {
    const hash = sha256(group.primary.content);
    const { data: dup } = await db.from("documents").select("id").eq("content_hash", hash).maybeSingle();
    if (dup) {
      result.duplicates++;
      continue;
    }

    let ex: Extraction | null = null;
    let extractionError: string | null = null;
    try {
      ex = await extractDocument({
        companies,
        mailboxAddress: mailbox.address,
        mailboxCompanyId: mailbox.default_company_id,
        subject: mail.subject,
        fromAddress: mail.fromAddress,
        primaryFile: group.primary,
      });
    } catch (e) {
      extractionError = e instanceof Error ? e.message : String(e);
    }

    const decision = decide(ex, mailbox);
    const docId = randomUUID();
    const month = mail.receivedAt.toISOString().slice(0, 7).replace("-", "/");

    const uploaded: { filename: string; content_type: string; storage_path: string; size: number; sha256: string }[] = [];
    try {
      for (const f of group.files) {
        const path = `${month}/${docId}/${safeName(f.filename)}`;
        const { error } = await db.storage.from("belege").upload(path, f.content, {
          contentType: f.contentType,
          upsert: false,
        });
        if (error) throw new Error(`Upload fehlgeschlagen: ${error.message}`);
        uploaded.push({
          filename: f.filename,
          content_type: f.contentType,
          storage_path: path,
          size: f.content.length,
          sha256: sha256(f.content),
        });
      }

      let related: string | null = null;
      if (ex?.reference_number) {
        const { data: rel } = await db
          .from("documents")
          .select("id")
          .eq("invoice_number", ex.reference_number)
          .neq("doc_type", "mahnung")
          .limit(1)
          .maybeSingle();
        related = rel?.id ?? null;
      }

      const { error: docErr } = await db.from("documents").insert({
        id: docId,
        email_id: email.id,
        mailbox_id: mailbox.id,
        received_at: mail.receivedAt.toISOString(),
        company_id: decision.company_id,
        doc_type: ex?.doc_type ?? "rechnung",
        status: decision.status,
        supplier: ex?.supplier ?? mail.fromName ?? mail.fromAddress,
        invoice_number: ex?.invoice_number ?? null,
        invoice_date: validDate(ex?.invoice_date),
        due_date: validDate(ex?.due_date),
        net: ex?.net ?? null,
        vat: ex?.vat ?? null,
        gross: ex?.gross ?? null,
        currency: ex?.currency || "EUR",
        einvoice_format: group.format,
        confidence: ex?.company_confidence ?? null,
        ai_note: decision.note,
        reference_number: ex?.reference_number ?? null,
        related_document_id: related,
        content_hash: hash,
        extraction: ex,
        extraction_error: extractionError,
      });
      if (docErr) {
        if (docErr.code === "23505") {
          result.duplicates++;
          await db.storage.from("belege").remove(uploaded.map((u) => u.storage_path));
          continue;
        }
        throw new Error(`Beleg konnte nicht gespeichert werden: ${docErr.message}`);
      }

      const { error: filesErr } = await db
        .from("document_files")
        .insert(uploaded.map((u) => ({ ...u, document_id: docId })));
      if (filesErr) throw new Error(`Dateien konnten nicht verknüpft werden: ${filesErr.message}`);

      // Gemahnte Rechnung nachträglich verknüpfen, falls die Mahnung zuerst kam
      if (ex?.invoice_number && ex.doc_type !== "mahnung") {
        await db
          .from("documents")
          .update({ related_document_id: docId })
          .eq("doc_type", "mahnung")
          .eq("reference_number", ex.invoice_number)
          .is("related_document_id", null);
      }
      result.created++;
    } catch (e) {
      if (uploaded.length) await db.storage.from("belege").remove(uploaded.map((u) => u.storage_path));
      result.errors.push(`${group.primary.filename}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Nichts gespeichert, aber Fehler: Mail wieder freigeben, damit der
  // nächste Lauf sie erneut versucht (der Sync bleibt an dieser Stelle stehen).
  if (result.errors.length > 0 && result.created === 0) {
    await db.from("emails").delete().eq("id", email.id);
    throw new Error(result.errors.join(" | "));
  }
  return result;
}
