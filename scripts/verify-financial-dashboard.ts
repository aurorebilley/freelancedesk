import { createInterface } from "node:readline";
import { Writable } from "node:stream";

import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, inMemoryPersistence, initializeAuth, signInWithEmailAndPassword } from "firebase/auth";
import { collection, connectFirestoreEmulator, getDocsFromServer, getFirestore, query, terminate, where } from "firebase/firestore";

const euro = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const decimal = new Intl.NumberFormat("en-US", { useGrouping: false, minimumFractionDigits: 2, maximumFractionDigits: 2 });
const demoProject = "demo-freelancedesk";
const localAddress = /^127\.0\.0\.1:\d+$/;

function previousMonth(now: Date) {
  const paris = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", month: "numeric", year: "numeric" });
  const parts = paris.formatToParts(now);
  const year = Number(parts.find(part => part.type === "year")?.value);
  const month = Number(parts.find(part => part.type === "month")?.value);
  return new Date(Date.UTC(year, month - 2, 1));
}

function civilDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith("0000")) return false;
  const parsed = new Date(value + "T00:00:00Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(value + "T");
}

function readPassword() {
  const terminal = Boolean(process.stdin.isTTY);
  const silentOutput = new Writable({ write(_chunk, _encoding, done) { done(); } });
  if (terminal) process.stderr.write("Mot de passe Firebase (saisie masquée) : ");
  const input = createInterface({ input: process.stdin, output: silentOutput, terminal });
  return new Promise<string>((resolve, reject) => {
    input.once("line", password => {
      resolve(password);
      input.close();
    });
    input.once("SIGINT", () => input.close());
    input.once("close", () => {
      if (terminal) process.stderr.write("\n");
      reject(new Error("Aucun mot de passe fourni."));
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const emulator = args[0] === "--emulator";
  const email = args[emulator ? 1 : 0];
  if (args.length !== (emulator ? 2 : 1) || !email?.includes("@")) {
    throw new Error("Utilisation : node scripts/verify-financial-dashboard.ts [--emulator] adresse-e-mail");
  }

  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = emulator ? demoProject : process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = emulator ? "fake-api-key" : process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!projectId || !apiKey) throw new Error("La configuration de l’application Web Firebase manque.");
  if (emulator) {
    if (!authHost || !firestoreHost || !localAddress.test(authHost) || !localAddress.test(firestoreHost)) {
      throw new Error("Les deux émulateurs locaux sont requis.");
    }
  } else if (projectId.startsWith("demo-") || authHost || firestoreHost ||
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL || process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST) {
    throw new Error("Utilise explicitement --emulator pour une vérification locale.");
  }

  const password = await readPassword();
  if (!password) throw new Error("Aucun mot de passe fourni.");
  const app = initializeApp({ apiKey, projectId });
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  const db = getFirestore(app);

  try {
    if (emulator && authHost && firestoreHost) {
      connectAuthEmulator(auth, "http://" + authHost, { disableWarnings: true });
      const [host, port] = firestoreHost.split(":");
      connectFirestoreEmulator(db, host, Number(port));
    }
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    const month = previousMonth(new Date());
    const prefix = month.toISOString().slice(0, 7) + "-";
    const invoices = await getDocsFromServer(query(collection(db, "invoices"), where("userId", "==", user.uid)));
    const selected = invoices.docs.flatMap(doc => {
      const { userId, number, amount, issued_on, paid_on, status } = doc.data();
      if (userId !== user.uid || status !== "paid" ||
          !civilDate(paid_on) || !paid_on.startsWith(prefix) || !civilDate(issued_on) || paid_on < issued_on) return [];
      if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        throw new Error("Une facture sélectionnée possède un montant inexploitable.");
      }
      return [{ number: String(number), cents: Number(decimal.format(amount).replace(".", "")) }];
    }).sort((a, b) => a.number.localeCompare(b.number, "fr"));

    const label = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "long", year: "numeric" }).format(month);
    const total = selected.reduce((sum, invoice) => sum + invoice.cents, 0);
    console.log("Mois analysé — " + label);
    console.log("Factures retenues — " + selected.length);
    for (const invoice of selected) console.log(JSON.stringify(invoice.number) + " · " + euro.format(invoice.cents / 100));
    console.log("Chiffre d’affaires encaissé — " + euro.format(total / 100));
  } finally {
    await terminate(db);
    await deleteApp(app);
  }
}

main().catch((error: unknown) => {
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : undefined;
  console.error(code ? "Vérification impossible (" + code + ")." : error instanceof Error ? error.message : "Vérification impossible.");
  process.exitCode = 1;
});
