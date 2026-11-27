"use client";

import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent, type ReactNode } from "react";

import { formatDate, formatMoney, knownPaymentDate, overdueDays } from "@/lib/domain/format";
import { invoiceStatuses, projectStatuses, type Collection } from "@/lib/domain/model";
import { mutate } from "@/lib/firebase/data";
import { AccessBadge, ClientAccess, ShareButton } from "./client-sharing";
import { useWorkspace } from "./context";
import {
  AddButton, Badge, Heading, LateBadge, MissingRecord, ResourceDialog, ResourceTable, ReturnLink, useInteraction,
} from "./resources";

function Facts({ fields }: { fields: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="panel grid gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map(({ label, value }) => (
        <div key={label} className="min-w-0">
          <dt className="text-sm text-slate-600">{label}</dt>
          <dd className="mt-1 wrap-break-word font-semibold">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function StatusControl({ collection, id, status }: { collection: "projects" | "invoices"; id: string; status: string }) {
  const { user, notify } = useWorkspace();
  const [value, setValue] = useState(status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const labels = collection === "projects" ? projectStatuses : invoiceStatuses;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || value === status) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await mutate(user, collection, "PATCH", id, { status: value });
      notify("Le statut a bien été modifié.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Impossible de modifier le statut.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <form className="panel mt-4" onSubmit={handleSubmit} aria-busy={pending}>
      <label htmlFor="quick-status" className="field-label">Modifier le statut</label>
      <div className="flex flex-wrap items-end gap-2">
        <select id="quick-status" className="field w-auto!" value={value} onChange={event => setValue(event.target.value)} disabled={pending}>
          {Object.entries(labels).map(([code, label]) => <option value={code} key={code}>{label}</option>)}
        </select>
        <button type="submit" className="button-secondary" disabled={pending || status === value}>
          {pending ? "En cours…" : "Appliquer"}
        </button>
      </div>
      {error && <p className="notice-error mt-3" role="alert">{error}</p>}
    </form>
  );
}

export function ResourceDetail({ collection, id }: { collection: Collection; id: string }) {
  const { clients, projects, invoices, today, access, ownerEmail, sharedLoading } = useWorkspace();
  const [interaction, setInteraction] = useInteraction();
  const client = collection === "clients" ? clients.find(item => item.id === id) : undefined;
  const invoice = collection === "invoices" ? invoices.find(item => item.id === id) : undefined;
  const project = collection === "projects" ? projects.find(item => item.id === id) : projects.find(item => item.id === invoice?.project_id);
  const relatedClient = clients.find(item => item.id === project?.client_id);
  const record = client ?? invoice ?? (collection === "projects" ? project : undefined);

  if (!record && sharedLoading) return <main className="panel" role="status">Chargement de la ressource…</main>;
  const permission = record && access(record);
  if (!record || !permission) return <MissingRecord collection={collection} />;
  const owner = permission === "owner";
  const editable = owner || (collection === "invoices" && permission === "edit");
  const paidOn = invoice && knownPaymentDate(invoice);

  const fields = client ? [
    { label: "Adresse e-mail", value: client.email ? <a className="table-link" href={"mailto:" + client.email}>{client.email}</a> : undefined },
    { label: "Ville", value: client.city },
  ] : invoice ? [
    { label: "Projet", value: project && <Link className="table-link" href={`/projects/${encodeURIComponent(project.id)}`}>{project.title}</Link> },
    { label: "Client", value: relatedClient && <Link className="table-link" href={`/clients/${encodeURIComponent(relatedClient.id)}`}>{relatedClient.name}</Link> },
    { label: "Montant", value: formatMoney(invoice.amount) },
    { label: "Date d’émission", value: formatDate(invoice.issued_on) },
    { label: "Date d’échéance", value: formatDate(invoice.due_on) },
    ...(invoice.status === "paid" ? [{ label: "Date de paiement", value: paidOn ? formatDate(paidOn) : "Date à renseigner" }] : []),
    { label: "Statut", value: <div className="flex flex-wrap gap-2"><Badge collection="invoices" status={invoice.status} /><LateBadge days={overdueDays(invoice, today)} /></div> },
  ] : project ? [
    { label: "Client", value: relatedClient && <Link className="table-link" href={`/clients/${encodeURIComponent(relatedClient.id)}`}>{relatedClient.name}</Link> },
    { label: "Statut", value: <Badge collection="projects" status={project.status} /> },
    { label: "Tarif journalier", value: formatMoney(project.daily_rate) },
    { label: "Date de début", value: formatDate(project.start_date) },
  ] : [];

  return (
    <main>
      <ReturnLink collection={collection} />
      <Heading title={"name" in record ? record.name : "number" in record ? record.number : record.title}>
        <div className="flex flex-wrap gap-2">
          <AccessBadge access={permission} />
          {client && owner && <ShareButton client={client} />}
          {editable && <button className="button-secondary" type="button" onClick={() => setInteraction({ edit: { collection, record } })}>
            <Pencil size={16} aria-hidden="true" /> Modifier
          </button>}
          {owner && <button className="button-secondary text-red-700!" type="button"
            onClick={() => setInteraction({ remove: { collection, record, redirect: "/" + collection } })}>
            <Trash2 size={16} aria-hidden="true" /> Supprimer
          </button>}
        </div>
      </Heading>
      {client && !owner && ownerEmail(client.id) && <p className="mb-4 text-sm text-slate-700">Partagé par {ownerEmail(client.id)}</p>}
      <Facts fields={fields} />
      {client && owner && <ClientAccess key={client.id} client={client} />}
      {editable && collection !== "clients" && "status" in record && (
        <StatusControl key={record.status} collection={collection} id={record.id} status={record.status} />
      )}
      {collection !== "invoices" && (
        <section className="mt-8" aria-labelledby="relations-title">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold" id="relations-title">{client ? "Projets du client" : "Factures du projet"}</h2>
            {(owner || (!client && permission === "edit")) && <AddButton collection={client ? "projects" : "invoices"} onClick={() =>
              setInteraction({ edit: { collection: client ? "projects" : "invoices", parent: id } })
            } />}
          </div>
          {client ? (
            <ResourceTable collection="projects" records={projects.filter(item => item.client_id === id)}
              empty="Aucun projet associé à ce client." onAction={setInteraction} />
          ) : (
            <ResourceTable collection="invoices" records={invoices.filter(item => item.project_id === id)}
              empty="Aucune facture associée à ce projet." onAction={setInteraction} />
          )}
        </section>
      )}
      {interaction && <ResourceDialog interaction={interaction} onClose={() => setInteraction(null)} />}
    </main>
  );
}
