import "server-only";
import { env } from "@/lib/env";
import { isRelevantAttachment, type IncomingMail, type Mailbox } from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const body = new URLSearchParams({
    client_id: env.msClientId(),
    client_secret: env.msClientSecret(),
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(`https://login.microsoftonline.com/${env.msTenantId()}/oauth2/v2.0/token`, {
    method: "POST",
    body,
  });
  if (!res.ok) throw new Error(`Microsoft-Anmeldung fehlgeschlagen (${res.status}): ${await res.text()}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

async function graphGet<T>(url: string): Promise<T> {
  const token = await getToken();
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url.startsWith("http") ? url : `${GRAPH}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 429 || res.status === 503) {
      const wait = Number(res.headers.get("Retry-After") || "5");
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return (await res.json()) as T;
  }
  throw new Error("Graph: zu viele Anfragen, später erneut versuchen");
}

async function graphGetBytes(url: string): Promise<Buffer> {
  const token = await getToken();
  const res = await fetch(`${GRAPH}${url}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Graph ${res.status} beim Laden eines Anhangs`);
  return Buffer.from(await res.arrayBuffer());
}

type GraphMessage = {
  id: string;
  internetMessageId?: string;
  subject?: string;
  receivedDateTime: string;
  from?: { emailAddress?: { address?: string; name?: string } };
};

type GraphAttachment = {
  "@odata.type": string;
  id: string;
  name: string;
  contentType: string;
  size: number;
  isInline?: boolean;
  contentBytes?: string;
};

/**
 * Holt alle Mails mit Anhängen, die nach `since` eingegangen sind,
 * älteste zuerst, höchstens `limit` Stück pro Lauf.
 */
export async function fetchGraphMails(mailbox: Mailbox, since: Date, limit: number): Promise<IncomingMail[]> {
  const user = encodeURIComponent(mailbox.address);
  const folder = encodeURIComponent(mailbox.folder || "inbox");
  const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()} and hasAttachments eq true`);
  let url: string | undefined =
    `/users/${user}/mailFolders/${folder}/messages?$filter=${filter}&$orderby=receivedDateTime asc` +
    `&$select=id,internetMessageId,subject,receivedDateTime,from&$top=25`;

  const out: IncomingMail[] = [];
  while (url && out.length < limit) {
    const page: { value: GraphMessage[]; "@odata.nextLink"?: string } = await graphGet(url);
    for (const m of page.value) {
      if (out.length >= limit) break;
      const atts = await graphGet<{ value: GraphAttachment[] }>(
        `/users/${user}/messages/${encodeURIComponent(m.id)}/attachments?$select=id,name,contentType,size,isInline`,
      );
      const attachments = [];
      for (const a of atts.value) {
        if (a["@odata.type"] !== "#microsoft.graph.fileAttachment") continue;
        if (!isRelevantAttachment(a.name, a.contentType)) continue;
        const content = await graphGetBytes(
          `/users/${user}/messages/${encodeURIComponent(m.id)}/attachments/${encodeURIComponent(a.id)}/$value`,
        );
        attachments.push({ filename: a.name, contentType: a.contentType || "application/octet-stream", content });
      }
      out.push({
        providerMessageId: m.id,
        internetMessageId: m.internetMessageId ?? null,
        fromAddress: m.from?.emailAddress?.address ?? null,
        fromName: m.from?.emailAddress?.name ?? null,
        subject: m.subject ?? null,
        receivedAt: new Date(m.receivedDateTime),
        attachments,
      });
    }
    url = page["@odata.nextLink"];
  }
  return out;
}
