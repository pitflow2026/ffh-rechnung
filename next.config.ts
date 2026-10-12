import type { NextConfig } from "next";

// Internes Werkzeug: jede Ansicht ist nutzerbezogen und tagesaktuell,
// deshalb ohne Cache Components – alles wird pro Anfrage gerendert.
const nextConfig: NextConfig = {
  serverExternalPackages: ["imapflow", "mailparser"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
