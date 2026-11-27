import assert from "node:assert/strict";
import { test } from "node:test";

import { calculateFinances, financialCalendar } from "../lib/domain/finance.ts";
import { todayInParis } from "../lib/domain/format.ts";

const today = "2027-01-10";
const client = (id, name = id) => ({ id, name, userId: "owner" });
const project = (id, client_id = id) => ({ id, client_id, title: id, userId: "owner" });
const invoice = (number, issued_on, amount, status, overrides = {}) => ({
  id: number, userId: "owner", project_id: "a", number, issued_on, due_on: issued_on, amount, status, ...overrides,
});
const paid = (number, issued, amount, paid_on, project_id = "a") =>
  invoice(number, issued, amount, "paid", { paid_on, project_id });

const reference = [
  paid("A", "2026-10-25", 100.10, "2026-12-01"),
  paid("B", "2026-12-01", 0.20, "2026-12-01"),
  paid("C", "2026-12-31", 1.005, "2027-01-01", "b"),
  invoice("HIST", "2026-12-05", 200, "paid"),
  paid("INVALID", "2027-01-02", 10, "2027-01-01"),
  paid("NO-CLIENT", "2026-11-01", 25, "2026-12-31", "missing"),
  paid("FUTURE", "2027-02-01", 60, "2027-02-01"),
  paid("SEPT", "2026-09-01", 50, "2026-09-30"),
  invoice("LATE", "2026-11-15", 300, "sent", { due_on: "2026-12-10" }),
  invoice("LATE-OLD", "2026-10-01", 20, "sent", { due_on: "2026-11-30", project_id: "missing" }),
  invoice("DUE-TODAY", "2027-01-01", 150, "sent", { due_on: "2027-01-10" }),
  invoice("DRAFT", "2026-12-10", 1000, "draft"),
  invoice("CANCEL", "2027-01-10", 1000, "cancelled"),
];

test("Finances : chaque indicateur utilise les bons statuts et les bonnes dates", () => {
  const summary = calculateFinances(reference, [project("a"), project("b")], [client("a"), client("b")], today, 3);
  assert.equal(summary.billedCents, 68621);
  assert.equal(summary.collectedCents, 12631);
  assert.equal(summary.previousMonthCents, 12530);
  assert.equal(summary.totalCollectedCents, 44631);
  assert.equal(summary.pendingCents, 47000);
  assert.equal(summary.overdueCents, 32000);
  assert.deepEqual(summary.overdue.map(({ invoice, days, client }) => [invoice.number, days, client?.id]),
    [["LATE-OLD", 41, undefined], ["LATE", 31, "a"]]);
  assert.equal(summary.averageDelay, 24.5);
  assert.equal(summary.paymentRate, 5 / 7 * 100);
  assert.equal(summary.averagePaymentCents, 3158);
  assert.equal(summary.paidCount, 4);
  assert.deepEqual(summary.statuses, { draft: 1, sent: 2, paid: 5, cancelled: 1 });
  assert.equal(summary.missingPaymentCount, 1);
  assert.deepEqual(summary.unknownPayments.map(item => item.number), ["HIST", "INVALID"]);
  assert.equal(summary.unmatchedPaymentCount, 1);
  assert.deepEqual(summary.topClients.map(({ client, cents }) => [client.id, cents]), [["a", 10030], ["b", 101]]);
  assert.deepEqual(summary.monthly, [
    { key: "2026-11", billedCents: 32500, collectedCents: 0, averageDelay: null },
    { key: "2026-12", billedCents: 20121, collectedCents: 12530, averageDelay: 97 / 3 },
    { key: "2027-01", billedCents: 16000, collectedCents: 101, averageDelay: 1 },
  ]);
});

test("Finances : périodes calendaires, frontières, mois inactifs et changement d’année à Paris", () => {
  assert.deepEqual(financialCalendar("2026-11-27", 3), {
    start: "2026-09-01", end: "2026-12-01", previous: "2026-10", keys: ["2026-09", "2026-10", "2026-11"],
  });
  const six = calculateFinances(reference, [], [], today, 6);
  const twelve = calculateFinances(reference, [], [], today, 12);
  assert.equal(six.calendar.start, "2026-08-01");
  assert.equal(twelve.calendar.start, "2026-02-01");
  assert.equal(twelve.calendar.end, "2027-02-01");
  assert.equal(six.billedCents, 85631);
  assert.equal(six.collectedCents, 17631);
  assert.equal(twelve.collectedCents, 17631);
  assert.equal(twelve.pendingCents, six.pendingCents);
  assert.equal(twelve.previousMonthCents, 12530);
  assert.deepEqual(six.monthly[0], { key: "2026-08", billedCents: 0, collectedCents: 0, averageDelay: null });
  const before = todayInParis(new Date("2026-12-31T22:59:59Z"));
  const after = todayInParis(new Date("2026-12-31T23:00:00Z"));
  assert.equal(financialCalendar(before, 6).previous, "2026-11");
  assert.equal(financialCalendar(after, 6).previous, "2026-12");
});

test("Finances : arrondis, classement limité à cinq clients et regroupement par identifiant", () => {
  const clients = Array.from({ length: 6 }, (_, index) => client(String(index), "Même nom"));
  const projects = clients.map(item => project(item.id));
  projects.push(project("other-project", "5"));
  const invoices = clients.map((item, index) => paid(item.id, "2027-01-01", index + 0.105, "2027-01-01", item.id));
  invoices.push(paid("bonus", "2027-01-01", 0.2, "2027-01-01", "other-project"));
  const summary = calculateFinances(invoices, projects, clients, today, 3);
  assert.equal(summary.collectedCents, 1586);
  assert.equal(summary.averageDelay, 0);
  assert.deepEqual(summary.topClients.map(({ client, cents }) => [client.id, cents]),
    [["5", 531], ["4", 411], ["3", 311], ["2", 211], ["1", 111]]);
});

test("Finances : compte vide et factures anciennes sans date exploitable", () => {
  const empty = calculateFinances([], [], [], today, 6);
  assert.equal(empty.collectedCents, 0);
  assert.equal(empty.previousMonthCents, 0);
  assert.equal(empty.paidCount, 0);
  assert.equal(empty.averageDelay, null);
  assert.equal(empty.averagePaymentCents, null);
  assert.equal(empty.paymentRate, null);
  assert.equal(empty.missingPaymentCount, 0);
  assert.deepEqual(empty.topClients, []);
  assert.deepEqual(empty.overdue, []);
  const legacy = calculateFinances([
    invoice("HIST", "2026-12-05", 200, "paid"),
    paid("INVALID", "2026-12-05", 10, "2026-12-32"),
  ], [], [], today, 6);
  assert.equal(legacy.totalCollectedCents, 21000);
  assert.equal(legacy.collectedCents, 0);
  assert.equal(legacy.averageDelay, null);
  assert.equal(legacy.paymentRate, 100);
  assert.equal(legacy.missingPaymentCount, 1);
  assert.equal(legacy.unknownPayments.length, 2);
});
