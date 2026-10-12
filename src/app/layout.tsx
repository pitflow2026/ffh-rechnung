import type { Metadata } from "next";
// Schriften lokal eingebunden (kein Abruf bei Google zur Build- oder Laufzeit)
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Rechnungseingang · FFH-Gruppe",
  description: "Eingangsrechnungen aller FFH-Unternehmen an einem Ort",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" className="h-full antialiased">
      <body className="min-h-full font-sans text-sm">{children}</body>
    </html>
  );
}
