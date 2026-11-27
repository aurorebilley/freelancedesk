import { invoiceStatuses, type InvoiceStatus } from "./model";
import { BusinessError, validate } from "./validation";

export const invoiceCsvColumns = ["project_title", "number", "amount", "issued_on", "due_on", "status"] as const;
export const invoiceCsvAllowedColumns = [...invoiceCsvColumns, "paid_on"] as const;
export type InvoiceCsvFields = Record<(typeof invoiceCsvColumns)[number], string> & { paid_on?: string };

const frenchStatuses: ReadonlyMap<string, InvoiceStatus> = new Map([
  ["brouillon", "draft"], ["envoyee", "sent"], ["envoye", "sent"],
  ["payee", "paid"], ["paye", "paid"], ["annulee", "cancelled"], ["annule", "cancelled"],
]);

export function readInvoiceCsvFields(input: unknown): InvoiceCsvFields {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BusinessError("La ligne de facture est invalide.");
  }

  const data = input as Record<string, unknown>;
  if (Object.keys(data).some(key => !invoiceCsvAllowedColumns.some(column => column === key)) ||
      !invoiceCsvColumns.every(key => Object.hasOwn(data, key) && typeof data[key] === "string") ||
      (Object.hasOwn(data, "paid_on") && typeof data.paid_on !== "string")) {
    throw new BusinessError("La ligne de facture contient des champs manquants ou non autorisés.");
  }
  return data as InvoiceCsvFields;
}

export function invoiceProjectTitle(fields: InvoiceCsvFields) {
  const title = fields.project_title.trim();
  if (!title) throw new BusinessError("Le titre du projet est obligatoire.");
  if (title.length > 160) throw new BusinessError("Le titre du projet est trop long.");
  return title;
}

export function invoiceProjectId(ids: string[]) {
  if (!ids.length) throw new BusinessError("Ce projet est introuvable dans ton espace.", 404);
  if (ids.length > 1) throw new BusinessError("Plusieurs projets correspondent à ce titre.", 409);
  return ids[0];
}

export function validateImportedInvoice(fields: InvoiceCsvFields, project_id: string) {
  const rawStatus = fields.status.trim();
  const normalized = rawStatus.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const status = Object.hasOwn(invoiceStatuses, normalized) ? normalized : frenchStatuses.get(normalized);
  if (!status) throw new BusinessError("Le statut indiqué n’est pas reconnu.");

  const rawAmount = fields.amount.trim();
  const amount = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(rawAmount) ? Number(rawAmount) : NaN;
  if (!Number.isFinite(amount)) throw new BusinessError("Saisis un montant numérique avec un point décimal.");
  if (amount <= 0) throw new BusinessError("Le montant doit être strictement supérieur à zéro.");

  const invoice = validate("invoices", {
    project_id,
    number: fields.number,
    amount,
    issued_on: fields.issued_on.trim(),
    due_on: fields.due_on.trim(),
    status,
    paid_on: fields.paid_on?.trim(),
  });
  return { invoice, converted: rawStatus !== invoice.status };
}
