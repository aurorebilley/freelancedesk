"use client";

import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { formatDate, formatMoney, knownPaymentDate, overdueDays } from "@/lib/domain/format";
import {
  invoiceStatuses, notFoundMessage, projectStatuses,
  type Client, type Collection, type Invoice, type InvoiceStatus, type Project,
} from "@/lib/domain/model";
import { validate } from "@/lib/domain/validation";
import { mutate } from "@/lib/firebase/data";
import { AccessBadge, ShareButton } from "./client-sharing";
import { useWorkspace } from "./context";
import { Modal } from "./modal";

type Entity = Client | Project | Invoice;
type EditorState = { collection: Collection; record?: Entity; parent?: string };
type Interaction = { edit: EditorState } | { remove: { collection: Collection; record: Entity; redirect?: string } };

export const resources = {
  clients: { title: "Clients", one: "client", add: "Ajouter un client", saved: "Le client a bien été modifié.", created: "Le client a bien été ajouté.", deleted: "Le client a bien été supprimé." },
  projects: { title: "Projets", one: "projet", add: "Créer un projet", saved: "Le projet a bien été modifié.", created: "Le projet a bien été créé.", deleted: "Le projet a bien été supprimé." },
  invoices: { title: "Factures", one: "facture", add: "Créer une facture", saved: "La facture a bien été modifiée.", created: "La facture a bien été créée.", deleted: "La facture a bien été supprimée." },
} as const;

function entityName(record: Entity) {
  if ("name" in record) return record.name;
  if ("title" in record) return record.title;
  return record.number;
}

export function Badge({ status, collection }: { status: Project["status"] | Invoice["status"]; collection: "projects" | "invoices" }) {
  const labels = collection === "projects" ? projectStatuses : invoiceStatuses;
  const color = {
    active: "bg-indigo-50 text-indigo-800",
    sent: "bg-blue-50 text-blue-800",
    paid: "bg-emerald-50 text-emerald-800",
    done: "bg-emerald-50 text-emerald-800",
    prospect: "bg-amber-50 text-amber-900",
    draft: "bg-slate-100 text-slate-700",
    cancelled: "bg-slate-100 text-slate-700",
  }[status];
  return <span className={`badge ${color}`}>{(labels as Record<string, string>)[status]}</span>;
}

export function LateBadge({ days }: { days: number }) {
  if (!days) return null;
  return <span className="badge bg-red-50 text-red-800">En retard · {days} j</span>;
}

export function Heading({ title, caption, children }: { title: string; caption?: string; children?: ReactNode }) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="wrap-break-word text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {caption && <p className="mt-2 text-slate-600">{caption}</p>}
      </div>
      {children}
    </header>
  );
}

export function AddButton({ collection, onClick }: { collection: Collection; onClick: () => void }) {
  return (
    <button className="button-primary" type="button" onClick={onClick}>
      <Plus size={17} aria-hidden="true" /> {resources[collection].add}
    </button>
  );
}

export function useInteraction() {
  return useState<Interaction | null>(null);
}

function Field({ label, name, children }: { label: string; name: string; children: ReactNode }) {
  return <div className="min-w-0"><label className="field-label" htmlFor={name}>{label}</label>{children}</div>;
}

