/* eslint-disable @typescript-eslint/no-require-imports -- Ce scénario charge un Playwright facultatif via NODE_PATH. */
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { chromium, devices, webkit } = require("playwright");

const origin = "http://127.0.0.1:3100";
const project = "demo-freelancedesk";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const dbHost = process.env.FIRESTORE_EMULATOR_HOST;
for (const endpoint of [authHost, dbHost]) assert.match(endpoint, /^127\.0\.0\.1:\d+$/);
const password = "emulator-example-password";

const nextBin = "node_modules/next/dist/bin/next";
const env = {
  ...process.env,
  NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: project + ".firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: project,
  NEXT_PUBLIC_FIREBASE_APP_ID: "emulator-app",
  NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL: "http://" + authHost,
  NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST: dbHost,
  FIREBASE_PROJECT_ID: project,
  FREELANCEDESK_TEST_DIST_DIR: "1",
};
let server;

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    assert.equal(server.exitCode, null);
    try {
      if ((await fetch(origin + "/login", { signal: AbortSignal.timeout(15_000) })).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  throw new Error("Serveur Next.js indisponible.");
}

async function account(browser, options) {
  const email = randomUUID() + "@example.test";
  const page = await browser.newPage(options);
  page.setDefaultTimeout(25_000);
  await page.goto(origin + "/register");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByLabel("Confirme ton mot de passe").fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await page.getByRole("heading", { name: "Tableau de bord", exact: true }).waitFor();
  const response = await fetch("http://" + authHost + "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  assert.equal(response.status, 200);
  const { idToken } = await response.json();
  const api = async (path, fields) => {
    const result = await fetch(origin + "/api/" + path, {
      method: "POST", headers: { Authorization: "Bearer " + idToken, "Content-Type": "application/json" },
      body: JSON.stringify(fields), signal: AbortSignal.timeout(25_000),
    });
    assert.equal(result.status, 201, await result.clone().text());
    return (await result.json()).id;
  };
  return { page, email, api };
}

async function chain(owner, suffix) {
  const name = "Client " + suffix;
  const title = "Mission " + suffix;
  const number = "FAC-" + suffix;
  const client = await owner.api("clients", { name });
  const project = await owner.api("projects", {
    client_id: client, title, start_date: "2026-05-12", status: "active", daily_rate: 300,
  });
  const invoice = await owner.api("invoices", {
    project_id: project, number, amount: 350, issued_on: "2026-05-12", due_on: "2026-06-12", status: "sent",
  });
  return { client, project, invoice, name, title, number };
}

async function share(page, name, email, permission) {
  await page.getByRole("button", { name: "Partager " + name }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Adresse e-mail de l’associé").fill(email);
  await dialog.getByLabel("Niveau d’accès").selectOption(permission);
  const reply = page.waitForResponse(response =>
    response.request().method() === "POST" && new URL(response.url()).pathname.endsWith("/shares"));
  await dialog.getByRole("button", { name: "Partager", exact: true }).click();
  assert.equal((await reply).status(), 201);
  await dialog.waitFor({ state: "hidden" });
}

async function denied(page, url) {
  await page.goto(origin + url);
  await page.getByRole("heading", { name: "Ressource introuvable" }).waitFor();
  assert.ok(await page.getByRole("link", { name: /Clients|Projets|Factures/ }).first().isVisible());
}

async function check(engine, launchOptions, browserOptions, label) {
  const browser = await engine.launch(launchOptions);
  try {
    const [owner, reader, editor] = await Promise.all([
      account(browser, browserOptions), account(browser, browserOptions), account(browser, browserOptions),
    ]);
    const [a, b, c] = await Promise.all([chain(owner, "Lecture"), chain(owner, "Édition"), chain(owner, "Privé")]);
    await owner.page.goto(origin + "/clients");
    await share(owner.page, a.name, reader.email, "read");
    await share(owner.page, b.name, editor.email, "edit");
    const { page: readPage } = reader;
    const { page: editPage } = editor;
    await readPage.goto(origin + "/clients");
    const shared = readPage.getByRole("region", { name: "Clients partagés avec moi" });
    const row = shared.getByRole("row").filter({ hasText: a.name });
    await row.getByText("Lecture seule", { exact: true }).waitFor();
    assert.match(await row.innerText(), new RegExp(owner.email));
    assert.equal(await row.getByRole("button").count(), 0);
    assert.equal(await shared.getByRole("link", { name: b.name, exact: true }).count(), 0);
    await readPage.goto(origin + "/projects/" + a.project);
    await readPage.getByRole("heading", { name: a.title }).waitFor();
    assert.equal(await readPage.getByRole("button", { name: "Créer une facture", exact: true }).count(), 0);
    await readPage.goto(origin + "/invoices/" + a.invoice);
    await readPage.getByRole("heading", { name: a.number }).waitFor();
    assert.equal(await readPage.getByRole("button", { name: "Modifier", exact: true }).count(), 0);
    console.log("BON-07 PASS", label);
    await denied(readPage, "/clients/" + b.client);
    await denied(readPage, "/projects/" + c.project);
    await denied(readPage, "/invoices/" + c.invoice);
    console.log("BON-08 PASS", label);

    await editPage.goto(origin + "/invoices");
    await editPage.getByRole("link", { name: b.number }).waitFor();
    assert.equal(await editPage.getByRole("link", { name: a.number }).count(), 0);
    await editPage.getByRole("button", { name: "Créer une facture", exact: true }).click();
    const create = editPage.getByRole("dialog");
    const options = await create.getByLabel("Projet", { exact: true }).locator("option").allTextContents();
    assert.equal(options.length, 2);
    assert.ok(options[1].includes(b.title));
    await create.getByLabel("Numéro de facture").fill("FAC-COLLAB");
    await create.getByLabel("Montant (€)").fill("123");
    await create.getByLabel("Projet", { exact: true }).selectOption(b.project);
    await create.getByRole("button", { name: "Enregistrer", exact: true }).click();
    await create.waitFor({ state: "hidden" });
    await editPage.getByRole("link", { name: "FAC-COLLAB" }).click();
    assert.equal(await editPage.getByRole("button", { name: "Supprimer", exact: true }).count(), 0);
    await editPage.getByLabel("Modifier le statut").selectOption("paid");
    await editPage.getByRole("button", { name: "Appliquer" }).click();
    await editPage.getByText("Date de paiement", { exact: true }).waitFor();
    await editPage.goto(origin + "/finances");
    const total = page => page.locator("dl > div").filter({ has: page.getByText("Total encaissé", { exact: true }) }).locator("dd").first();
    await total(editPage).waitFor();
    assert.match(await total(editPage).innerText(), /^0,00/);
    await owner.page.goto(origin + "/finances");
    await total(owner.page).waitFor();
    assert.match(await total(owner.page).innerText(), /^123,00/);
    console.log("BON-09 PASS", label);

    await owner.page.goto(origin + "/clients/" + b.client);
    await editPage.goto(origin + "/invoices/" + b.invoice);
    await editPage.getByRole("button", { name: "Modifier", exact: true }).click();
    await editPage.getByRole("dialog").waitFor();
    await owner.page.getByRole("button", { name: "Modifier l’accès de " + editor.email }).click();
    const change = owner.page.getByRole("dialog");
    await change.getByLabel("Niveau d’accès").selectOption("read");
    await change.getByRole("button", { name: "Enregistrer" }).click();
    await change.waitFor({ state: "hidden" });
    await editPage.getByRole("dialog").waitFor({ state: "hidden" });
    await editPage.getByText("Lecture seule", { exact: true }).waitFor();
    await owner.page.getByRole("button", { name: "Révoquer l’accès de " + editor.email }).click();
    const revoke = owner.page.getByRole("dialog");
    await revoke.getByRole("button", { name: "Annuler" }).click();
    await editPage.getByRole("heading", { name: b.number }).waitFor();
    await owner.page.getByRole("button", { name: "Révoquer l’accès de " + editor.email }).click();
    await revoke.getByRole("button", { name: "Révoquer", exact: true }).click();
    await editPage.getByRole("heading", { name: "Ressource introuvable" }).waitFor();
    await denied(editPage, "/clients/" + b.client);
    await denied(editPage, "/projects/" + b.project);
    await editPage.goto(origin + "/clients");
    await editPage.getByText("Aucun client partagé avec toi.", { exact: true }).waitFor();
    await editPage.goto(origin + "/invoices");
    await editPage.getByText("Tu n’as encore aucune facture.", { exact: true }).waitFor();
    await readPage.goto(origin + "/invoices/" + a.invoice);
    await readPage.getByRole("heading", { name: a.number }).waitFor();
    console.log("BON-10 PASS", label);
  } finally {
    await browser.close();
  }
}

(async () => {
  const build = spawnSync(process.execPath, [nextBin, "build", "--webpack"], { env, stdio: "inherit" });
  if (build.error) throw build.error;
  assert.equal(build.status, 0, "Le build de recette a échoué.");
  server = spawn(process.execPath, [nextBin, "start", "--hostname", "127.0.0.1", "--port", "3100"], {
    env, stdio: ["ignore", "inherit", "inherit"],
  });
  await waitForServer();
  const executablePath = process.env.FREELANCEDESK_CHROMIUM_PATH;
  await check(chromium, executablePath ? { executablePath } : {}, {}, "Chromium");
  await check(webkit, {}, devices["iPhone 13"], "WebKit, profil iPhone 13");
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => server?.kill());
