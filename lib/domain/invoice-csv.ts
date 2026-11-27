import Papa from "papaparse";

import { invoiceCsvAllowedColumns, invoiceCsvColumns, invoiceProjectId, invoiceProjectTitle, validateImportedInvoice, type InvoiceCsvFields } from "./invoice-import";
import type { Invoice, InvoiceInput, Project } from "./model";

interface CsvRow {
  line: number;
  fields: InvoiceCsvFields;
  invalidWidth: boolean;
}

export type ImportRow = CsvRow & (
  | { outcome: "rejected"; reason: string }
  | { outcome: "valid" | "converted"; invoice: InvoiceInput }
);

function parseCsv(input: string): CsvRow[] {
  const source = input.replace(/^\uFEFF/, "");
  if (source.includes("\0")) throw new Error("Le fichier CSV ne peut pas être lu.");
  let columns: string[] | undefined;
  let line = 1;
  let cursor = 0;
  const rows: CsvRow[] = [];

  function headerMatches(delimiter: string) {
    const header = Papa.parse<string[]>(source, { delimiter, skipEmptyLines: "greedy", preview: 1 }).data[0] ?? [];
    return invoiceCsvColumns.filter(name => header.some(column => column.trim() === name)).length;
  }

  Papa.parse<string[]>(source, {
    delimiter: headerMatches(";") > headerMatches(",") ? ";" : ",",
    step({ data, errors, meta }) {
      if (errors.length) {
        throw new Error(`Le fichier CSV ne peut pas être lu. Vérifie les guillemets à la ligne ${line}.`);
      }
      const rowLine = line;
      line += source.slice(cursor, meta.cursor).match(/\r\n|\r|\n/g)?.length ?? 0;
      cursor = meta.cursor;
      if (data.length === 1 && !data[0].trim()) return;

      if (!columns) {
        columns = data.map(column => column.trim());
        const missing = invoiceCsvColumns.find(name => !columns?.includes(name));
        if (missing) throw new Error(`Une colonne obligatoire est manquante (${missing}).`);
        if (new Set(columns).size !== columns.length ||
            columns.some(name => !invoiceCsvAllowedColumns.some(column => column === name))) {
          throw new Error("Le fichier CSV contient une colonne supplémentaire ou en double.");
        }
        return;
      }

      const fields = Object.fromEntries(columns.map((name, index) => [name, data[index]?.trim() ?? ""])) as InvoiceCsvFields;
      rows.push({ line: rowLine, fields, invalidWidth: data.length !== columns.length });
    },
  });
  if (!rows.length) throw new Error("Le fichier CSV ne contient aucune facture.");
  return rows;
}

export function analyzeInvoiceCsv(source: string, projects: Project[], invoices: Invoice[]): ImportRow[] {
  const projectIds = new Map<string, string[]>();
  for (const project of projects) {
    const ids = projectIds.get(project.title) ?? [];
    ids.push(project.id);
    projectIds.set(project.title, ids);
  }
  const existingNumbers = new Set(invoices.map(invoice => invoice.number));
  const acceptedNumbers = new Set<string>();

  return parseCsv(source).map(row => {
    try {
      if (row.invalidWidth) throw new Error("Le nombre de colonnes est incorrect.");
      const title = invoiceProjectTitle(row.fields);
      const projectId = invoiceProjectId(projectIds.get(title) ?? []);
      const { invoice, converted } = validateImportedInvoice(row.fields, projectId);
      if (acceptedNumbers.has(invoice.number)) throw new Error("Ce numéro de facture apparaît plusieurs fois dans le fichier.");
      if (existingNumbers.has(invoice.number)) throw new Error("Ce numéro de facture est déjà utilisé.");
      acceptedNumbers.add(invoice.number);
      return { ...row, outcome: converted ? "converted" : "valid", invoice };
    } catch (error) {
      return { ...row, outcome: "rejected", reason: error instanceof Error ? error.message : "Cette ligne est invalide." };
    }
  });
}