function EditorFields({ collection, record, parent }: EditorState) {
  const { clients, personal, projects, access, today } = useWorkspace();
  const invoice = record && "number" in record ? record : undefined;
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>(invoice?.status ?? "draft");

  if (collection === "clients") {
    const client = record && "name" in record ? record : undefined;
    return (
      <>
        <Field label="Nom du client" name="name"><input className="field" name="name" id="name" autoComplete="organization" required maxLength={160} defaultValue={client?.name} /></Field>
        <Field label="Adresse e-mail · facultatif" name="email"><input className="field" name="email" id="email" type="email" maxLength={254} defaultValue={client?.email} /></Field>
        <Field label="Ville · facultatif" name="city"><input className="field" name="city" id="city" maxLength={160} defaultValue={client?.city} /></Field>
      </>
    );
  }

  if (collection === "projects") {
    const project = record && "title" in record ? record : undefined;
    return (
      <>
        <Field label="Titre du projet" name="title"><input className="field" name="title" id="title" required maxLength={160} defaultValue={project?.title} /></Field>
        <Field label="Client" name="client_id">
          <select className="field" name="client_id" id="client_id" required defaultValue={project?.client_id ?? parent ?? ""}>
            <option value="">Choisir un client</option>
            {personal.clients.map(client => <option value={client.id} key={client.id}>{client.name}</option>)}
          </select>
        </Field>
        <Field label="Statut" name="status">
          <select className="field" name="status" id="status" defaultValue={project?.status ?? "prospect"}>
            {Object.entries(projectStatuses).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
          </select>
        </Field>
        <Field label="Tarif journalier (€)" name="daily_rate">
          <input className="field" name="daily_rate" id="daily_rate" type="number" inputMode="decimal" required min="0" step="any" defaultValue={project?.daily_rate} />
        </Field>
        <Field label="Date de début" name="start_date"><input className="field" name="start_date" id="start_date" type="date" required defaultValue={project?.start_date ?? today} /></Field>
      </>
    );
  }

  const fromProject = invoice && projects.find(project => project.id === invoice.project_id);
  const available = projects.filter(project => {
    if (!invoice) return access(project) === "owner" || access(project) === "edit";
    return project.userId === invoice.userId && (access(invoice) === "owner" ||
      (access(project) === "edit" && project.client_id === fromProject?.client_id));
  });
  const paidOn = invoice && knownPaymentDate(invoice);
  return (
    <>
      <Field label="Numéro de facture" name="number"><input className="field" name="number" id="number" required maxLength={160} defaultValue={invoice?.number} /></Field>
      <Field label="Projet" name="project_id">
        <select className="field" name="project_id" id="project_id" required defaultValue={invoice?.project_id ?? parent ?? ""}>
          <option value="">Choisir un projet</option>
          {available.map(project => <option value={project.id} key={project.id}>
            {project.title}{access(project) === "edit" && ` · ${clients.find(client => client.id === project.client_id)?.name ?? "Client partagé"}`}
          </option>)}
        </select>
      </Field>
      <Field label="Montant (€)" name="amount">
        <input className="field" name="amount" id="amount" type="number" inputMode="decimal" required min="0" step="any" defaultValue={invoice?.amount} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date d’émission" name="issued_on"><input className="field" name="issued_on" id="issued_on" type="date" required defaultValue={invoice?.issued_on ?? today} /></Field>
        <Field label="Date d’échéance" name="due_on"><input className="field" name="due_on" id="due_on" type="date" required defaultValue={invoice?.due_on ?? today} /></Field>
      </div>
      <Field label="Statut" name="status">
        <select className="field" name="status" id="status" value={invoiceStatus}
          onChange={event => setInvoiceStatus(event.target.value as InvoiceStatus)}>
          {Object.entries(invoiceStatuses).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select>
      </Field>
      {invoiceStatus === "paid" && (
        <Field label="Date de paiement" name="paid_on">
          <input className="field" name="paid_on" id="paid_on" type="date" defaultValue={paidOn} aria-describedby="paid-on-help" />
          <p className="mt-1.5 text-sm text-slate-600" id="paid-on-help">
            {paidOn ? "Corrige la date si nécessaire."
              : invoice?.status === "paid" ? "Renseigne la date réelle si tu la connais."
                : "Si tu laisses le champ vide, la date du jour à Paris sera enregistrée."}
          </p>
        </Field>
      )}
    </>
  );
}

function entryPayload(form: HTMLFormElement, collection: Collection, record?: Entity) {
  const data: Record<string, unknown> = Object.fromEntries(new FormData(form));
  if (collection === "projects") data.daily_rate = Number(data.daily_rate);
  if (collection === "invoices") {
    data.amount = Number(data.amount);
    if (record && "number" in record && data.paid_on === record.paid_on) delete data.paid_on;
  }
  return validate(collection, data);
}

export function ResourceDialog({ interaction, onClose }: { interaction: Interaction; onClose: () => void }) {
  const workspace = useWorkspace();
  const action = "remove" in interaction ? interaction.remove : interaction.edit;
  const record = action.record && workspace[action.collection].find(item => item.id === action.record?.id);
  const permission = record && workspace.access(record);
  if (action.record && permission !== "owner" &&
      !("edit" in interaction && action.collection === "invoices" && permission === "edit")) return null;
  if ("edit" in interaction && interaction.edit.parent && !action.record) {
    const parent = action.collection === "projects"
      ? workspace.clients.find(client => client.id === interaction.edit.parent)
      : workspace.projects.find(project => project.id === interaction.edit.parent);
    const parentAccess = parent && workspace.access(parent);
    if (parentAccess !== "owner" && !(action.collection === "invoices" && parentAccess === "edit")) return null;
  }
  return <ResourceDialogContent interaction={interaction} onClose={onClose} />;
}

function ResourceDialogContent({ interaction, onClose }: { interaction: Interaction; onClose: () => void }) {
  const { user, personal, projects, access, notify } = useWorkspace();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const editing = "edit" in interaction ? interaction.edit : undefined;
  const removing = "remove" in interaction ? interaction.remove : undefined;
  const collection = (editing ?? removing)!.collection;
  const resource = resources[collection];
  const missingParent = editing && !editing.record && (
    (collection === "projects" && personal.clients.length === 0) ||
    (collection === "invoices" && !projects.some(project => access(project) === "owner" || access(project) === "edit"))
  );
  const title = removing
    ? "Confirmer la suppression"
    : editing?.record ? (collection === "invoices" ? "Modifier la facture" : "Modifier le " + resource.one) : resource.add;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const form = event.currentTarget;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      if (removing) {
        await mutate(user, collection, "DELETE", removing.record.id);
        if (removing.redirect) router.replace(removing.redirect);
        notify(resource.deleted);
      } else if (editing) {
        const payload = entryPayload(form, collection, editing.record);
        await mutate(user, collection, editing.record ? "PUT" : "POST", editing.record?.id, payload);
        notify(editing.record ? resource.saved : resource.created);
      }
      onClose();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Impossible de terminer l’opération.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Modal title={title} onClose={onClose} locked={pending}>
      {missingParent ? (
        <div className="space-y-4">
          <p>{collection === "projects" ? "Ajoute un client avant de créer un projet." : "Crée un projet avant de créer une facture."}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button className="button-secondary" type="button" onClick={onClose}>Fermer</button>
            <Link className="button-primary" href={collection === "projects" ? "/clients" : "/projects"} onClick={onClose}>
              {collection === "projects" ? "Voir les clients" : "Voir les projets"}
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} aria-busy={pending}>
          {removing && <p>Supprimer <strong className="wrap-break-word">{entityName(removing.record)}</strong> ? Cette action est définitive.</p>}
          {editing && (
            <fieldset className="grid gap-4" disabled={pending} aria-label={title}>
              <EditorFields {...editing} />
            </fieldset>
          )}
          {error && <p role="alert" className="notice-error mt-4">{error}</p>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button className="button-secondary" onClick={onClose} disabled={pending} type="button">Annuler</button>
            <button className={removing ? "button-danger" : "button-primary"} disabled={pending} type="submit">
              {pending ? "En cours…" : removing ? "Supprimer" : "Enregistrer"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ResourceTable({ collection, records, empty, onAction }: {
  collection: Collection;
  records: Entity[];
  empty: string;
  onAction: (action: Interaction) => void;
}) {
  const { clients, projects, today, access, ownerEmail } = useWorkspace();
  if (!records.length) {
    return collection === "clients" ? <p className="text-sm text-slate-600 sm:text-base">{empty}</p> :
      <div className="panel text-slate-600">{empty}</div>;
  }

  const clientNames = new Map(clients.map(client => [client.id, client.name]));
  const projectById = new Map(projects.map(project => [project.id, project]));
  const columns = {
    clients: ["Nom", "Adresse e-mail", "Ville"],
    projects: ["Projet", "Client", "Statut", "Tarif journalier", "Date de début"],
    invoices: ["Numéro", "Client", "Projet", "Montant", "Émission", "Échéance", "Statut"],
  }[collection];

  return (
    <div className="table-wrap" tabIndex={0} role="region" aria-label={"Liste des " + resources[collection].title.toLowerCase()}>
      <table className="data-table">
        <thead><tr>{columns.map(column => <th scope="col" key={column}>{column}</th>)}<th scope="col">Accès</th><th scope="col">Actions</th></tr></thead>
        <tbody>
          {records.map(record => {
            const permission = access(record);
            if (!permission) return null;
            const title = entityName(record);
            const project = "project_id" in record ? projectById.get(record.project_id) : undefined;
            return (
              <tr key={record.id}>
                <td><Link className="table-link" href={`/${collection}/${encodeURIComponent(record.id)}`}>{title}</Link></td>
                {"name" in record && <><td>{record.email || "—"}</td><td>{record.city || "—"}</td></>}
                {"title" in record && (
                  <>
                    <td>{clientNames.get(record.client_id) ?? "—"}</td>
                    <td><Badge collection="projects" status={record.status} /></td>
                    <td className="whitespace-nowrap">{formatMoney(record.daily_rate)}</td>
                    <td>{formatDate(record.start_date)}</td>
                  </>
                )}
                {"number" in record && (
                  <>
                    <td>{project ? (clientNames.get(project.client_id) ?? "—") : "—"}</td>
                    <td>{project?.title ?? "—"}</td>
                    <td className="whitespace-nowrap">{formatMoney(record.amount)}</td>
                    <td>{formatDate(record.issued_on)}</td>
                    <td>{formatDate(record.due_on)}</td>
                    <td><div className="flex flex-wrap gap-1"><Badge collection="invoices" status={record.status} /><LateBadge days={overdueDays(record, today)} /></div></td>
                  </>
                )}
                <td>
                  <AccessBadge access={permission} />
                  {"name" in record && permission !== "owner" && ownerEmail(record.id) &&
                    <span className="mt-1 block text-xs text-slate-600">Partagé par {ownerEmail(record.id)}</span>}
                </td>
                <td>
                  <div className="flex gap-1">
                    {"name" in record && permission === "owner" && <ShareButton client={record} iconOnly />}
                    {(permission === "owner" || (collection === "invoices" && permission === "edit")) &&
                    <button type="button" className="icon-button" aria-label={`Modifier ${title}`} title="Modifier"
                      onClick={() => onAction({ edit: { collection, record } })}><Pencil size={17} aria-hidden="true" /></button>}
                    {permission === "owner" && <button type="button" className="icon-button text-red-700 hover:bg-red-50"
                      aria-label={`Supprimer ${title}`} title="Supprimer"
                      onClick={() => onAction({ remove: { collection, record } })}><Trash2 size={17} aria-hidden="true" /></button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReturnLink({ collection }: { collection: Collection }) {
  return <Link className="text-action mb-5 inline-flex items-center gap-2" href={`/${collection}`}><ArrowLeft size={16} aria-hidden="true" /> {resources[collection].title}</Link>;
}

export function MissingRecord({ collection }: { collection: Collection }) {
  return <main><ReturnLink collection={collection} /><Heading title="Ressource introuvable" /><div className="panel" role="status">{notFoundMessage}</div></main>;
}
