import "server-only";

import { createHash } from "node:crypto";
import type { DocumentReference, Transaction } from "firebase-admin/firestore";

import { invoiceProjectId, invoiceProjectTitle, readInvoiceCsvFields, validateImportedInvoice } from "@/lib/domain/invoice-import";
import { notFoundMessage, type Collection, type InvoiceInput } from "@/lib/domain/model";
import { BusinessError, validate, validateStatus } from "@/lib/domain/validation";
import { getAdminFirestore } from "@/lib/firebase/admin";

const parents = {
  clients: { count: "projectCount", blocked: "Impossible de supprimer ce client : des projets lui sont encore associés." },
  projects: { count: "invoiceCount", blocked: "Impossible de supprimer ce projet : des factures lui sont encore associées." },
} as const;

type ParentCollection = keyof typeof parents;

async function owned(tx: Transaction, ref: DocumentReference, userId: string) {
  const data = (await tx.get(ref)).data();
  if (!data || data.userId !== userId) throw new BusinessError(notFoundMessage, 404);
  return data;
}

async function readParent(tx: Transaction, collection: ParentCollection, id: string, userId: string) {
  const ref = getAdminFirestore().collection(collection).doc(id);
  const data = await owned(tx, ref, userId);
  const field = parents[collection].count;
  const count: unknown = data[field];
  if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0) {
    throw new BusinessError("Les relations de cette ressource doivent être vérifiées.", 409);
  }
  return { ref, field, count };
}

function changeCount(tx: Transaction, parent: Awaited<ReturnType<typeof readParent>>, delta: 1 | -1) {
  const count = parent.count + delta;
  if (count < 0 || !Number.isSafeInteger(count)) {
    throw new BusinessError("Les relations de cette ressource doivent être vérifiées.", 409);
  }
  tx.update(parent.ref, { [parent.field]: count });
}

function reservation(userId: string, number: string) {
  const id = createHash("sha256").update(JSON.stringify([userId, number])).digest("hex");
  return getAdminFirestore().collection("invoiceNumberReservations").doc(id);
}

async function checkReservation(
  tx: Transaction, ref: DocumentReference, userId: string, invoiceId: string,
) {
  const data = (await tx.get(ref)).data();
  if (!data || data.invoiceId !== invoiceId || data.userId !== userId) {
    throw new BusinessError("La réservation de ce numéro de facture doit être vérifiée.", 409);
  }
}

async function requireAvailableNumber(tx: Transaction, ref: DocumentReference) {
  if ((await tx.get(ref)).exists) {
    throw new BusinessError("Ce numéro de facture est déjà utilisé.", 409);
  }
}

export async function saveRecord(collection: Collection, userId: string, input: unknown, id?: string) {
  const db = getAdminFirestore();
  const ref = id ? db.collection(collection).doc(id) : db.collection(collection).doc();

  if (collection === "clients") {
    const fields = validate(collection, input);
    await db.runTransaction(async tx => {
      if (id) {
        await owned(tx, ref, userId);
        tx.update(ref, { ...fields });
      } else {
        tx.create(ref, { ...fields, userId, projectCount: 0 });
      }
    });
  } else if (collection === "projects") {
    const fields = validate(collection, input);
    await db.runTransaction(async tx => {
      const current = id ? await owned(tx, ref, userId) : undefined;
      const client = await readParent(tx, "clients", fields.client_id, userId);
      const oldClient = current && current.client_id !== fields.client_id
        ? await readParent(tx, "clients", current.client_id, userId)
        : undefined;

      if (!current || oldClient) changeCount(tx, client, 1);
      if (oldClient) changeCount(tx, oldClient, -1);
      if (current) tx.update(ref, { ...fields });
      else tx.create(ref, { ...fields, userId, invoiceCount: 0 });
    });
  } else {
    const fields = validate(collection, input);
    await db.runTransaction(tx => writeInvoice(tx, ref, userId, fields, id));
  }

  return ref.id;
}

async function writeInvoice(tx: Transaction, ref: DocumentReference, userId: string, fields: InvoiceInput, id?: string) {
  const current = id ? await owned(tx, ref, userId) : undefined;
  const project = await readParent(tx, "projects", fields.project_id, userId);
  const oldProject = current && current.project_id !== fields.project_id
    ? await readParent(tx, "projects", current.project_id, userId)
    : undefined;
  const numberRef = reservation(userId, fields.number);
  const oldNumberRef = current ? reservation(userId, current.number) : undefined;
  const numberChanged = oldNumberRef?.id !== numberRef.id;

  if (oldNumberRef) await checkReservation(tx, oldNumberRef, userId, ref.id);
  if (numberChanged) await requireAvailableNumber(tx, numberRef);

  if (numberChanged) {
    tx.create(numberRef, { userId, invoiceId: ref.id });
    if (oldNumberRef) tx.delete(oldNumberRef);
  }

  if (!current || oldProject) changeCount(tx, project, 1);
  if (oldProject) changeCount(tx, oldProject, -1);
  if (current) tx.update(ref, { ...fields });
  else tx.create(ref, { ...fields, userId });
}

export async function importInvoice(userId: string, input: unknown) {
  const fields = readInvoiceCsvFields(input);
  const title = invoiceProjectTitle(fields);
  const db = getAdminFirestore();
  const ref = db.collection("invoices").doc();

  await db.runTransaction(async tx => {
    const projectQuery = db.collection("projects").where("userId", "==", userId).where("title", "==", title).limit(2);
    const matches = await tx.get(projectQuery);
    const projectId = invoiceProjectId(matches.docs.map(project => project.id));
    const { invoice } = validateImportedInvoice(fields, projectId);

    // Older documents may already use the number without having a reservation.
    const invoiceQuery = db.collection("invoices").where("userId", "==", userId).where("number", "==", invoice.number).limit(1);
    if (!(await tx.get(invoiceQuery)).empty) throw new BusinessError("Ce numéro de facture est déjà utilisé.", 409);

    await writeInvoice(tx, ref, userId, invoice);
  });
  return ref.id;
}

export async function updateStatus(collection: Collection, userId: string, id: string, input: unknown) {
  if (collection === "clients") throw new BusinessError("Les clients n’ont pas de statut.");
  const status = validateStatus(collection, input);
  const db = getAdminFirestore();
  const ref = db.collection(collection).doc(id);
  await db.runTransaction(async tx => {
    await owned(tx, ref, userId);
    tx.update(ref, { status });
  });
}

export async function deleteRecord(collection: Collection, userId: string, id: string) {
  const db = getAdminFirestore();
  const ref = db.collection(collection).doc(id);
  await db.runTransaction(async tx => {
    if (collection === "invoices") {
      const current = await owned(tx, ref, userId);
      const project = await readParent(tx, "projects", current.project_id, userId);
      const numberRef = reservation(userId, current.number);
      await checkReservation(tx, numberRef, userId, id);
      changeCount(tx, project, -1);
      tx.delete(numberRef);
    } else {
      const resource = await readParent(tx, collection, id, userId);
      if (resource.count > 0) throw new BusinessError(parents[collection].blocked, 409);
      if (collection === "projects") {
        const current = await owned(tx, ref, userId);
        const client = await readParent(tx, "clients", current.client_id, userId);
        changeCount(tx, client, -1);
      }
    }
    tx.delete(ref);
  });
}
