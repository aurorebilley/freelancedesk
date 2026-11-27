import { civilDaysBetween, isCivilDate, knownPaymentDate, overdueDays } from "./format.ts";
import type { Client, Invoice, InvoiceStatus, Project } from "./model.ts";

export const financialPeriods = [3, 6, 12] as const;
export type FinancialPeriod = (typeof financialPeriods)[number];

const monthFormat = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const shortMonthFormat = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });

function monthKey(index: number) {
  const year = String(Math.floor(index / 12)).padStart(4, "0");
  const month = String(index % 12 + 1).padStart(2, "0");
  return year + "-" + month;
}

export function financialCalendar(today: string, period: FinancialPeriod) {
  const [year, month] = today.split("-").map(Number);
  const current = year * 12 + month - 1;
  const keys = Array.from({ length: period }, (_, index) => monthKey(current - period + 1 + index));
  return {
    start: keys[0] + "-01",
    end: monthKey(current + 1) + "-01",
    previous: monthKey(current - 1),
    keys,
  };
}

export function financialMonthLabel(key: string, short = false) {
  const first = new Date(key + "-01T00:00:00Z");
  return (short ? shortMonthFormat : monthFormat).format(first);
}

function inPeriod(date: string, start: string, end: string) {
  return isCivilDate(date) && date >= start && date < end;
}

function toCents(amount: number) {
  const [significand, exponent = "0"] = String(amount).split("e");
  return Math.round(Number(significand + "e" + (Number(exponent) + 2)));
}

interface MonthlyTotals {
  key: string;
  billedCents: number;
  collectedCents: number;
  paidCount: number;
  delayDays: number;
}

export function calculateFinances(invoices: Invoice[], projects: Project[], clients: Client[], today: string, period: FinancialPeriod) {
  const calendar = financialCalendar(today, period);
  const months = new Map<string, MonthlyTotals>(calendar.keys.map(key => [
    key, { key, billedCents: 0, collectedCents: 0, paidCount: 0, delayDays: 0 },
  ]));
  const statuses: Record<InvoiceStatus, number> = { draft: 0, sent: 0, paid: 0, cancelled: 0 };
  const projectsById = new Map(projects.map(project => [project.id, project]));
  const clientsById = new Map(clients.map(client => [client.id, client]));
  const receiptsByClient = new Map<string, { client: Client; cents: number }>();
  const overdue: { invoice: Invoice; days: number; project?: Project; client?: Client }[] = [];
  const unknownPayments: Invoice[] = [];
  let missingPaymentCount = 0;
  let unmatchedPaymentCount = 0;
  let issuedCount = 0;
  let billedCount = 0;
  let paidFromIssuedCount = 0;
  let billedCents = 0;
  let collectedCents = 0;
  let totalCollectedCents = 0;
  let pendingCents = 0;
  let overdueCents = 0;
  let delayDays = 0;
  let paidCount = 0;

  for (const invoice of invoices) {
    const cents = toCents(invoice.amount);
    const project = projectsById.get(invoice.project_id);
    const client = project && clientsById.get(project.client_id);
    if (inPeriod(invoice.issued_on, calendar.start, calendar.end)) {
      const issuedMonth = months.get(invoice.issued_on.slice(0, 7))!;
      statuses[invoice.status] += 1;
      issuedCount += 1;
      if (invoice.status === "sent" || invoice.status === "paid") {
        issuedMonth.billedCents += cents;
        billedCents += cents;
        billedCount += 1;
        if (invoice.status === "paid") paidFromIssuedCount += 1;
      }
    }

    if (invoice.status === "sent") {
      pendingCents += cents;
      const days = overdueDays(invoice, today);
      if (days > 0) {
        overdueCents += cents;
        overdue.push({ invoice, days, project, client });
      }
    }

    if (invoice.status !== "paid") continue;
    totalCollectedCents += cents;
    const paidOn = knownPaymentDate(invoice);
    if (!paidOn) {
      unknownPayments.push(invoice);
      if (invoice.paid_on == null || invoice.paid_on === "") missingPaymentCount += 1;
      continue;
    }

    const paidMonth = months.get(paidOn.slice(0, 7));
    if (!paidMonth) continue;
    const delay = civilDaysBetween(invoice.issued_on, paidOn);
    paidMonth.collectedCents += cents;
    paidMonth.paidCount += 1;
    paidMonth.delayDays += delay;
    collectedCents += cents;
    delayDays += delay;
    paidCount += 1;

    if (client) {
      const previous = receiptsByClient.get(client.id)?.cents ?? 0;
      receiptsByClient.set(client.id, { client, cents: previous + cents });
    } else {
      unmatchedPaymentCount += 1;
    }
  }

  const topClients = [...receiptsByClient.values()].sort((a, b) =>
    b.cents - a.cents || a.client.name.localeCompare(b.client.name, "fr") || a.client.id.localeCompare(b.client.id),
  ).slice(0, 5);

  return {
    calendar, statuses, issuedCount, billedCount, billedCents, collectedCents, totalCollectedCents,
    pendingCents, overdueCents, paidCount, topClients, unknownPayments, missingPaymentCount, unmatchedPaymentCount,
    previousMonthCents: months.get(calendar.previous)!.collectedCents,
    paymentRate: billedCount ? 100 * paidFromIssuedCount / billedCount : null,
    averageDelay: paidCount ? delayDays / paidCount : null,
    averagePaymentCents: paidCount ? Math.round(collectedCents / paidCount) : null,
    overdue: overdue.sort((a, b) => b.days - a.days || a.invoice.number.localeCompare(b.invoice.number, "fr")),
    monthly: [...months.values()].map(month => ({
      key: month.key,
      billedCents: month.billedCents,
      collectedCents: month.collectedCents,
      averageDelay: month.paidCount ? month.delayDays / month.paidCount : null,
    })),
  };
}

export type FinancialSummary = ReturnType<typeof calculateFinances>;
