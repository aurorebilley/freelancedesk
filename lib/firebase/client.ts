import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const authEmulator = process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL;
const firestoreEmulator = process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST;
const emulatedFirestore = globalThis as typeof globalThis & {
  freelanceDeskEmulatedFirestore?: WeakSet<Firestore>;
};

function getFirebaseApp() {
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) {
    throw new Error("Configuration Firebase incomplète.");
  }
  if ((authEmulator || firestoreEmulator || config.projectId.startsWith("demo-")) &&
      (!authEmulator || !firestoreEmulator || !config.projectId.startsWith("demo-"))) {
    throw new Error("La configuration locale exige deux émulateurs et un projet demo-.");
  }

  return getApps().some(app => app.name === "[DEFAULT]") ? getApp() : initializeApp(config);
}

export function getFirebaseAuth() {
  const auth = getAuth(getFirebaseApp());
  if (authEmulator && !auth.emulatorConfig) {
    connectAuthEmulator(auth, authEmulator, { disableWarnings: true });
  }
  auth.languageCode = "fr";
  return auth;
}

export function getFirebaseFirestore() {
  const db = getFirestore(getFirebaseApp());
  if (firestoreEmulator) {
    const connections = emulatedFirestore.freelanceDeskEmulatedFirestore ??= new WeakSet();
    if (!connections.has(db)) {
      const [host, port] = firestoreEmulator.split(":");
      connectFirestoreEmulator(db, host, Number(port));
      connections.add(db);
    }
  }
  return db;
}
