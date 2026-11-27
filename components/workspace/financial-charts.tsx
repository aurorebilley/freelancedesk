"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { financialMonthLabel, type FinancialSummary } from "@/lib/domain/finance";
import { formatMoney } from "@/lib/domain/format";

const billedColor = "#4338ca";
const collectedColor = "#047857";
const axis = { fill: "#475569", fontSize: 12 };
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const compactEuro = new Intl.NumberFormat("fr-FR", { notation: "compact", style: "currency", currency: "EUR", maximumFractionDigits: 1 });
const statusLabels = [
  { key: "draft", label: "Brouillons", color: "#64748b" },
  { key: "sent", label: "Envoyées", color: "#2563eb" },
  { key: "paid", label: "Payées", color: collectedColor },
  { key: "cancelled", label: "Annulées", color: "#9d174d" },
] as const;

function ChartPanel({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section className="panel min-w-0" aria-labelledby={id}>
      <h2 className="mb-4 text-lg font-bold" id={id}>{title}</h2>
      {children}
    </section>
  );
}

function EmptyChart({ children }: { children: ReactNode }) {
  return <p className="grid min-h-40 place-items-center rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-600">{children}</p>;
}

function MonthlyValues({ monthly, delay = false }: { monthly: FinancialSummary["monthly"]; delay?: boolean }) {
  return (
    <details className="mt-4 text-sm">
      <summary className="text-action">Voir les valeurs par mois</summary>
      <div className="table-wrap mt-2" tabIndex={0} role="region" aria-label={delay ? "Délais mensuels" : "Montants mensuels"}>
        <table className="data-table">
          <thead><tr>
            <th scope="col">Mois</th>
            {delay ? <th scope="col">Délai moyen</th> : <><th scope="col">Facturé</th><th scope="col">Encaissé</th></>}
          </tr></thead>
          <tbody>{monthly.map(month => (
            <tr key={month.key}>
              <td>{financialMonthLabel(month.key)}</td>
              {delay
                ? <td>{month.averageDelay === null ? "Non disponible" : number.format(month.averageDelay) + " j"}</td>
                : <><td className="whitespace-nowrap">{formatMoney(month.billedCents / 100)}</td>
                  <td className="whitespace-nowrap">{formatMoney(month.collectedCents / 100)}</td></>}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </details>
  );
}

export function FinancialCharts({ summary }: { summary: FinancialSummary }) {
  const monthly = summary.monthly.map(month => ({
    ...month,
    billed: month.billedCents / 100,
    collected: month.collectedCents / 100,
  }));
  const statuses = statusLabels.map(status => ({ ...status, fill: status.color, count: summary.statuses[status.key] }));
  const ranked = summary.topClients.map(({ client, cents }, index) => ({
    id: client.id, name: client.name, amount: cents / 100, rank: index + 1,
  }));
  const clientName = (rank: unknown) => ranked[Number(rank) - 1]?.name ?? "";

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <ChartPanel id="revenue-chart" title="Chiffre d’affaires mensuel">
        {summary.billedCount || summary.paidCount ? (
          <>
            <ResponsiveContainer width="100%" height={275} minWidth={0}>
              <BarChart data={monthly} margin={{ left: 0, right: 8, top: 8 }} title="Chiffre d’affaires facturé et encaissé par mois">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="key" tick={axis} tickFormatter={key => financialMonthLabel(key, true)} minTickGap={10} />
                <YAxis width={58} tick={axis} tickFormatter={value => compactEuro.format(value)} />
                <Tooltip labelFormatter={key => financialMonthLabel(String(key))} formatter={value => formatMoney(Number(value))} />
                <Legend />
                <Bar dataKey="billed" name="Facturé" fill={billedColor} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                <Bar dataKey="collected" name="Encaissé" fill={collectedColor} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <MonthlyValues monthly={summary.monthly} />
          </>
        ) : <EmptyChart>Aucun montant facturé ou encaissé sur cette période.</EmptyChart>}
      </ChartPanel>

      <ChartPanel id="status-chart" title="Factures émises par statut">
        {summary.issuedCount ? (
          <>
            <ResponsiveContainer width="100%" height={230} minWidth={0}>
              <PieChart title="Répartition des factures émises par statut">
                <Pie data={statuses} dataKey="count" nameKey="label" innerRadius={52} outerRadius={90} isAnimationActive={false} />
                <Tooltip formatter={value => {
                  const count = Number(value);
                  return number.format(count) + " · " + percent.format(count / summary.issuedCount);
                }} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2" aria-label="Détail des statuts">
              {statuses.map(({ key, color, label, count }) => (
                <li key={key} className="flex items-center gap-2">
                  <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />
                  <span>{label}</span>
                  <span className="ml-auto whitespace-nowrap font-semibold">{count} · {percent.format(count / summary.issuedCount)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : <EmptyChart>Aucune facture émise sur cette période.</EmptyChart>}
      </ChartPanel>

      <ChartPanel id="clients-chart" title="Top 5 des clients par encaissements">
        {ranked.length ? (
          <>
            <ResponsiveContainer width="100%" height={65 + ranked.length * 42} minWidth={0}>
              <BarChart layout="vertical" data={ranked} margin={{ right: 16 }} title="Classement des clients par encaissements">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={axis} tickFormatter={value => compactEuro.format(value)} />
                <YAxis type="category" dataKey="rank" width={105} tick={axis} tickLine={false} tickFormatter={value => {
                  const name = clientName(value);
                  return name.length > 13 ? name.slice(0, 12) + "…" : name;
                }} />
                <Tooltip labelFormatter={clientName} formatter={value => formatMoney(Number(value))} />
                <Bar dataKey="amount" name="Encaissé" fill={collectedColor} radius={[0, 3, 3, 0]} maxBarSize={28} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
            <ol className="divide-y divide-slate-200 text-sm">
              {ranked.map(({ id, amount, name, rank }) => (
                <li className="flex items-baseline gap-2 py-2" key={id}>
                  <span className="w-5 shrink-0 text-slate-600">{rank}.</span>
                  <Link className="table-link min-w-0" href={"/clients/" + encodeURIComponent(id)}>{name}</Link>
                  <span className="ml-auto shrink-0 font-semibold">{formatMoney(amount)}</span>
                </li>
              ))}
            </ol>
          </>
        ) : <EmptyChart>Aucun encaissement rattaché à un client sur cette période.</EmptyChart>}
        {summary.unmatchedPaymentCount > 0 && (
          <p className="mt-3 text-sm text-slate-600">
            Paiements exclus du classement faute de client associé : {summary.unmatchedPaymentCount}.
          </p>
        )}
      </ChartPanel>

      <ChartPanel id="delay-chart" title="Délai moyen de paiement par mois">
        {summary.paidCount ? (
          <>
            <ResponsiveContainer width="100%" height={275} minWidth={0}>
              <LineChart data={monthly} margin={{ right: 12, top: 10 }} title="Délai moyen de paiement, en jours, par mois">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="key" tick={axis} tickFormatter={key => financialMonthLabel(key, true)} minTickGap={10} />
                <YAxis tick={axis} width={44} tickFormatter={value => number.format(value) + " j"} />
                <Tooltip labelFormatter={key => financialMonthLabel(String(key))}
                  formatter={value => number.format(Number(value)) + " j"} />
                <Line type="linear" dataKey="averageDelay" name="Délai moyen" stroke={billedColor} strokeWidth={2}
                  dot={{ r: 4 }} connectNulls={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
            <MonthlyValues monthly={summary.monthly} delay />
          </>
        ) : <EmptyChart>Aucun paiement daté sur cette période.</EmptyChart>}
      </ChartPanel>
    </div>
  );
}
