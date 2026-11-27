"use client";

import { useRef, useState, type FormEvent } from "react";

import { formatDate, formatMoney } from "@/lib/domain/format";
import { analyzeInvoiceCsv, type ImportRow } from "@/lib/domain/invoice-csv";
import { invoiceCsvAllowedColumns } from "@/lib/domain/invoice-import";
import { importInvoice } from "@/lib/firebase/data";
import { useWorkspace } from "./context";
import { Badge, Modal } from "./resources";

const template = "data:text/csv;charset=utf-8," + encodeURIComponent(invoiceCsvAllowedColumns.join(",") + "\r\n");
const rowBadges = {
  valid: { label: "Valide", color: "bg-emerald-50 text-emerald-800" },
  converted: { label: "Statut converti", color: "bg-amber-50 text-amber-900" },
  rejected: { label: "Refusée", color: "bg-red-50 text-red-800" },
};

interface Rejection {
  line: number;
  number: string;
  reason: string;
}

interface ImportResult {
  total: number;
  imported: number;
  converted: number;
  rejected: Rejection[];
}

export function InvoiceImport() {
  const [open, setOpen] = useState(false);
  return <>
    <button className="button-secondary" type="button" onClick={() => setOpen(true)}>Importer un CSV</button>
    {open && <ImportDialog onClose={() => setOpen(false)} />}
  </>;
}

