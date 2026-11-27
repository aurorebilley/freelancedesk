import "server-only";

import { FieldValue } from "firebase-admin/firestore";

import { validateShare } from "@/lib/domain/client-sharing";
import { isDocumentId } from "@/lib/domain/model";
import { BusinessError } from "@/lib/domain/validation";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import { clientMembers, missingResource } from "./client-access";

const hour = 60 * 60 * 1000;
const maxLookups = 20;

export async function createShare(clientId: string, ownerId: string, input: unknown) {
  const { email, permission } = validateShare(input, true);
  const db = getAdminFirestore();
  const client = db.collection("clients").doc(clientId);
  const limit = db.collection("client_share_rate_limits").doc(ownerId);
  const now = Date.now();

  // Count all lookups, including those with no matching account, across the owner's clients.
  await db.runTransaction(async tx => {
    if ((await tx.get(client)).data()?.userId !== ownerId) missingResource();
    const quota = (await tx.get(limit)).data();
    const activeWindow = quota && now - quota.startedAt < hour;
    if (activeWindow && quota.attempts >= maxLookups) {
      throw new BusinessError("Trop de recherches d’adresses e-mail. Réessaie plus tard.", 429);
    }
    tx.set(limit, activeWindow
      ? { startedAt: quota.startedAt, attempts: quota.attempts + 1 }
      : { startedAt: now, attempts: 1 });
  });

  const auth = getAdminAuth();
  const recipient = await auth.getUserByEmail(email).catch(error => {
    if (error?.code === "auth/user-not-found") return null;
    throw error;
  });
  if (!recipient || recipient.disabled || !recipient.email || !isDocumentId(recipient.uid)) {
    throw new BusinessError("Cette personne doit d’abord créer un compte FreelanceDesk actif.", 404);
  }
  if (recipient.uid === ownerId) throw new BusinessError("Tu ne peux pas partager un client avec toi-même.");
  const { email: ownerEmail } = await auth.getUser(ownerId);
  const ref = clientMembers(clientId).doc(recipient.uid);

  await db.runTransaction(async tx => {
    if ((await tx.get(client)).data()?.userId !== ownerId) missingResource();
    if ((await tx.get(ref)).exists) throw new BusinessError("Cette personne a déjà accès à ce client.", 409);
    tx.create(ref, {
      clientId, ownerId, sharedUserId: recipient.uid, permission,
      ownerEmail: ownerEmail ?? "", sharedUserEmail: recipient.email,
      createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
    });
    // Serialize grants with client deletion, including the first grant on a client.
    tx.update(client, { sharingUpdatedAt: FieldValue.serverTimestamp() });
  });
}

export async function changeShare(clientId: string, ownerId: string, recipientId: string, input?: unknown) {
  const permission = input === undefined ? undefined : validateShare(input, false).permission;
  const db = getAdminFirestore();
  const ref = clientMembers(clientId).doc(recipientId);

  await db.runTransaction(async tx => {
    const client = await tx.get(db.collection("clients").doc(clientId));
    if (client.data()?.userId !== ownerId) missingResource();
    const share = (await tx.get(ref)).data();
    if (share?.ownerId !== ownerId || share.clientId !== clientId || share.sharedUserId !== recipientId) {
      missingResource();
    }
    if (permission) tx.update(ref, { permission, updatedAt: FieldValue.serverTimestamp() });
    else tx.delete(ref);
  });
}
