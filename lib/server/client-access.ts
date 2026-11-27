import "server-only";

import type { Transaction } from "firebase-admin/firestore";

import { isDocumentId, notFoundMessage } from "@/lib/domain/model";
import { BusinessError } from "@/lib/domain/validation";
import { getAdminFirestore } from "@/lib/firebase/admin";

export function missingResource(): never {
  throw new BusinessError(notFoundMessage, 404);
}

export function clientMembers(clientId: string) {
  return getAdminFirestore().collection("client_shares").doc(clientId).collection("client_share_members");
}

export async function invoiceProject(tx: Transaction, projectId: unknown, actorId: string) {
  if (!isDocumentId(projectId)) missingResource();
  const db = getAdminFirestore();
  const ref = db.collection("projects").doc(projectId);
  const project = (await tx.get(ref)).data();
  if (!project || !isDocumentId(project.client_id) || typeof project.userId !== "string") missingResource();

  const clientId = project.client_id;
  const ownerId = project.userId;
  const client = (await tx.get(db.collection("clients").doc(clientId))).data();
  if (client?.userId !== ownerId) missingResource();

  if (actorId !== ownerId) {
    const share = (await tx.get(clientMembers(clientId).doc(actorId))).data();
    if (share?.ownerId !== ownerId || share.clientId !== clientId ||
        share.sharedUserId !== actorId || share.permission !== "edit") missingResource();
  }

  return { ref, project, clientId, ownerId };
}