function Preview({ rows }: { rows: ImportRow[] }) {
  const totals = { valid: 0, converted: 0, rejected: 0 };
  for (const row of rows) totals[row.outcome] += 1;
  const summary = [
    ["Lignes analysées", rows.length], ["Valides", totals.valid], ["Corrigées", totals.converted],
    ["Refusées", totals.rejected], ["À importer", totals.valid + totals.converted],
  ];

  return <>
    <dl className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
      {summary.map(([label, value]) => <div key={label} className="flex gap-2">
        <dt>{label}</dt><dd className="font-semibold">{value}</dd>
      </div>)}
    </dl>
    <div className="table-wrap mt-4 max-h-80" role="region" aria-label="Aperçu des factures à importer" tabIndex={0}>
      <table className="data-table">
        <thead><tr>{["Ligne", "Facture", "Projet", "Montant", "Émission", "Échéance", "Paiement", "Statut", "Validation", "Détail"].map(label =>
          <th key={label} scope="col">{label}</th>,
        )}</tr></thead>
        <tbody>{rows.map(row => {
          const { fields, outcome } = row;
          const badge = rowBadges[outcome];
          const invoice = outcome === "rejected" ? null : row.invoice;
          return <tr key={row.line}>
            <td>{row.line}</td>
            <td className="wrap-anywhere">{fields.number || "—"}</td>
            <td className="wrap-anywhere">{fields.project_title || "—"}</td>
            <td className="whitespace-nowrap">{invoice ? formatMoney(invoice.amount) : fields.amount || "—"}</td>
            <td>{invoice ? formatDate(invoice.issued_on) : fields.issued_on || "—"}</td>
            <td>{invoice ? formatDate(invoice.due_on) : fields.due_on || "—"}</td>
            <td>{invoice?.paid_on ? formatDate(invoice.paid_on) : invoice?.status === "paid" ? "Date inconnue" : fields.paid_on || "—"}</td>
            <td>{invoice ? <Badge collection="invoices" status={invoice.status} /> : fields.status || "—"}</td>
            <td><span className={`badge ${badge.color}`}>{badge.label}</span></td>
            <td className="min-w-40 wrap-anywhere">
              {outcome === "rejected" ? row.reason : outcome === "converted" ? `${fields.status} → ${row.invoice.status}` : "—"}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  </>;
}

function ImportDialog({ onClose }: { onClose: () => void }) {
  const { user, projects, invoices } = useWorkspace();
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File>();
  const [error, setError] = useState("");
  const [rows, setRows] = useState<ImportRow[]>();
  const [result, setResult] = useState<ImportResult>();
  const accepted = rows?.filter(row => row.outcome !== "rejected").length ?? 0;

  function selectFile(files: FileList | null) {
    if (busy.current || !files?.length) return;
    setError(files.length === 1 ? "" : "Sélectionne un seul fichier CSV.");
    setFile(files.length === 1 ? files[0] : undefined);
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !file) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      const source = await file.arrayBuffer()
        .then(buffer => new TextDecoder("utf-8", { fatal: true }).decode(buffer))
        .catch(() => { throw new Error("Le fichier CSV ne peut pas être lu. Utilise l’encodage UTF-8."); });
      setRows(analyzeInvoiceCsv(source, projects, invoices));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Le fichier CSV ne peut pas être lu.");
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  async function confirm() {
    if (busy.current || !rows || !accepted) return;
    busy.current = true;
    setPending(true);
    const summary: ImportResult = { total: rows.length, imported: 0, converted: 0, rejected: [] };
    for (const row of rows) {
      if (row.outcome === "rejected") {
        summary.rejected.push({ line: row.line, number: row.fields.number, reason: row.reason });
        continue;
      }
      try {
        await importInvoice(user, row.fields);
        summary.imported += 1;
        if (row.outcome === "converted") summary.converted += 1;
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        summary.rejected.push({
          line: row.line, number: row.fields.number, reason: `Cette facture n’a pas pu être enregistrée.${detail}`,
        });
      }
    }
    setResult(summary);
    busy.current = false;
    setPending(false);
  }

  return (
    <Modal title={result ? "Bilan de l’importation" : rows ? "Prévisualisation des factures" : "Importer un CSV"}
      locked={pending} onClose={onClose} wide={!!rows && !result}>
      {result ? <div className="space-y-4">
        <div role="status">
          <p>{result.imported} {result.imported === 1 ? "facture importée" : "factures importées"} sur {result.total}.</p>
          <p>Statuts convertis et enregistrés {result.converted} · Lignes refusées {result.rejected.length}</p>
        </div>
        {result.rejected.length > 0 && <ul className="notice-error max-h-72 list-disc space-y-1 overflow-auto pl-7">
          {result.rejected.map(({ line, number, reason }) => <li key={line} className="wrap-anywhere">
            Ligne {line}{number && ` · ${number}`} · {reason}
          </li>)}
        </ul>}
        <div className="flex justify-end"><button className="button-secondary" type="button" onClick={onClose}>Fermer</button></div>
      </div> : rows ? <div aria-busy={pending}>
        <Preview rows={rows} />
        {pending && <p role="status" className="mt-3 text-sm">Importation en cours…</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="button-secondary" type="button" disabled={pending} onClick={onClose}>Annuler</button>
          <button className="button-secondary" type="button" disabled={pending} onClick={() => setRows(undefined)}>Revenir au fichier</button>
          <button className="button-primary" type="button" disabled={pending || !accepted} onClick={confirm}>
            {accepted === 0 ? "Importer 0 facture" : accepted === 1 ? "Importer 1 facture acceptée" : `Importer les ${accepted} factures acceptées`}
          </button>
        </div>
      </div> : <form className="space-y-4" onSubmit={analyze} aria-busy={pending}>
        <div className="rounded-lg border border-dashed border-slate-300 p-4"
          onDragOver={event => event.preventDefault()}
          onDrop={event => { event.preventDefault(); selectFile(event.dataTransfer.files); }}>
          <label htmlFor="invoice-csv" className="field-label">Fichier CSV</label>
          <input id="invoice-csv" type="file" accept=".csv,text/csv" className="block w-full max-w-full text-sm"
            disabled={pending} onChange={event => { selectFile(event.target.files); event.target.value = ""; }} />
          <p className="mt-2 text-sm text-slate-600 wrap-anywhere" role="status">{file ? `Fichier sélectionné · ${file.name}` : "Tu peux aussi déposer ton fichier ici."}</p>
        </div>
        <a className="text-action" href={template} download="modele-factures.csv">Télécharger le modèle CSV</a>
        {error && <p className="notice-error" role="alert">{error}</p>}
        {pending && <p className="text-sm" role="status">Analyse en cours…</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button className="button-secondary" type="button" disabled={pending} onClick={onClose}>Annuler</button>
          <button className="button-primary" type="submit" disabled={pending || !file}>Analyser le fichier</button>
        </div>
      </form>}
    </Modal>
  );
}
