export const projectStatuses = {
  prospect: "Prospect",
  active: "En cours",
  done: "Terminé",
  cancelled: "Annulé",
} as const;

export const invoiceStatuses = {
  draft: "Brouillon",
  sent: "Envoyée",
  paid: "Payée",
  cancelled: "Annulée",
} as const;

export type ProjectStatus = keyof typeof projectStatuses;
export type InvoiceStatus = keyof typeof invoiceStatuses;

export interface ClientInput {
  name: string;
  email?: string;
  city?: string;
}

export interface ProjectInput {
  client_id: string;
  title: string;
  status: ProjectStatus;
  daily_rate: number;
  start_date: string;
}

export interface InvoiceInput {
  project_id: string;
  number: string;
  amount: number;
  issued_on: string;
  due_on: string;
  status: InvoiceStatus;
  paid_on?: string;
}

export interface InputByCollection {
  clients: ClientInput;
  projects: ProjectInput;
  invoices: InvoiceInput;
}

export type Collection = keyof InputByCollection;
export type RecordByCollection = {
  [K in Collection]: InputByCollection[K] & { id: string; userId: string };
};
export type Client = RecordByCollection["clients"];
export type Project = RecordByCollection["projects"];
export type Invoice = RecordByCollection["invoices"];

export const collections = ["clients", "projects", "invoices"] as const;

export function isCollection(value: string): value is Collection {
  return collections.some(collection => collection === value);
}

export function isDocumentId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 &&
    value !== "." && value !== ".." && !value.includes("/") &&
    !/^__[\s\S]*__$/.test(value) && new TextEncoder().encode(value).byteLength <= 1500;
}

export const notFoundMessage = "Cette ressource est introuvable ou inaccessible.";
