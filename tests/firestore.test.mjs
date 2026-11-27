import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { deleteApp, initializeApp } from "firebase/app";
import { connectAuthEmulator, createUserWithEmailAndPassword, initializeAuth, inMemoryPersistence } from "firebase/auth";
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer,
  getFirestore, query, setDoc, terminate, updateDoc, where,
} from "firebase/firestore";

import { todayInParis } from "../lib/domain/format.ts";

const projectId = "demo-freelancedesk";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const dbHost = process.env.FIRESTORE_EMULATOR_HOST;
const localEndpoint = /^127\.0\.0\.1:\d+$/;
assert.match(authHost ?? "", localEndpoint, "L’émulateur Auth local est obligatoire.");
assert.match(dbHost ?? "", localEndpoint, "L’émulateur Firestore local est obligatoire.");

const server = "http://127.0.0.1:3100";
const accounts = [];
const apiKey = "fake-api-key";
let processHandle;
let testerA;
let testerB;
let anonymous;

async function createSession() {
  const sessionId = randomUUID();
  const app = initializeApp({ apiKey, projectId }, sessionId);
  const db = getFirestore(app);
  const [host, port] = dbHost.split(":");
  connectFirestoreEmulator(db, host, Number(port));
  const auth = initializeAuth(app, { persistence: inMemoryPersistence });
  connectAuthEmulator(auth, "http://" + authHost, { disableWarnings: true });
  accounts.push({ app, db });
  return { auth, db, sessionId };
}

async function createAccount() {
  const { auth, db, sessionId } = await createSession();
  const { user } = await createUserWithEmailAndPassword(auth, sessionId + "@example.test", "emulator-example-password");
  return { user, db };
}

