import type { User } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";

import type { InvoiceCsvFields } from "@/lib/domain/invoice-import";
import type { Collection, RecordByCollection } from "@/lib/domain/model";
import { getFirebaseFirestore } from "./client";

export function subscribeToRecords<K extends Collection>(
  name: K, uid: string, receive: (records: RecordByCollection[K][]) => void, onError: () => void,
) {
  const ownQuery = query(collection(getFirebaseFirestore(), name), where("userId", "==", uid));
  return onSnapshot(ownQuery, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache) return;
    receive(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as RecordByCollection[K]));
  }, onError);
}

async function requestMutation(
  user: User,
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  data?: unknown,
) {
  let response: Response;
  try {
    const token = await user.getIdToken();
    response = await fetch("/api/" + path, {
      method,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
  } catch {
    throw new Error("La connexion a été interrompue. Vérifie ton accès à Internet et réessaie.");
  }
  if (!response.ok) {
    const payload: { error?: string } | null = await response.json().catch(() => null);
    throw new Error(payload?.error ?? "L’opération a échoué. Réessaie dans un instant.");
  }
}

export function mutate(
  user: User,
  collection: Collection,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  id?: string,
  data?: unknown,
) {
  return requestMutation(user, collection + (id ? "/" + encodeURIComponent(id) : ""), method, data);
}

export function importInvoice(user: User, fields: InvoiceCsvFields) {
  return requestMutation(user, "invoice-import", "POST", fields);
}
