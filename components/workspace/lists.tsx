"use client";

import { Search } from "lucide-react";
import { useState } from "react";

import { overdueDays } from "@/lib/domain/format";
import { invoiceStatuses, projectStatuses, type Collection } from "@/lib/domain/model";
import { useWorkspace } from "./context";
import { InvoiceImport } from "./invoice-import";
import { AddButton, Heading, ResourceDialog, resources, ResourceTable, useInteraction } from "./resources";

const alphabet = new Intl.Collator("fr", { sensitivity: "base", numeric: true });

function searchable(value = "") {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
}

export function ResourceList({ collection }: { collection: Collection }) {
  const { user, clients, projects, invoices, today, sharedLoading } = useWorkspace();
  const [interaction, setInteraction] = useInteraction();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [clientId, setClientId] = useState("");
  const [sort, setSort] = useState("");
  const [late, setLate] = useState(false);
  const query = searchable(search.trim());

  const projectOrder = Object.keys(projectStatuses);
  const invoiceOrder = Object.keys(invoiceStatuses);

  const records = collection === "clients"
    ? clients
      .filter(client => [client.name, client.email, client.city].some(value => searchable(value).includes(query)))
      .sort((left, right) => alphabet.compare(left.name, right.name))
    : collection === "projects"
      ? projects
        .filter(project => searchable(project.title).includes(query)
          && (!status || project.status === status) && (!clientId || project.client_id === clientId))
        .sort((left, right) => sort === "status"
          ? projectOrder.indexOf(left.status) - projectOrder.indexOf(right.status) || alphabet.compare(left.title, right.title)
          : alphabet.compare(left.title, right.title))
      : invoices
        .filter(invoice => searchable(invoice.number).includes(query)
          && (!status || invoice.status === status) && (!late || overdueDays(invoice, today) > 0))
        .sort((left, right) => {
          if (sort === "status") return invoiceOrder.indexOf(left.status) - invoiceOrder.indexOf(right.status) || alphabet.compare(left.number, right.number);
          if (sort === "amount-asc") return left.amount - right.amount;
          if (sort === "amount-desc") return right.amount - left.amount;
          if (sort === "due-asc") return left.due_on.localeCompare(right.due_on);
          if (sort === "due-desc") return right.due_on.localeCompare(left.due_on);
          return alphabet.compare(left.number, right.number);
        });

  const captions = {
    clients: "Retrouve les coordonnées de tes clients et leurs projets.",
    projects: "Suis le statut, le tarif et les dates de tes missions.",
    invoices: "Consulte tes factures, leurs échéances et leurs paiements.",
  };
  const placeholders = {
    clients: "Nom, e-mail ou ville",
    projects: "Titre du projet",
    invoices: "Numéro de facture",
  };
  const emptyMessages = {
    clients: "Tu n’as encore aucun client.",
    projects: "Tu n’as encore aucun projet.",
    invoices: "Tu n’as encore aucune facture.",
  };
  const count = { clients: clients.length, projects: projects.length, invoices: invoices.length }[collection];

  return (
    <main>
      <Heading title={resources[collection].title} caption={captions[collection]}>
        <div className="flex flex-wrap gap-2">
          {collection === "invoices" && <InvoiceImport />}
          <AddButton collection={collection} onClick={() => setInteraction({ edit: { collection } })} />
        </div>
      </Heading>
      {(count > 0 || query) && (
        <div className="panel mb-4 flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-auto sm:min-w-56">
            <label className="field-label" htmlFor="search">Rechercher</label>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute top-3.5 left-3 text-slate-500" aria-hidden="true" />
              <input id="search" type="search" className="field pl-9!" placeholder={placeholders[collection]}
                value={search} onChange={event => setSearch(event.target.value)} />
            </div>
          </div>
          {collection !== "clients" && (
            <>
              <div>
                <label className="field-label" htmlFor="filter-status">Statut</label>
                <select id="filter-status" className="field" value={status} onChange={event => setStatus(event.target.value)}>
                  <option value="">Tous les statuts</option>
                  {Object.entries(collection === "projects" ? projectStatuses : invoiceStatuses)
                    .map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                </select>
              </div>
              {collection === "projects" && (
                <div className="max-w-full">
                  <label className="field-label" htmlFor="filter-client">Client</label>
                  <select id="filter-client" className="field" value={clientId} onChange={event => setClientId(event.target.value)}>
                    <option value="">Tous les clients</option>
                    {clients.map(client => <option value={client.id} key={client.id}>{client.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="field-label" htmlFor="sort">Trier par</label>
                <select id="sort" className="field" value={sort} onChange={event => setSort(event.target.value)}>
                  <option value="">{collection === "projects" ? "Titre" : "Numéro"}</option>
                  <option value="status">Statut</option>
                  {collection === "invoices" && (
                    <>
                      <option value="amount-asc">Montant croissant</option>
                      <option value="amount-desc">Montant décroissant</option>
                      <option value="due-asc">Échéance croissante</option>
                      <option value="due-desc">Échéance décroissante</option>
                    </>
                  )}
                </select>
              </div>
            </>
          )}
          {collection === "invoices" && (
            <label className="flex min-h-11 cursor-pointer items-center gap-2 px-2 text-sm font-medium">
              <input type="checkbox" checked={late} onChange={event => setLate(event.target.checked)} className="size-4 accent-indigo-600" />
              Factures en retard
            </label>
          )}
        </div>
      )}
      {collection === "clients" ? <div className="space-y-4 sm:space-y-7">
        <section aria-labelledby="personal-clients">
          <h2 className="mb-1 text-base font-bold sm:mb-3 sm:text-xl" id="personal-clients">Mes clients</h2>
          <ResourceTable collection="clients" records={records.filter(record => record.userId === user.uid)}
            empty={query ? "Aucun résultat pour cette recherche." : emptyMessages.clients} onAction={setInteraction} />
        </section>
        <section aria-labelledby="shared-clients">
          <h2 className="mb-1 text-base font-bold sm:mb-3 sm:text-xl" id="shared-clients">Clients partagés avec moi</h2>
          <ResourceTable collection="clients" records={records.filter(record => record.userId !== user.uid)}
            empty={sharedLoading ? "Chargement des clients partagés…" : query ?
              "Aucun client partagé ne correspond à cette recherche." : "Aucun client partagé avec toi."} onAction={setInteraction} />
        </section>
      </div> : <ResourceTable collection={collection} records={records}
        empty={count ? "Aucun résultat pour cette recherche." : emptyMessages[collection]} onAction={setInteraction} />}
      {interaction && <ResourceDialog interaction={interaction} onClose={() => setInteraction(null)} />}
    </main>
  );
}
