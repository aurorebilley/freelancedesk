"use client";

import type { User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { todayInParis } from "@/lib/domain/format";
import type { Collection, RecordByCollection } from "@/lib/domain/model";
import { subscribeToRecords } from "@/lib/firebase/data";

type Records<K extends Collection> = { data: RecordByCollection[K][] | null; failed: boolean };

function useRecords<K extends Collection>(name: K, userId: string) {
  const [attempt, setAttempt] = useState(0);
  const [records, setRecords] = useState<Records<K>>({ data: null, failed: false });

  useEffect(() => {
    let listening = true;
    const fail = () => {
      if (listening) setRecords({ data: null, failed: true });
    };
    const start = window.setTimeout(fail, 15_000);
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToRecords(name, userId, data => {
        window.clearTimeout(start);
        if (listening) setRecords({ data, failed: false });
      }, fail);
    } catch {
      queueMicrotask(fail);
    }
    return () => {
      listening = false;
      window.clearTimeout(start);
      unsubscribe?.();
    };
  }, [name, userId, attempt]);

  function retry() {
    setRecords({ data: null, failed: false });
    setAttempt(value => value + 1);
  }

  return { ...records, retry };
}

function useToday() {
  const [today, setToday] = useState(todayInParis);
  useEffect(() => {
    const update = () => setToday(todayInParis());
    const timer = window.setInterval(update, 30_000);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return today;
}

interface WorkspaceValue {
  user: User;
  clients: RecordByCollection["clients"][];
  projects: RecordByCollection["projects"][];
  invoices: RecordByCollection["invoices"][];
  today: string;
  notify: (message: string) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ user, children }: { user: User; children: ReactNode }) {
  const clients = useRecords("clients", user.uid);
  const projects = useRecords("projects", user.uid);
  const invoices = useRecords("invoices", user.uid);
  const today = useToday();
  const [notice, setNotice] = useState("");

  if (clients.failed || projects.failed || invoices.failed) {
    return (
      <main className="panel">
        <p role="alert">Impossible de charger tes données. Vérifie ta connexion, puis réessaie.</p>
        <button className="button-secondary mt-4" type="button" onClick={() => {
          clients.retry();
          projects.retry();
          invoices.retry();
        }}>Réessayer</button>
      </main>
    );
  }

  if (!clients.data || !projects.data || !invoices.data) {
    return <main className="panel" role="status">Chargement de tes données…</main>;
  }

  const value = { user, clients: clients.data, projects: projects.data, invoices: invoices.data, today, notify: setNotice };
  return (
    <WorkspaceContext.Provider value={value}>
      {notice && (
        <div className="notice-success mb-5 flex flex-wrap items-center justify-between gap-3">
          <p role="status">{notice}</p>
          <button type="button" className="font-semibold underline" onClick={() => setNotice("")}>Fermer le message</button>
        </div>
      )}
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Contexte de l’espace de travail manquant.");
  return value;
}
