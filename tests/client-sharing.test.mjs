import assert from "node:assert/strict";
import { test } from "node:test";

import { isSharePermission, validateShare } from "../lib/domain/client-sharing.ts";

test("Partage : normalise l’adresse et accepte uniquement read et edit", () => {
  assert.deepEqual(validateShare({ email: " Associé@Example.Test ", permission: "read" }, true), {
    email: "associé@example.test", permission: "read",
  });
  assert.deepEqual(validateShare({ permission: "edit" }, false), { permission: "edit" });
  for (const permission of [null, "", "READ", "owner", "constructor"]) {
    assert.equal(isSharePermission(permission), false);
    assert.throws(() => validateShare({ permission }, false), { status: 400 });
  }
});

test("Partage : rejette les adresses invalides et les champs d’identité côté navigateur", () => {
  for (const email of [null, "contact", "a@@example.test", "a b@example.test", "a".repeat(254) + "@example.test"]) {
    assert.throws(() => validateShare({ email, permission: "edit" }, true), { status: 400 });
  }
  for (const field of ["ownerId", "clientId", "sharedUserId", "email"]) {
    assert.throws(() => validateShare({ permission: "edit", [field]: "intrus" }, false), { status: 400 });
  }
});
