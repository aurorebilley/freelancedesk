import type { Invoice } from "./model";

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const parisDate = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit",
});

export function formatMoney(value: number) {
  return euro.format(value);
}

export function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return [day, month, year].join("/");
}

export function todayInParis(now = new Date()) {
  return parisDate.format(now).split("/").reverse().join("-");
}

export function isCivilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function knownPaymentDate(invoice: Invoice) {
  const { status, issued_on, paid_on } = invoice;
  return status === "paid" && isCivilDate(paid_on) && isCivilDate(issued_on) && paid_on >= issued_on
    ? paid_on : undefined;
}

export function civilDaysBetween(start: string, end: string) {
  return (Date.parse(end) - Date.parse(start)) / 86_400_000;
}

export function overdueDays(invoice: Invoice, today: string) {
  if (invoice.status !== "sent" || invoice.due_on >= today) return 0;
  return civilDaysBetween(invoice.due_on, today);
}

export function invoiceTotal(invoices: Invoice[]) {
  return invoices.reduce((total, invoice) => total + invoice.amount, 0);
}
