"use client";

import { CircleAlert, CircleCheck, FolderKanban, ReceiptText, Send, UsersRound } from "lucide-react";
import Link from "next/link";

import { formatDate, formatMoney, invoiceTotal, overdueDays } from "@/lib/domain/format";
import { useWorkspace } from "./context";
import { Heading, LateBadge } from "./resources";

export function Dashboard() {
  const { personal: { clients, projects, invoices }, today } = useWorkspace();
  const sent = invoices.filter(invoice => invoice.status === "sent");
  const overdue = sent.filter(invoice => overdueDays(invoice, today) > 0)
    .sort((left, right) => left.due_on.localeCompare(right.due_on));
  const paid = invoices.filter(invoice => invoice.status === "paid");
  const projectById = new Map(projects.map(project => [project.id, project]));
  const clientNames = new Map(clients.map(client => [client.id, client.name]));

  const metrics = [
    { label: "Total clients", value: clients.length, icon: UsersRound, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Projets en cours", value: projects.filter(project => project.status === "active").length, icon: FolderKanban, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Factures à encaisser", value: sent.length, icon: Send, tone: "bg-blue-50 text-blue-700" },
    { label: "Factures en retard", value: overdue.length, icon: CircleAlert, tone: "bg-red-50 text-red-700" },
    { label: "Total encaissé", value: formatMoney(invoiceTotal(paid)), icon: CircleCheck, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Montant envoyé à encaisser", value: formatMoney(invoiceTotal(sent)), icon: ReceiptText, tone: "bg-blue-50 text-blue-700" },
  ];

  return (
    <main>
      <Heading title="Tableau de bord" caption="Retrouve l’activité et les encaissements de ton compte." />
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metrics.map(({ label, value, icon: Icon, tone }) => (
          <div className="panel" key={label}>
            <div className="flex items-center gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone}`}><Icon size={19} aria-hidden="true" /></span>
              <dt className="text-sm font-medium text-slate-700">{label}</dt>
            </div>
            <dd className="mt-3 text-3xl font-bold tracking-tight tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="mt-9" aria-labelledby="overdue-title">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="overdue-title" className="text-xl font-bold">Factures en retard</h2>
          <Link className="text-action" href="/invoices">Voir les factures</Link>
        </div>
        {overdue.length ? (
          <div className="table-wrap" role="region" aria-label="Tableau des factures en retard" tabIndex={0}>
            <table className="data-table">
              <thead><tr>{["Facture", "Client", "Projet", "Montant", "Échéance", "Retard"].map(label =>
                <th key={label} scope="col">{label}</th>
              )}</tr></thead>
              <tbody>
                {overdue.map(invoice => {
                  const project = projectById.get(invoice.project_id);
                  return (
                    <tr key={invoice.id}>
                      <td><Link className="table-link" href={`/invoices/${encodeURIComponent(invoice.id)}`}>{invoice.number}</Link></td>
                      <td>{project ? (clientNames.get(project.client_id) ?? "—") : "—"}</td>
                      <td>{project?.title ?? "—"}</td>
                      <td className="whitespace-nowrap">{formatMoney(invoice.amount)}</td>
                      <td>{formatDate(invoice.due_on)}</td>
                      <td><LateBadge days={overdueDays(invoice, today)} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel text-slate-600">Aucune facture en retard.</p>
        )}
      </section>
    </main>
  );
}
