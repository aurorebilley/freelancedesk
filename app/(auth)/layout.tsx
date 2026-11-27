import { FolderKanban, ReceiptText, UsersRound } from "lucide-react";
import type { ReactNode } from "react";

import { Brand } from "@/components/brand";
import { SessionGate } from "@/components/session";

const sections = [
  { title: "Clients", icon: UsersRound },
  { title: "Projets", icon: FolderKanban },
  { title: "Factures", icon: ReceiptText },
];

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <SessionGate access="guest">
      <main className="mx-auto grid min-h-dvh max-w-[1600px] lg:grid-cols-[minmax(0,1fr)_minmax(0,0.94fr)]">
        <section className="flex min-h-dvh flex-col px-6 py-7 sm:px-12 lg:px-16 lg:py-10">
          <header className="w-fit"><Brand /></header>
          <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-12">
            {children}
          </div>
        </section>

        <aside className="auth-panel m-5 hidden min-w-0 items-center justify-center overflow-hidden rounded-[32px] px-12 text-white lg:flex xl:px-20">
          <div className="relative max-w-[450px]">
            <p className="text-4xl leading-[1.12] font-semibold tracking-[-0.055em] xl:text-6xl">
              Ton activité freelance, au même endroit.
            </p>
            <ul className="mt-10 flex flex-wrap gap-3 text-sm font-medium">
              {sections.map(({ title, icon: Icon }) => (
                <li key={title} className="flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2.5">
                  <Icon size={17} aria-hidden="true" />
                  {title}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </SessionGate>
  );
}
