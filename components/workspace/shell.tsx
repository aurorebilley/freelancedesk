"use client";

import { signOut } from "firebase/auth";
import { FolderKanban, LayoutDashboard, LogOut, ReceiptText, UsersRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState, type ReactNode } from "react";

import { Brand } from "@/components/brand";
import { useSession } from "@/components/session";
import { authErrorMessage } from "@/lib/firebase/auth-errors";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { WorkspaceProvider } from "./context";

const navigation = [
  { href: "/dashboard", title: "Tableau de bord", icon: LayoutDashboard },
  { href: "/clients", title: "Clients", icon: UsersRound },
  { href: "/projects", title: "Projets", icon: FolderKanban },
  { href: "/invoices", title: "Factures", icon: ReceiptText },
];

export function WorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const session = useSession();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const signingOut = useRef(false);

  if (session.status !== "ready" || !session.user) return null;
  const { user } = session;
  const identity = user.displayName || user.email || "Compte FreelanceDesk";

  async function handleSignOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    setPending(true);
    setNotice("");
    try {
      await signOut(getFirebaseAuth());
    } catch (error) {
      setNotice(authErrorMessage(error, "Impossible de te déconnecter pour le moment."));
    } finally {
      signingOut.current = false;
      setPending(false);
    }
  }

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a href="#workspace" className="sr-only focus:not-sr-only focus:absolute focus:z-10 focus:bg-white focus:p-3">
        Aller au contenu
      </a>
      <aside className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 lg:sticky lg:top-0 lg:h-dvh lg:gap-8 lg:border-r lg:border-b-0 lg:p-5">
        <div className="flex items-center justify-between gap-2">
          <Link href="/dashboard" className="shrink-0 rounded-lg"><Brand /></Link>
          <button type="button" onClick={handleSignOut} disabled={pending}
            className="button-secondary lg:hidden" aria-label="Se déconnecter">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
        <nav className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-1" aria-label="Navigation principale">
          {navigation.map(({ href, title, icon: Icon }) => {
            const selected = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link key={href} href={href} aria-current={selected ? "page" : undefined}
                className={`flex min-h-11 items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-semibold ${selected ? "bg-indigo-50 text-indigo-800" : "text-slate-700 hover:bg-slate-100"}`}>
                <Icon size={17} aria-hidden="true" className="shrink-0" />
                {title}
              </Link>
            );
          })}
        </nav>
        <div className="flex min-w-0 flex-col gap-2 lg:mt-auto lg:border-t lg:border-slate-200 lg:pt-4">
          <p className="truncate text-sm text-slate-700" title={identity}>{identity}</p>
          <button type="button" onClick={handleSignOut} disabled={pending} className="button-secondary hidden lg:inline-flex">
            <LogOut size={17} aria-hidden="true" />
            {pending ? "Déconnexion…" : "Se déconnecter"}
          </button>
          {notice && <p className="notice-error" role="alert">{notice}</p>}
        </div>
      </aside>
      <div id="workspace" tabIndex={-1} className="mx-auto w-full max-w-[90rem] px-4 py-7 sm:px-7 lg:px-10 lg:py-10">
        <WorkspaceProvider key={user.uid} user={user}>{children}</WorkspaceProvider>
      </div>
    </div>
  );
}