async function api(method, path, user, data) {
  return fetch(server + "/api/" + path, {
    method,
    headers: {
      ...(user ? { authorization: "Bearer " + await user.getIdToken() } : {}),
      ...(data ? { "content-type": "application/json" } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
    signal: AbortSignal.timeout(35_000),
  });
}

async function expectStatus(response, expected) {
  assert.equal(response.status, expected, await response.clone().text());
  return response;
}

function path(collectionName, id) {
  return collectionName + "/" + id;
}

async function create(collectionName, user, data) {
  const response = await expectStatus(await api("POST", collectionName, user, data), 201);
  return (await response.json()).id;
}

const sampleProject = client_id => ({
  client_id, title: "Projet émulateur", daily_rate: 350, start_date: "2026-05-12", status: "active",
});

const sampleInvoice = (project_id, number = randomUUID()) => ({
  project_id, number, amount: 420, issued_on: "2026-05-12", due_on: "2026-05-30", status: "sent",
});

async function chain(user) {
  const client = await create("clients", user, { name: "Client émulateur" });
  const project = await create("projects", user, sampleProject(client));
  return { client, project };
}

async function expectPermissionDenied(promise) {
  await assert.rejects(promise, { code: "permission-denied" });
}

before(async () => {
  processHandle = spawn(process.execPath, [
    "node_modules/next/dist/bin/next", "dev",
    ...(process.env.FREELANCEDESK_TEST_TURBOPACK === "1" ? [] : ["--webpack"]),
    "--hostname", "127.0.0.1", "--port", "3100",
  ], {
    env: {
      ...process.env,
      NEXT_PUBLIC_FIREBASE_API_KEY: apiKey,
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: projectId + ".firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
      NEXT_PUBLIC_FIREBASE_APP_ID: "emulator-app",
      NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://" + authHost,
      NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: dbHost,
      FIREBASE_PROJECT_ID: projectId,
      FREELANCEDESK_TEST_DIST_DIR: "1",
      METADATA_SERVER_DETECTION: "none",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    assert.equal(processHandle.exitCode, null, "Le serveur de test s’est arrêté.");
    let response;
    try {
      response = await api("POST", "clients");
    } catch {
      await new Promise(resolve => setTimeout(resolve, 400));
      continue;
    }
    await expectStatus(response, 401);
    [testerA, testerB, anonymous] = await Promise.all([createAccount(), createAccount(), createSession()]);
    return;
  }
  assert.fail("Le serveur de test n’a pas démarré.");
}, { timeout: 90_000 });

after(async () => {
  processHandle?.kill();
  await Promise.all(accounts.map(async ({ app, db }) => {
    await terminate(db);
    await deleteApp(app);
  }));
});

test("Règles Firestore : lecture propriétaire, requêtes filtrées, isolation et interdiction d’écriture", async () => {
  const { user, db } = testerA;
  const other = await chain(testerB.user);
  const my = await chain(user);
  const ids = {
    clients: [my.client, other.client],
    projects: [my.project, other.project],
    invoices: [
      await create("invoices", user, sampleInvoice(my.project)),
      await create("invoices", testerB.user, sampleInvoice(other.project)),
    ],
  };

  for (const [name, [ownId, otherId]] of Object.entries(ids)) {
    const mine = doc(db, name, ownId);
    assert.equal((await getDocFromServer(mine)).data().userId, user.uid);
    await expectPermissionDenied(getDocFromServer(doc(db, name, otherId)));
    await expectPermissionDenied(getDocFromServer(doc(anonymous.db, name, ownId)));
    await expectPermissionDenied(getDocsFromServer(collection(db, name)));
    const own = await getDocsFromServer(query(collection(db, name), where("userId", "==", user.uid)));
    assert.ok(own.docs.some(item => item.id === ownId));
    assert.ok(own.docs.every(item => item.data().userId === user.uid));
    await expectPermissionDenied(getDocsFromServer(query(collection(db, name), where("userId", "==", testerB.user.uid))));
    await expectPermissionDenied(setDoc(doc(db, name, randomUUID()), { userId: user.uid }));
    await expectPermissionDenied(updateDoc(mine, { userId: testerB.user.uid }));
    await expectPermissionDenied(deleteDoc(mine));
  }

  await expectPermissionDenied(getDocsFromServer(collection(db, "invoiceNumberReservations")));
  await expectPermissionDenied(setDoc(doc(db, "invoiceNumberReservations", randomUUID()), { userId: user.uid }));
});

test("API : authentification, propriétaire immuable, changements et relations intercomptes", async () => {
  const { user } = testerA;
  const other = await chain(testerB.user);
  const invoiceId = await create("invoices", testerB.user, sampleInvoice(other.project));
  await expectStatus(await api("POST", "clients", null, { name: "Client" }), 401);
  const wrongToken = await fetch(server + "/api/clients", {
    method: "POST", headers: { authorization: "Bearer jeton-invalide" },
  });
  await expectStatus(wrongToken, 401);
  await expectStatus(await api("POST", "clients", user, { name: "Client", userId: testerB.user.uid }), 400);
  await expectStatus(await api("PUT", path("clients", other.client), user, { name: "Client" }), 404);
  await expectStatus(await api("PUT", path("projects", other.project), user, sampleProject(other.client)), 404);
  await expectStatus(await api("PUT", path("invoices", invoiceId), user, sampleInvoice(other.project)), 404);
  await expectStatus(await api("PATCH", path("projects", other.project), user, { status: "done" }), 404);
  await expectStatus(await api("PATCH", path("invoices", invoiceId), user, { status: "paid" }), 404);
  for (const [name, id] of [["clients", other.client], ["projects", other.project], ["invoices", invoiceId]]) {
    await expectStatus(await api("DELETE", path(name, id), user), 404);
  }
  await expectStatus(await api("POST", "projects", user, sampleProject(other.client)), 404);
  await expectStatus(await api("POST", "invoices", user, sampleInvoice(other.project)), 404);
  const mine = await chain(user);
  const myInvoice = await create("invoices", user, sampleInvoice(mine.project));
  await expectStatus(await api("PUT", path("clients", mine.client), user, { name: "Client", userId: user.uid }), 400);
  await expectStatus(await api("PUT", path("projects", mine.project), user, sampleProject(other.client)), 404);
  await expectStatus(await api("PUT", path("invoices", myInvoice), user, sampleInvoice(other.project)), 404);
});

test("API : validation des champs, des dates, des montants et des statuts", async () => {
  const { user, db } = testerA;
  const { client, project } = await chain(user);
  await expectStatus(await api("POST", "clients", user, { name: " " }), 400);
  await expectStatus(await api("POST", "clients", user, { name: "Client", email: "invalide" }), 400);
  const invalidProjects = [
    { title: "" }, { daily_rate: 0 }, { daily_rate: -1 }, { status: "en cours" }, { start_date: "2026-02-30" },
  ];
  for (const fields of invalidProjects) {
    await expectStatus(await api("POST", "projects", user, { ...sampleProject(client), ...fields }), 400);
  }
  const invalidInvoices = [
    { amount: 0 }, { amount: -10 }, { status: "overdue" }, { due_on: "2026-05-11" }, { number: " " },
  ];
  for (const fields of invalidInvoices) {
    await expectStatus(await api("POST", "invoices", user, { ...sampleInvoice(project), ...fields }), 400);
  }
  const invoice = await create("invoices", user, { ...sampleInvoice(project), due_on: "2026-05-12" });
  await expectStatus(await api("PATCH", path("invoices", invoice), user, { status: "overdue" }), 400);
  await expectStatus(await api("PATCH", path("invoices", invoice), user, { status: "paid" }), 204);
  await expectStatus(await api("PATCH", path("projects", project), user, { status: "done" }), 204);
  assert.equal((await getDocFromServer(doc(db, "invoices", invoice))).data().status, "paid");
  assert.equal((await getDocFromServer(doc(db, "projects", project))).data().status, "done");
});

test("Factures : enregistrement, correction et réinitialisation de la date de paiement", async () => {
  const { user, db } = await createAccount();
  const { project } = await chain(user);
  const fields = sampleInvoice(project);
  const id = await create("invoices", user, fields);
  const invoicePath = path("invoices", id);
  const data = async invoiceId => (await getDocFromServer(doc(db, "invoices", invoiceId))).data();
  assert.equal(await data(id).then(record => Object.hasOwn(record, "paid_on")), false);
  const draft = await create("invoices", user, { ...sampleInvoice(project), status: "draft" });
  assert.equal(await data(draft).then(record => Object.hasOwn(record, "paid_on")), false);

  const today = todayInParis();
  const directlyPaid = await create("invoices", user, { ...sampleInvoice(project), status: "paid" });
  assert.equal((await data(directlyPaid)).paid_on, today);
  const paid = { ...fields, status: "paid" };
  const paidOn = "2026-05-19";
  await expectStatus(await api("PATCH", invoicePath, user, { status: "paid" }), 204);
  assert.equal((await data(id)).paid_on, today);
  for (const invalid of ["2026-02-29", "2026-05-11", "2026-5-19", null]) {
    await expectStatus(await api("PUT", invoicePath, user, { ...paid, paid_on: invalid }), 400);
  }
  await expectStatus(await api("PUT", invoicePath, user, { ...fields, paid_on: paidOn }), 400);
  await expectStatus(await api("PUT", invoicePath, user, { ...paid, paid_on: paidOn }), 200);
  assert.equal((await data(id)).paid_on, paidOn);
  await expectStatus(await api("PUT", invoicePath, user, { ...paid, amount: 25 }), 200);
  await expectStatus(await api("PATCH", invoicePath, user, { status: "paid" }), 204);
  assert.equal((await data(id)).paid_on, paidOn);
  await expectStatus(await api("PUT", invoicePath, user, { ...paid, issued_on: "2026-05-20" }), 400);
  assert.equal((await data(id)).paid_on, paidOn);

  await expectStatus(await api("PUT", invoicePath, user, { ...fields, status: "draft" }), 200);
  assert.equal(Object.hasOwn(await data(id), "paid_on"), false);
  await expectStatus(await api("PUT", invoicePath, user, paid), 200);
  assert.equal((await data(id)).paid_on, today);
  await expectStatus(await api("PATCH", invoicePath, user, { status: "cancelled" }), 204);
  assert.equal(Object.hasOwn(await data(id), "paid_on"), false);

  const nextDay = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
  const future = { ...sampleInvoice(project), issued_on: nextDay, due_on: nextDay };
  const futureId = await create("invoices", user, future);
  await expectStatus(await api("PATCH", path("invoices", futureId), user, { status: "paid" }), 400);
  assert.equal((await data(futureId)).status, "sent");
});

test("Import CSV : dates payées valides, lignes rejetées et compatibilité historique", async () => {
  const { user, db } = await createAccount();
  const { project } = await chain(user);
  const fields = {
    project_title: "Projet émulateur", number: "TP6-HIST", amount: "33.33",
    issued_on: "2026-05-12", due_on: "2026-05-31", status: "Payée",
  };
  const historicalId = await create("invoice-import", user, fields);
  const stored = async id => (await getDocFromServer(doc(db, "invoices", id))).data();
  const historical = { ...sampleInvoice(project, fields.number), status: "paid" };
  await expectStatus(await api("PUT", path("invoices", historicalId), user, historical), 200);
  assert.equal(Object.hasOwn(await stored(historicalId), "paid_on"), false);
  await expectStatus(await api("PATCH", path("invoices", historicalId), user, { status: "paid" }), 204);
  assert.equal(Object.hasOwn(await stored(historicalId), "paid_on"), false);
  await expectStatus(await api("PUT", path("invoices", historicalId), user, { ...historical, paid_on: "2026-05-14" }), 200);
  assert.equal((await stored(historicalId)).paid_on, "2026-05-14");

  const dated = { ...fields, number: "TP6-DATED", paid_on: "2026-05-23" };
  const datedId = await create("invoice-import", user, dated);
  assert.equal((await stored(datedId)).paid_on, dated.paid_on);
  await expectStatus(await api("POST", "invoice-import", user, dated), 409);
  const blankId = await create("invoice-import", user, { ...fields, number: "TP6-BLANK", paid_on: "" });
  assert.equal(Object.hasOwn(await stored(blankId), "paid_on"), false);
  for (const changes of [
    { paid_on: "2026-02-30" }, { paid_on: "2026-05-10" },
    { paid_on: dated.paid_on, status: "Envoyée" }, { paid_on: 20260523 },
  ]) {
    await expectStatus(await api("POST", "invoice-import", user, { ...fields, number: "TP6-REJECTED", ...changes }), 400);
  }
  const invoices = await getDocsFromServer(query(collection(db, "invoices"), where("userId", "==", user.uid)));
  assert.equal(invoices.size, 3);
});

test("API : unicité concurrente par compte, renumérotation et libération du numéro", async () => {
  const { user } = testerA;
  const { project } = await chain(user);
  const number = randomUUID();
  const values = sampleInvoice(project, number);
  const results = await Promise.all([api("POST", "invoices", user, values), api("POST", "invoices", user, { ...values, number: " " + number + " " })]);
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const invoice = (await results.find(result => result.status === 201).json()).id;
  assert.match((await results.find(result => result.status === 409).json()).error, /déjà utilisé/);
  const other = await chain(testerB.user);
  await create("invoices", testerB.user, sampleInvoice(other.project, number));
  const otherNumber = randomUUID();
  const second = await create("invoices", user, sampleInvoice(project, otherNumber));
  await expectStatus(await api("PUT", path("invoices", invoice), user, { ...values, number: otherNumber }), 409);
  await expectStatus(await api("PUT", path("invoices", invoice), user, { ...values, number: otherNumber + " bis" }), 200);
  await create("invoices", user, values);
  await expectStatus(await api("DELETE", path("invoices", second), user), 204);
  await create("invoices", user, sampleInvoice(project, otherNumber));
});

test("Import CSV : titre résolu sur le seul compte connecté et payload contrôlé", async () => {
  const title = "Identité visuelle de démonstration";
  const owner = await createAccount();
  const other = await createAccount();
  const { client } = await chain(owner.user);
  const project = await create("projects", owner.user, { ...sampleProject(client), title });
  const fields = {
    project_title: title, number: " " + randomUUID() + " ", amount: "350.50",
    issued_on: "2026-11-01", due_on: "2026-11-30", status: " PAYÉE ",
  };
  await expectStatus(await api("POST", "invoice-import", null, fields), 401);

  const otherResult = await expectStatus(await api("POST", "invoice-import", other.user, fields), 404);
  const absent = await expectStatus(await api("POST", "invoice-import", other.user, { ...fields, project_title: "Titre absent" }), 404);
  assert.deepEqual(await otherResult.json(), await absent.json());
  await expectStatus(await api("POST", "invoice-import", other.user, { ...fields, project_id: project }), 400);
  await expectStatus(await api("POST", "invoice-import", other.user, { ...fields, userId: owner.user.uid }), 400);
  const unauthorized = await getDocsFromServer(query(collection(other.db, "invoices"), where("userId", "==", other.user.uid)));
  assert.ok(unauthorized.empty);

  for (const invalid of [{ amount: "-1" }, { amount: "0x20" }, { status: "Inconnu" },
    { issued_on: "2026-11-31" }, { due_on: "2026-10-01" }, { number: " " }]) {
    await expectStatus(await api("POST", "invoice-import", owner.user, { ...fields, ...invalid }), 400);
  }

  const invoice = await create("invoice-import", owner.user, fields);
  const stored = doc(owner.db, "invoices", invoice);
  assert.deepEqual((await getDocFromServer(stored)).data(), {
    userId: owner.user.uid, project_id: project, number: fields.number.trim(), amount: 350.50,
    issued_on: fields.issued_on, due_on: fields.due_on, status: "paid",
  });
  assert.equal((await getDocFromServer(doc(owner.db, "projects", project))).data().invoiceCount, 1);
  await expectPermissionDenied(getDocFromServer(doc(other.db, "invoices", invoice)));
  await expectStatus(await api("POST", "invoice-import", owner.user, { ...fields, amount: "10" }), 409);
  assert.equal((await getDocFromServer(stored)).data().amount, 350.50);

  await create("projects", owner.user, { ...sampleProject(client), title });
  const ambiguous = await expectStatus(await api("POST", "invoice-import", owner.user, { ...fields, number: randomUUID() }), 409);
  assert.match((await ambiguous.json()).error, /Plusieurs projets/);

  const otherChain = await chain(other.user);
  await create("projects", other.user, { ...sampleProject(otherChain.client), title });
  await create("invoice-import", other.user, fields);
});

test("Import CSV : le numéro est réservé en transaction même lors de demandes simultanées", async () => {
  const { user, db } = await createAccount();
  const { project } = await chain(user);
  const number = randomUUID();
  const fields = {
    project_title: "Projet émulateur", number, amount: "40.50",
    issued_on: "2026-11-01", due_on: "2026-11-30", status: "Envoyée",
  };
  const responses = await Promise.all([api("POST", "invoice-import", user, fields), api("POST", "invoice-import", user, fields)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const id = (await responses.find(response => response.status === 201).json()).id;
  assert.equal((await getDocFromServer(doc(db, "invoices", id))).data().status, "sent");
  assert.equal((await getDocFromServer(doc(db, "projects", project))).data().invoiceCount, 1);
  await expectStatus(await api("POST", "invoices", user, sampleInvoice(project, number)), 409);
});

test("API : suppressions bloquées, déplacements, puis suppressions sans cascade", async () => {
  const { user, db } = testerA;
  const first = await chain(user);
  const next = await chain(user);
  const invoice = await create("invoices", user, sampleInvoice(first.project));
  await expectStatus(await api("DELETE", path("projects", first.project), user), 409);
  await expectStatus(await api("DELETE", path("clients", first.client), user), 409);
  await expectStatus(await api("PATCH", path("projects", first.project), user, { status: "cancelled" }), 204);
  await expectStatus(await api("DELETE", path("clients", first.client), user), 409);
  await expectStatus(await api("PUT", path("projects", first.project), user, sampleProject(next.client)), 200);
  await expectStatus(await api("DELETE", path("clients", first.client), user), 204);
  await expectStatus(await api("PUT", path("invoices", invoice), user, sampleInvoice(next.project)), 200);
  await expectStatus(await api("DELETE", path("projects", first.project), user), 204);
  assert.equal((await getDocFromServer(doc(db, "invoices", invoice))).data().project_id, next.project);
  await expectStatus(await api("DELETE", path("projects", next.project), user), 409);
  await expectStatus(await api("DELETE", path("invoices", invoice), user), 204);
  await expectStatus(await api("DELETE", path("projects", next.project), user), 204);
  await expectStatus(await api("DELETE", path("clients", next.client), user), 204);
});

test("API : si création enfant et suppression du parent se croisent, aucune donnée orpheline", async () => {
  const { user } = testerA;
  const { client, project } = await chain(user);
  const spare = await create("clients", user, { name: "Client concurrent" });
  for (const [child, parent, parentId, input] of [
    ["projects", "clients", spare, sampleProject(spare)],
    ["invoices", "projects", project, sampleInvoice(project)],
  ]) {
    const [insert, remove] = await Promise.all([
      api("POST", child, user, input),
      api("DELETE", path(parent, parentId), user),
    ]);
    if (insert.status === 201) {
      await expectStatus(remove, 409);
      const { id } = await insert.json();
      await expectStatus(await api("DELETE", path(child, id), user), 204);
      await expectStatus(await api("DELETE", path(parent, parentId), user), 204);
    } else {
      await expectStatus(insert, 404);
      await expectStatus(remove, 204);
    }
  }
  await expectStatus(await api("DELETE", path("clients", client), user), 204);
});
