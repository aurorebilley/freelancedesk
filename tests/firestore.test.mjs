import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { deleteApp, initializeApp } from "firebase/app";
import { deleteApp as deleteAdminApp, initializeApp as initializeAdminApp } from "firebase-admin/app";
import { getFirestore as getAdminFirestore } from "firebase-admin/firestore";
import { connectAuthEmulator, createUserWithEmailAndPassword, initializeAuth, inMemoryPersistence } from "firebase/auth";
import {
  collection, collectionGroup, connectFirestoreEmulator, deleteDoc, doc, getDocFromServer, getDocsFromServer,
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
let testerC;
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
    [testerA, testerB, testerC, anonymous] = await Promise.all([createAccount(), createAccount(), createAccount(), createSession()]);
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

test("Partage de clients avec trois comptes", async t => {
  const owner = testerA;
  const reader = testerB;
  const editor = testerC;
  const read = await chain(owner.user);
  const edit = await chain(owner.user);
  const privateClient = await chain(owner.user);
  const editorPersonal = await chain(editor.user);
  const sharedProjectTitle = "Projet collaboratif réservé au test";
  const otherProject = await create("projects", owner.user, { ...sampleProject(edit.client), title: sharedProjectTitle });
  for (const scope of [read, edit, privateClient]) {
    scope.invoice = await create("invoices", owner.user, sampleInvoice(scope.project));
  }
  const ownerNumber = (await getDocFromServer(doc(owner.db, "invoices", privateClient.invoice))).data().number;
  const members = client => "client_shares/" + client + "/client_share_members";
  const endpoint = client => "clients/" + client + "/shares";
  const grant = (client, recipient, permission, actor = owner.user) =>
    api("POST", endpoint(client), actor, { email: recipient.email, permission });
  const memberEndpoint = (client, recipient) => endpoint(client) + "/" + recipient.uid;
  const granted = session => query(collectionGroup(session.db, "client_share_members"), where("sharedUserId", "==", session.user.uid));

  async function expectReads(scope, session, allowed) {
    for (const [name, id] of [["clients", scope.client], ["projects", scope.project], ["invoices", scope.invoice]]) {
      const result = getDocFromServer(doc(session.db, name, id));
      if (allowed) assert.equal((await result).data().userId, owner.user.uid);
      else await expectPermissionDenied(result);
    }
  }

  async function expectScopedQueries(scope, session, allowed) {
    for (const [name, field, parent, id] of [
      ["projects", "client_id", scope.client, scope.project],
      ["invoices", "project_id", scope.project, scope.invoice],
    ]) {
      const reference = collection(session.db, name);
      const results = getDocsFromServer(query(reference, where("userId", "==", owner.user.uid), where(field, "==", parent)));
      if (allowed) assert.ok((await results).docs.some(record => record.id === id));
      else await expectPermissionDenied(results);
      await expectPermissionDenied(getDocsFromServer(query(reference, where("userId", "==", owner.user.uid))));
    }
  }

  await t.test("BON-01 — création, validation, recherche privée et partage concurrent", async () => {
    await expectStatus(await grant(read.client, reader.user, "read", null), 401);
    await expectStatus(await grant(read.client, reader.user, "admin"), 400);
    await expectStatus(await api("POST", endpoint(read.client), owner.user, { email: "invalide", permission: "read" }), 400);
    await expectStatus(await grant(read.client, { email: "absent@example.test" }, "read"), 404);
    await expectStatus(await grant(read.client, owner.user, "edit"), 400);
    await expectStatus(await grant(randomUUID(), reader.user, "read"), 404);
    await expectStatus(await grant(read.client, editor.user, "read", reader.user), 404);
    const requests = await Promise.all([
      grant(read.client, { email: " " + reader.user.email.toUpperCase() + " " }, "read"),
      grant(read.client, reader.user, "read"),
    ]);
    assert.deepEqual(requests.map(response => response.status).sort(), [201, 409],
      await Promise.all(requests.map(response => response.clone().text())).then(values => values.join(" / ")));
    await expectStatus(await grant(edit.client, editor.user, "edit"), 201);
    const list = await getDocsFromServer(collection(owner.db, members(read.client)));
    assert.equal(list.size, 1);
    assert.equal(list.docs[0].data().permission, "read");
    assert.equal(list.docs[0].data().sharedUserEmail, reader.user.email);
    assert.ok(list.docs[0].data().createdAt.toMillis() > 0);
  });

  await t.test("BON-02 — lectures ciblées, isolation des trois clients et confidentialité des partages", async () => {
    await expectReads(read, reader, true);
    await expectReads(edit, editor, true);
    await expectReads(edit, reader, false);
    await expectReads(read, editor, false);
    await expectReads(privateClient, reader, false);
    await expectReads(privateClient, editor, false);
    await expectReads(read, anonymous, false);
    await expectScopedQueries(read, reader, true);
    await expectScopedQueries(edit, editor, true);
    await expectScopedQueries(privateClient, editor, false);
    await expectScopedQueries(edit, reader, false);
    await expectPermissionDenied(getDocsFromServer(query(collection(reader.db, "clients"), where("userId", "==", owner.user.uid))));
    await expectPermissionDenied(getDocsFromServer(collectionGroup(reader.db, "client_share_members")));
    await expectPermissionDenied(getDocsFromServer(collection(reader.db, members(edit.client))));
    assert.deepEqual((await getDocsFromServer(granted(reader))).docs.map(item => item.data().clientId), [read.client]);
    assert.deepEqual((await getDocsFromServer(granted(editor))).docs.map(item => item.data().clientId), [edit.client]);
  });

  await t.test("BON-03 — interdictions API, champs protégés et absence d’écriture directe", async () => {
    await expectStatus(await api("POST", "invoices", reader.user, sampleInvoice(read.project)), 404);
    await expectStatus(await api("PUT", "invoices/" + read.invoice, reader.user, sampleInvoice(read.project)), 404);
    await expectStatus(await api("PATCH", "invoices/" + read.invoice, reader.user, { status: "paid" }), 404);
    for (const [session, scope] of [[reader, read], [editor, edit]]) {
      for (const [name, id] of [["clients", scope.client], ["projects", scope.project], ["invoices", scope.invoice]]) {
        await expectStatus(await api("DELETE", name + "/" + id, session.user), 404);
        await expectPermissionDenied(deleteDoc(doc(session.db, name, id)));
        await expectPermissionDenied(updateDoc(doc(session.db, name, id), { userId: session.user.uid }));
      }
      await expectStatus(await api("PUT", "clients/" + scope.client, session.user, { name: "Inaccessible" }), 404);
      await expectStatus(await api("PUT", "projects/" + scope.project, session.user, sampleProject(scope.client)), 404);
      await expectStatus(await api("POST", "projects", session.user, sampleProject(scope.client)), 404);
      await expectStatus(await api("PATCH", "projects/" + scope.project, session.user, { status: "done" }), 404);
      await expectStatus(await grant(scope.client, owner.user, "edit", session.user), 404);
      await expectStatus(await api("PATCH", memberEndpoint(scope.client, session.user), session.user, { permission: "edit" }), 404);
      await expectStatus(await api("DELETE", memberEndpoint(scope.client, session.user), session.user), 404);
      const share = doc(session.db, members(scope.client), session.user.uid);
      for (const field of ["ownerId", "sharedUserId", "permission"]) {
        await expectPermissionDenied(updateDoc(share, { [field]: "autre" }));
        await expectStatus(await api("PATCH", memberEndpoint(scope.client, session.user), owner.user,
          { permission: "read", [field]: "autre" }), 400);
      }
      await expectPermissionDenied(setDoc(doc(session.db, members(privateClient.client), session.user.uid), {
        ownerId: owner.user.uid, sharedUserId: session.user.uid, clientId: privateClient.client, permission: "edit",
      }));
      await expectPermissionDenied(setDoc(doc(session.db, "invoices", randomUUID()), {
        ...sampleInvoice(scope.project), userId: owner.user.uid,
      }));
    }
    await expectStatus(await api("PUT", "invoices/" + edit.invoice, editor.user,
      { ...sampleInvoice(edit.project), userId: editor.user.uid }), 400);
    for (const destination of [read.project, privateClient.project, editorPersonal.project]) {
      await expectStatus(await api("PUT", "invoices/" + edit.invoice, editor.user, sampleInvoice(destination)), 404);
    }
    await expectStatus(await api("POST", "invoices", editor.user, sampleInvoice(privateClient.project)), 404);
    await expectStatus(await api("PATCH", "invoices/" + privateClient.invoice, editor.user, { status: "paid" }), 404);
    for (const session of [reader, editor]) {
      await expectStatus(await api("POST", "invoice-import", session.user, {
        project_title: sharedProjectTitle, number: randomUUID(), amount: "350",
        issued_on: "2026-05-12", due_on: "2026-05-30", status: "Envoyée",
      }), 404);
    }
  });

  await t.test("BON-04 — édition, paiement et unicité parmi les factures du propriétaire", async () => {
    await expectStatus(await api("POST", "invoices", editor.user, sampleInvoice(edit.project, ownerNumber)), 409);
    await create("invoices", editor.user, sampleInvoice(editorPersonal.project, ownerNumber));
    const invoice = await create("invoices", editor.user, sampleInvoice(edit.project));
    await expectStatus(await api("PUT", "invoices/" + invoice, editor.user, sampleInvoice(edit.project, ownerNumber)), 409);
    const fields = sampleInvoice(otherProject);
    await expectStatus(await api("PUT", "invoices/" + invoice, editor.user, fields), 200);
    await expectStatus(await api("PATCH", "invoices/" + invoice, editor.user, { status: "paid" }), 204);
    const saved = (await getDocFromServer(doc(owner.db, "invoices", invoice))).data();
    assert.equal(saved.userId, owner.user.uid);
    assert.equal(saved.project_id, otherProject);
    assert.equal(saved.number, fields.number);
    assert.equal(saved.paid_on, todayInParis());
    const own = await getDocsFromServer(query(collection(editor.db, "invoices"), where("userId", "==", editor.user.uid)));
    assert.ok(!own.docs.some(item => item.id === invoice));
    const number = randomUUID();
    const results = await Promise.all([
      api("POST", "invoices", owner.user, sampleInvoice(privateClient.project, number)),
      api("POST", "invoices", editor.user, sampleInvoice(edit.project, number)),
    ]);
    assert.deepEqual(results.map(response => response.status).sort(), [201, 409]);
  });

  await t.test("BON-05 — changement de droit concurrent et révocation immédiatement appliquée", async () => {
    const number = randomUUID();
    const [downgrade, create] = await Promise.all([
      api("PATCH", memberEndpoint(edit.client, editor.user), owner.user, { permission: "read" }),
      api("POST", "invoices", editor.user, sampleInvoice(edit.project, number)),
    ]);
    await expectStatus(downgrade, 204);
    assert.ok([201, 404].includes(create.status), await create.text());
    assert.equal((await getDocsFromServer(granted(editor))).docs[0].data().permission, "read");
    await expectStatus(await api("PATCH", "invoices/" + edit.invoice, editor.user, { status: "paid" }), 404);
    await expectReads(edit, editor, true);
    await expectStatus(await api("PATCH", memberEndpoint(edit.client, editor.user), owner.user, { permission: "edit" }), 204);
    await expectStatus(await api("PATCH", "invoices/" + edit.invoice, editor.user, { status: "paid" }), 204);
    await expectStatus(await api("DELETE", memberEndpoint(edit.client, editor.user), owner.user), 204);
    await expectStatus(await api("DELETE", memberEndpoint(edit.client, editor.user), owner.user), 404);
    assert.ok((await getDocsFromServer(granted(editor))).empty);
    await expectReads(edit, editor, false);
    await expectScopedQueries(edit, editor, false);
    await expectStatus(await api("PATCH", "invoices/" + edit.invoice, editor.user, { status: "sent" }), 404);
    await expectReads(edit, owner, true);
    await expectReads(read, reader, true);
  });

  await t.test("BON-06 — suppression d’un client vide et de ses accès", async () => {
    const client = await create("clients", owner.user, { name: "Client partagé sans projet" });
    await expectStatus(await grant(client, reader.user, "read"), 201);
    await expectStatus(await grant(client, editor.user, "edit"), 201);
    await expectStatus(await api("DELETE", "clients/" + client, owner.user), 204);
    assert.ok((await getDocsFromServer(granted(reader))).docs.every(item => item.data().clientId !== client));
    assert.ok((await getDocsFromServer(granted(editor))).empty);
    await expectPermissionDenied(getDocFromServer(doc(editor.db, "clients", client)));
  });
});

test("BON-11 — quota par propriétaire et concurrence entre partage et suppression", async () => {
  const owner = await createAccount();
  const client = await create("clients", owner.user, { name: "Quota A" });
  const other = await create("clients", owner.user, { name: "Quota B" });
  const missing = { email: randomUUID() + "@example.test", permission: "read" };
  for (let index = 0; index < 20; index++) {
    await expectStatus(await api("POST", "clients/" + client + "/shares", owner.user, missing), 404);
  }
  await expectStatus(await api("POST", "clients/" + other + "/shares", owner.user, missing), 429);

  const freshOwner = await createAccount();
  const empty = await create("clients", freshOwner.user, { name: "Partage concurrent" });
  const [grant, deletion] = await Promise.all([
    api("POST", "clients/" + empty + "/shares", freshOwner.user, { email: testerC.user.email, permission: "edit" }),
    api("DELETE", "clients/" + empty, freshOwner.user),
  ]);
  await expectStatus(deletion, 204);
  assert.ok([201, 404].includes(grant.status), await grant.text());
  const shares = await getDocsFromServer(query(collectionGroup(testerC.db, "client_share_members"),
    where("sharedUserId", "==", testerC.user.uid)));
  assert.ok(shares.docs.every(share => share.data().clientId !== empty));
});

test("BON-12 — autorisations stockées incohérentes et anciens numéros sans réservation", async () => {
  const admin = initializeAdminApp({ projectId }, randomUUID());
  const adminDb = getAdminFirestore(admin);
  try {
    const owner = await createAccount();
    const scope = await chain(owner.user);
    const number = randomUUID();
    const invoice = await create("invoices", owner.user, sampleInvoice(scope.project, number));
    const reservation = await adminDb.collection("invoiceNumberReservations")
      .where("invoiceId", "==", invoice).get();
    assert.equal(reservation.size, 1);
    await reservation.docs[0].ref.delete();

    const member = adminDb.doc("client_shares/" + scope.client + "/client_share_members/" + testerC.user.uid);
    const valid = { clientId: scope.client, ownerId: owner.user.uid, sharedUserId: testerC.user.uid, permission: "edit" };
    for (const invalid of [
      { permission: "unknown" }, { ownerId: testerB.user.uid }, { clientId: randomUUID() },
      { sharedUserId: testerB.user.uid },
    ]) {
      await member.set({ ...valid, ...invalid });
      await expectPermissionDenied(getDocFromServer(doc(testerC.db, "clients", scope.client)));
      await expectPermissionDenied(getDocFromServer(doc(testerC.db, "invoices", invoice)));
      await expectStatus(await api("POST", "invoices", testerC.user, sampleInvoice(scope.project)), 404);
    }
    await member.set(valid);
    await expectStatus(await api("POST", "invoices", testerC.user, sampleInvoice(scope.project, number)), 409);
    await expectStatus(await api("PUT", "invoices/" + invoice, testerC.user, sampleInvoice(scope.project, number)), 200);
    assert.equal((await adminDb.collection("invoiceNumberReservations").where("invoiceId", "==", invoice).get()).size, 1);
  } finally {
    await adminDb.terminate();
    await deleteAdminApp(admin);
  }
});
