import type { Metadata } from "next";
import type { ReactNode } from "react";

import { SessionProvider } from "@/components/session";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "FreelanceDesk", template: "%s · FreelanceDesk" },
  description: "L’espace de travail des freelances.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="flex min-h-dvh flex-col">
        <SessionProvider>{children}</SessionProvider>
        <footer className="shrink-0 border-t border-slate-200 bg-white px-4 py-3 text-center text-sm text-slate-600">
          FreelanceDesk — v1.1
        </footer>
      </body>
    </html>
  );
}
