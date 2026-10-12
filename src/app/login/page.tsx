import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden · Rechnungseingang" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  const { fehler } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-white p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">FFH-Gruppe · Buchhaltung</p>
        <h1 className="mt-1 text-2xl font-bold">Rechnungseingang</h1>
        <p className="mt-2 text-sm text-muted">
          Gib deine E-Mail-Adresse ein. Du bekommst einen Anmeldelink, der 1 Stunde gültig ist.
        </p>
        {fehler && (
          <p className="mt-4 rounded-lg bg-review-bg px-3 py-2 text-sm text-review-fg">
            Der Link war ungültig oder abgelaufen. Bitte neu anfordern und im selben Browser öffnen.
          </p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
