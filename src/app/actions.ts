"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { runSync } from "@/lib/ingest/sync";

const ID = /^[0-9a-f-]{36}$/;

async function log(documentId: string, userEmail: string, action: string, details?: object) {
  const db = createAdminClient();
  await db.from("audit_log").insert({ document_id: documentId, user_email: userEmail, action, details: details ?? null });
}

export async function setStatus(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!ID.test(id) || !["offen", "gebucht", "ignoriert"].includes(status)) return;

  const db = createAdminClient();
  const { data: doc } = await db.from("documents").select("company_id").eq("id", id).single();
  if (status !== "ignoriert" && !doc?.company_id) return; // erst zuordnen

  await db
    .from("documents")
    .update({
      status,
      booked_at: status === "gebucht" ? new Date().toISOString() : null,
      booked_by: status === "gebucht" ? user.email : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  await log(id, user.email, `Status: ${status}`);
  revalidatePath("/");
}

export async function assignCompany(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  const companyId = String(formData.get("company_id") ?? "");
  if (!ID.test(id) || !companyId) return;

  const db = createAdminClient();
  const { data: co } = await db.from("companies").select("id, name").eq("id", companyId).maybeSingle();
  if (!co) return;
  const { data: doc } = await db.from("documents").select("status").eq("id", id).single();

  await db
    .from("documents")
    .update({
      company_id: co.id,
      status: doc?.status === "pruefen" || doc?.status === "ignoriert" ? "offen" : doc?.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  await log(id, user.email, `Zugeordnet: ${co.name}`);
  revalidatePath("/");
}

export async function syncNow() {
  await requireUser();
  await runSync({ deadline: Date.now() + 50_000 });
  revalidatePath("/");
}
