"use client";

import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { getFirebaseAuth } from "@/lib/firebase/client";

type Session =
  | { status: "loading" | "error" }
  | { status: "ready"; user: User | null };

const SessionContext = createContext<Session>({ status: "loading" });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session>({ status: "loading" });

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    function reportError() {
      if (active) setSession({ status: "error" });
    }

    try {
      unsubscribe = onAuthStateChanged(
        getFirebaseAuth(),
        (user) => setSession({ status: "ready", user }),
        reportError,
      );
    } catch {
      queueMicrotask(reportError);
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function SessionStatus({ error = false }: { error?: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      {error ? (
        <div>
          <p role="alert">Impossible de vérifier ta session. Réessaie dans un instant.</p>
          <button type="button" className="button-secondary mt-4" onClick={() => window.location.reload()}>
            Recharger la page
          </button>
        </div>
      ) : (
        <p role="status" className="text-slate-600">Chargement de ta session…</p>
      )}
    </main>
  );
}

export function SessionGate({ access, children }: {
  access: "private" | "guest" | "redirect";
  children?: ReactNode;
}) {
  const router = useRouter();
  const session = useSession();

  let destination: "/login" | "/dashboard" | null = null;
  if (session.status === "ready") {
    if (access === "redirect") destination = session.user ? "/dashboard" : "/login";
    if (access === "guest" && session.user) destination = "/dashboard";
    if (access === "private" && !session.user) destination = "/login";
  }

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  if (session.status !== "ready" || destination) {
    return <SessionStatus error={session.status === "error"} />;
  }

  return children;
}
