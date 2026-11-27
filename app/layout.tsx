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
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
