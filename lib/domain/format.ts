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

export function isCivilDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function overdueDays(invoice: Invoice, today: string) {
  if (invoice.status !== "sent" || invoice.due_on >= today) return 0;
  return (Date.parse(today) - Date.parse(invoice.due_on)) / 86_400_000;
}

export function invoiceTotal(invoices: Invoice[]) {
  return invoices.reduce((total, invoice) => total + invoice.amount, 0);
}
