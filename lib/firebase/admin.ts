import "server-only";

import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const authEmulator = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreEmulator = process.env.FIRESTORE_EMULATOR_HOST;
  const emulated = Boolean(authEmulator || firestoreEmulator);

  if (!projectId || projectId !== process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error("Les identifiants des projets Firebase Web et Admin doivent correspondre.");
  }
  if ((emulated || projectId.startsWith("demo-")) &&
      (!authEmulator || !firestoreEmulator || !projectId.startsWith("demo-"))) {
    throw new Error("Les deux émulateurs Firebase exigent un identifiant de projet demo-.");
  }

  return getApps()[0] ?? initializeApp({
    projectId,
    ...(emulated ? {} : { credential: applicationDefault() }),
  });
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminFirestore() {
  return getFirestore(getAdminApp());
}
