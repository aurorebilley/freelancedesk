"use client";

import {
  Banknote, CalendarDays, CircleAlert, CircleCheck, Clock3, Hourglass,
  Percent, Receipt, ReceiptText, Wallet,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { calculateFinances, financialMonthLabel, financialPeriods, type FinancialPeriod, type FinancialSummary } from "@/lib/domain/finance";
import { formatDate, formatMoney } from "@/lib/domain/format";
import { useWorkspace } from "./context";
import { FinancialCharts } from "./financial-charts";
import { Heading, LateBadge } from "./resources";

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const unavailable = "Non disponible";

function invoiceHref(id: string) {
  return "/invoices/" + encodeURIComponent(id);
}

function OverdueInvoices({ overdue }: { overdue: FinancialSummary["overdue"] }) {
  return (
    <section aria-labelledby="overdue-invoices">
      <h2 className="text-xl font-bold" id="overdue-invoices">Factures en retard</h2>
      <p className="mt-1 mb-4 text-sm text-slate-600">Situation actuelle, toutes périodes confondues.</p>
      {overdue.length ? (
        <div className="table-wrap" role="region" aria-label="Liste des factures en retard" tabIndex={0}>
          <table className="data-table">
            <thead><tr>
              {["Facture", "Client", "Projet", "Montant", "Émission", "Échéance", "Retard"].map(label =>
                <th key={label} scope="col">{label}</th>,
              )}
            </tr></thead>
            <tbody>{overdue.map(({ invoice, project, client, days }) => (
              <tr key={invoice.id}>
                <th scope="row" className="bg-white!"><Link className="table-link" href={invoiceHref(invoice.id)}>{invoice.number}</Link></th>
                <td>{client?.name ?? "Client introuvable"}</td>
                <td>{project?.title ?? "Projet introuvable"}</td>
                <td className="whitespace-nowrap">{formatMoney(invoice.amount)}</td>
                <td>{formatDate(invoice.issued_on)}</td>
                <td>{formatDate(invoice.due_on)}</td>
                <td><LateBadge days={days} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="panel text-slate-600">Bonne nouvelle, aucune facture en retard.</p>}
    </section>
  );
}

function PaymentDateQuality({ summary }: { summary: FinancialSummary }) {
  const invalidCount = summary.unknownPayments.length - summary.missingPaymentCount;
  return (
    <section className="panel" aria-labelledby="payment-date-quality">
      <h2 className="text-lg font-bold" id="payment-date-quality">Qualité des données de paiement</h2>
      <p className="mt-2 text-sm text-slate-700">
        Dates de paiement manquantes : <strong>{summary.missingPaymentCount}</strong>
        {invalidCount > 0 && <> · Dates invalides : <strong>{invalidCount}</strong></>}
      </p>
      {summary.unknownPayments.length > 0 && (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Les factures payées sans date exploitable contribuent au total encaissé toutes périodes. Elles sont exclues des statistiques fondées sur la date de paiement.
          </p>
          <details className="mt-3 text-sm">
            <summary className="text-action">Voir les factures à compléter</summary>
            <ul className="mt-2 max-h-44 list-disc space-y-2 overflow-y-auto pl-5">
              {summary.unknownPayments.map(invoice => (
                <li key={invoice.id}><Link className="table-link" href={invoiceHref(invoice.id)}>{invoice.number}</Link></li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

export function Finances() {
  const { invoices, projects, clients, today } = useWorkspace();
  const [period, setPeriod] = useState<FinancialPeriod>(6);
  const summary = useMemo(() => calculateFinances(invoices, projects, clients, today, period),
    [invoices, projects, clients, today, period]);
  const overdueCount = summary.overdue.length;
  const metrics = [
    { label: "Chiffre d’affaires encaissé", value: formatMoney(summary.collectedCents / 100), scope: "Sur la période · par date de paiement", icon: Wallet },
    { label: "Chiffre d’affaires facturé", value: formatMoney(summary.billedCents / 100), scope: "Sur la période · par date d’émission", icon: ReceiptText },
    { label: "Montant en attente de paiement", value: formatMoney(summary.pendingCents / 100), scope: "Situation actuelle · retards inclus", icon: Hourglass },
    { label: "Montant en retard", value: formatMoney(summary.overdueCents / 100), scope: `Situation actuelle · ${overdueCount} ${overdueCount === 1 ? "facture" : "factures"}`, icon: CircleAlert },
    { label: "Délai moyen de paiement", value: summary.averageDelay === null ? unavailable : number.format(summary.averageDelay) + " j", scope: "Sur la période · par date de paiement", icon: Clock3 },
    { label: "Taux de paiement", value: summary.paymentRate === null ? unavailable : percent.format(summary.paymentRate / 100), scope: "Sur la période · par date d’émission", icon: Percent },
    { label: "Panier moyen des factures payées", value: summary.averagePaymentCents === null ? unavailable : formatMoney(summary.averagePaymentCents / 100), scope: "Sur la période · par date de paiement", icon: Receipt },
    { label: "Factures encaissées", value: number.format(summary.paidCount), scope: "Sur la période · par date de paiement", icon: CircleCheck },
    { label: "Encaissé le mois précédent", value: formatMoney(summary.previousMonthCents / 100), scope: financialMonthLabel(summary.calendar.previous), icon: CalendarDays },
    { label: "Total encaissé", value: formatMoney(summary.totalCollectedCents / 100), scope: "Toutes périodes · dates inconnues incluses", icon: Banknote },
  ];

  return (
    <main>
      <Heading title="Finances" caption="Suis tes encaissements, les paiements à venir et tes principaux clients.">
        <div>
          <label className="field-label" htmlFor="financial-period">Période</label>
          <select id="financial-period" className="field min-w-32" value={period} onChange={event => {
            const selected = financialPeriods.find(months => String(months) === event.target.value);
            if (selected) setPeriod(selected);
          }}>
            {financialPeriods.map(months => <option key={months} value={months}>{months} mois</option>)}
          </select>
        </div>
      </Heading>
      <div className="space-y-7">
        <section aria-labelledby="financial-indicators">
          <h2 className="sr-only" id="financial-indicators">Indicateurs financiers</h2>
          <p className="mb-3 text-sm text-slate-600" role="status">
            {financialMonthLabel(summary.calendar.keys[0])} à {financialMonthLabel(summary.calendar.keys[period - 1])}
          </p>
          <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {metrics.map(({ label, value, scope, icon: Icon }) => (
              <div className="panel min-w-0" key={label}>
                <dt className="flex min-h-10 items-center gap-2.5 text-sm font-medium text-slate-700">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-700">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  {label}
                </dt>
                <dd className="mt-3 wrap-anywhere text-2xl font-bold tracking-tight">{value}</dd>
                <dd className="mt-1 text-sm text-slate-600">{scope}</dd>
              </div>
            ))}
          </dl>
        </section>
        <PaymentDateQuality summary={summary} />
        <FinancialCharts summary={summary} />
        <OverdueInvoices overdue={summary.overdue} />
      </div>
    </main>
  );
}
