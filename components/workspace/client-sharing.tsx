"use client";

import { Share2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

import { sharePermissions, type SharePermission } from "@/lib/domain/client-sharing";
import type { Client } from "@/lib/domain/model";
import { requestMutation } from "@/lib/firebase/data";
import { subscribeToManagedShares, type ShareRecord } from "@/lib/firebase/shares";
import { useWorkspace } from "./context";
import { Modal } from "./modal";

type Operation = { kind: "create" } | { kind: "change" | "revoke"; share: ShareRecord };

const descriptions = {
  read: "Permet de consulter le client, ses projets et ses factures.",
  edit: "Permet aussi de créer et de modifier les factures de ce client.",
};

const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "Europe/Paris" });

export function AccessBadge({ access }: { access: SharePermission | "owner" }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs font-semibold ${access === "owner" ?
    "bg-slate-100 text-slate-700" : "bg-indigo-50 text-indigo-800"}`}>
    {access === "owner" ? "Propriétaire" : sharePermissions[access]}
  </span>;
}

export function ShareButton({ client, iconOnly = false }: { client: Client; iconOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  return <>
    <button className={iconOnly ? "icon-button" : "button-secondary"} type="button" title="Partager"
      aria-label={`Partager ${client.name}`} onClick={() => setOpen(true)}>
      <Share2 size={16} aria-hidden="true" />{!iconOnly && "Partager"}
    </button>
    {open && <ShareDialog client={client} operation={{ kind: "create" }} onClose={() => setOpen(false)} />}
  </>;
}

function ShareDialog({ client, operation, onClose }: {
  client: Client; operation: Operation; onClose: () => void;
}) {
  const { user, notify } = useWorkspace();
  const [permission, setPermission] = useState<SharePermission>(operation.kind === "create" ? "read" : operation.share.permission);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const emailId = useId();
  const permissionId = useId();
  const helpId = useId();
  const title = {
    create: "Partager le client", change: "Modifier le niveau d’accès", revoke: "Révoquer l’accès",
  }[operation.kind];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = new FormData(event.currentTarget);
    busy.current = true;
    setPending(true);
    setError("");
    const path = `clients/${encodeURIComponent(client.id)}/shares`;
    try {
      if (operation.kind === "create") {
        await requestMutation(user, path, "POST", { email: form.get("email"), permission });
        notify("Le client a bien été partagé.");
      } else {
        const target = path + "/" + encodeURIComponent(operation.share.sharedUserId);
        if (operation.kind === "change") {
          await requestMutation(user, target, "PATCH", { permission });
          notify("Le niveau d’accès a bien été modifié.");
        } else {
          await requestMutation(user, target, "DELETE");
          notify("L’accès a bien été révoqué.");
        }
      }
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Impossible de mettre à jour le partage.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <Modal title={title} locked={pending} onClose={onClose}>
    <form onSubmit={submit} aria-busy={pending} className="space-y-4">
      {operation.kind === "create" && <div>
        <label className="field-label" htmlFor={emailId}>Adresse e-mail de l’associé</label>
        <input id={emailId} name="email" type="email" inputMode="email" className="field" required
          maxLength={254} autoComplete="off" autoCapitalize="none" disabled={pending} />
      </div>}
      {operation.kind === "revoke" ? (
        <p>Retirer l’accès de <strong className="wrap-break-word">{operation.share.sharedUserEmail}</strong> au client <strong>{client.name}</strong>, à ses projets et à ses factures ?</p>
      ) : (
        <div>
          <label className="field-label" htmlFor={permissionId}>Niveau d’accès</label>
          <select id={permissionId} className="field" value={permission} disabled={pending} aria-describedby={helpId}
            onChange={event => setPermission(event.target.value as SharePermission)}>
            {Object.entries(sharePermissions).map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
          <p id={helpId} className="mt-1.5 text-sm text-slate-700">{descriptions[permission]}</p>
        </div>
      )}
      {operation.kind === "create" && <p className="text-sm text-slate-600">Ton adresse e-mail sera visible par cet associé sur le client partagé.</p>}
      {error && <p className="notice-error" role="alert">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button className="button-secondary" type="button" disabled={pending} onClick={onClose}>Annuler</button>
        <button className={operation.kind === "revoke" ? "button-danger" : "button-primary"} type="submit"
          disabled={pending || (operation.kind === "change" && permission === operation.share.permission)}>
          {pending ? "En cours…" : operation.kind === "create" ? "Partager" : operation.kind === "change" ? "Enregistrer" : "Révoquer"}
        </button>
      </div>
    </form>
  </Modal>;
}

export function ClientAccess({ client }: { client: Client }) {
  const [shares, setShares] = useState<ShareRecord[]>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [operation, setOperation] = useState<Operation>();
  const titleId = useId();

  useEffect(() => {
    const fail = () => setFailed(true);
    const timeout = window.setTimeout(fail, 15_000);
    const stop = subscribeToManagedShares(client.id, records => {
      window.clearTimeout(timeout);
      setFailed(false);
      setShares(records);
    }, fail);
    return () => { window.clearTimeout(timeout); stop(); };
  }, [client.id, attempt]);

  return <section className="panel mt-6" aria-labelledby={titleId}>
    <h2 className="text-xl font-bold" id={titleId}>Gestion des accès</h2>
    {failed ? <div className="mt-3">
      <p role="alert">Impossible de charger les accès.</p>
      <button type="button" className="text-action mt-2" onClick={() => {
        setFailed(false);
        setShares(undefined);
        setAttempt(value => value + 1);
      }}>Réessayer</button>
    </div> : !shares ? <p className="mt-3 text-slate-600" role="status">Chargement des accès…</p>
      : !shares.length ? <p className="mt-3 text-slate-600">Ce client est privé.</p>
      : <ul className="mt-3 divide-y divide-slate-200">
        {shares.map(share => <li key={share.sharedUserId} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="wrap-anywhere">{share.sharedUserEmail}</strong>
              <AccessBadge access={share.permission} />
            </div>
            {share.createdAt && <p className="mt-1 text-sm text-slate-600">Partagé le {date.format(share.createdAt.toDate())}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="button-secondary" onClick={() => setOperation({ kind: "change", share })}
              aria-label={`Modifier l’accès de ${share.sharedUserEmail}`}>Modifier l’accès</button>
            <button type="button" className="button-secondary text-red-700!" onClick={() => setOperation({ kind: "revoke", share })}
              aria-label={`Révoquer l’accès de ${share.sharedUserEmail}`}>Révoquer</button>
          </div>
        </li>)}
      </ul>}
    {operation && <ShareDialog client={client} operation={operation} onClose={() => setOperation(undefined)} />}
  </section>;
}
