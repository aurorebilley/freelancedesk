"use client";

import type { User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { todayInParis } from "@/lib/domain/format";
import type { SharePermission } from "@/lib/domain/client-sharing";
import type { Client, Collection, Invoice, Project, RecordByCollection } from "@/lib/domain/model";
import { subscribeToRecords } from "@/lib/firebase/data";
import { subscribeToSharedRecords, type SharedRecords } from "@/lib/firebase/shares";

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
  personal: Pick<WorkspaceValue, "clients" | "projects" | "invoices">;
  access: (record: Client | Project | Invoice) => SharePermission | "owner" | undefined;
  ownerEmail: (clientId: string) => string | undefined;
  sharedLoading: boolean;
  today: string;
  notify: (message: string) => void;
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ user, children }: { user: User; children: ReactNode }) {
  const clients = useRecords("clients", user.uid);
  const projects = useRecords("projects", user.uid);
  const invoices = useRecords("invoices", user.uid);
  const [shared, setShared] = useState<SharedRecords>();
  const [shareFailed, setShareFailed] = useState(false);
  const [shareAttempt, setShareAttempt] = useState(0);
  useEffect(() => {
    const fail = () => setShareFailed(true);
    const timeout = window.setTimeout(fail, 15_000);
    let stop: (() => void) | undefined;
    try {
      stop = subscribeToSharedRecords(user.uid, data => {
        if (!data.loading) window.clearTimeout(timeout);
        setShared(data);
      }, fail);
    } catch {
      window.clearTimeout(timeout);
      queueMicrotask(fail);
    }
    return () => {
      window.clearTimeout(timeout);
      stop?.();
    };
  }, [user.uid, shareAttempt]);
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

  const personal = { clients: clients.data, projects: projects.data, invoices: invoices.data };
  const allProjects = [...personal.projects, ...(shared?.projects ?? [])];
  const projectById = new Map(allProjects.map(project => [project.id, project]));
  const value: WorkspaceValue = {
    user, personal, today, notify: setNotice,
    clients: [...personal.clients, ...(shared?.clients ?? [])],
    projects: allProjects,
    invoices: [...personal.invoices, ...(shared?.invoices ?? [])],
    sharedLoading: !shareFailed && (!shared || shared.loading),
    ownerEmail: id => shared?.shares.get(id)?.ownerEmail,
    access(record) {
      if (record.userId === user.uid) return "owner";
      const clientId = "name" in record ? record.id :
        "client_id" in record ? record.client_id : projectById.get(record.project_id)?.client_id;
      const share = clientId && shared?.shares.get(clientId);
      return share && share.ownerId === record.userId ? share.permission : undefined;
    },
  };
  return (
    <WorkspaceContext.Provider value={value}>
      {notice && (
        <div className="notice-success mb-5 flex flex-wrap items-center justify-between gap-3">
          <p role="status">{notice}</p>
          <button type="button" className="font-semibold underline" onClick={() => setNotice("")}>Fermer le message</button>
        </div>
      )}
      {shareFailed && (
        <div className="notice-error mb-5 flex flex-wrap items-center justify-between gap-3">
          <p role="alert">Impossible de charger tous les accès partagés.</p>
          <button className="font-semibold underline" type="button" onClick={() => {
            setShared(undefined);
            setShareFailed(false);
            setShareAttempt(attempt => attempt + 1);
          }}>Réessayer</button>
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
