import { isCivilDate } from "./format.ts";
import {
  isDocumentId,
  invoiceStatuses,
  projectStatuses,
  type Collection,
  type InputByCollection,
  type InvoiceInput,
} from "./model.ts";

export class BusinessError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function object(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BusinessError("Le formulaire est invalide.");
  }
  return input as Record<string, unknown>;
}

export function checkFields(data: Record<string, unknown>, keys: string[]) {
  if (Object.keys(data).some(key => !keys.includes(key))) {
    throw new BusinessError("Le formulaire contient un champ non autorisé.");
  }
}

function required(value: unknown, label: string, limit = 160) {
  if (typeof value !== "string" || !value.trim()) throw new BusinessError(label + " est obligatoire.");
  const result = value.trim();
  if (result.length > limit) throw new BusinessError(label + " est trop long.");
  return result;
}

function optional(value: unknown, label: string, limit = 160) {
  if (value === undefined || value === "") return "";
  if (typeof value !== "string" || value.trim().length > limit) {
    throw new BusinessError(label + " est invalide.");
  }
  return value.trim();
}

function amount(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new BusinessError(label + " doit être supérieur à zéro.");
  }
  return value;
}

function date(value: unknown, label: string) {
  if (typeof value !== "string" || !isCivilDate(value)) throw new BusinessError(label + " est invalide.");
  return value;
}

export function paymentDate(value: unknown, invoice: Pick<InvoiceInput, "status" | "issued_on">) {
  if (value === undefined || value === "") return undefined;
  if (invoice.status !== "paid") {
    throw new BusinessError("La date de paiement est réservée aux factures payées.");
  }
  const paidOn = date(value, "La date de paiement");
  date(invoice.issued_on, "La date d’émission");
  if (paidOn < invoice.issued_on) {
    throw new BusinessError("La date de paiement ne peut pas être antérieure à la date d’émission.");
  }
  return paidOn;
}

function parent(value: unknown, label: string) {
  if (!isDocumentId(value)) throw new BusinessError(label);
  return value;
}

function status<K extends string>(value: unknown, labels: Record<K, string>): K {
  if (typeof value !== "string" || !Object.hasOwn(labels, value)) {
    throw new BusinessError("Le statut sélectionné est invalide.");
  }
  return value as K;
}

const parsers: { [K in Collection]: (input: Record<string, unknown>) => InputByCollection[K] } = {
  clients(data) {
    checkFields(data, ["name", "email", "city"]);
    const name = required(data.name, "Le nom du client");
    const email = optional(data.email, "L’adresse e-mail", 254);
    const city = optional(data.city, "La ville");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BusinessError("Saisis une adresse e-mail valide.");
    }
    return { name, email, city };
  },
  projects(data) {
    checkFields(data, ["client_id", "title", "status", "daily_rate", "start_date"]);
    return {
      client_id: parent(data.client_id, "Sélectionne un client."),
      title: required(data.title, "Le titre du projet"),
      status: status(data.status, projectStatuses),
      daily_rate: amount(data.daily_rate, "Le tarif journalier"),
      start_date: date(data.start_date, "La date de début"),
    };
  },
  invoices(data) {
    checkFields(data, ["project_id", "number", "amount", "issued_on", "due_on", "status", "paid_on"]);
    const issued_on = date(data.issued_on, "La date d’émission");
    const due_on = date(data.due_on, "La date d’échéance");
    if (due_on < issued_on) {
      throw new BusinessError("La date d’échéance ne peut pas être antérieure à la date d’émission.");
    }
    const fields = {
      project_id: parent(data.project_id, "Sélectionne un projet."),
      number: required(data.number, "Le numéro de facture"),
      amount: amount(data.amount, "Le montant"),
      issued_on,
      due_on,
      status: status(data.status, invoiceStatuses),
    };
    const paidOn = paymentDate(data.paid_on, fields);
    return paidOn === undefined ? fields : { ...fields, paid_on: paidOn };
  },
};

export function validate<K extends Collection>(collection: K, input: unknown): InputByCollection[K] {
  return parsers[collection](object(input));
}

export function validateStatus(collection: "projects" | "invoices", input: unknown) {
  const data = object(input);
  checkFields(data, ["status"]);
  return collection === "projects" ? status(data.status, projectStatuses) : status(data.status, invoiceStatuses);
}
