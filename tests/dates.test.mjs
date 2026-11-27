import assert from "node:assert/strict";
import { test } from "node:test";

import { formatDate, isCivilDate, overdueDays, todayInParis } from "../lib/domain/format.ts";

test("Dates civiles : calendrier, format en français et passage du jour à Paris", () => {
  assert.equal(isCivilDate("2024-02-29"), true);
  assert.equal(isCivilDate("2026-02-29"), false);
  assert.equal(isCivilDate("2026-2-04"), false);
  assert.equal(formatDate("2026-02-04"), "04/02/2026");
  assert.equal(todayInParis(new Date("2026-05-12T21:59:59Z")), "2026-05-12");
  assert.equal(todayInParis(new Date("2026-05-12T22:00:00Z")), "2026-05-13");
});

test("Seules les factures envoyées avant aujourd’hui sont en retard", () => {
  const today = "2026-03-30";
  assert.equal(overdueDays({ status: "sent", due_on: today }, today), 0);
  assert.equal(overdueDays({ status: "sent", due_on: "2026-03-31" }, today), 0);
  assert.equal(overdueDays({ status: "sent", due_on: "2026-03-28" }, today), 2);
  for (const status of ["draft", "paid", "cancelled"]) {
    assert.equal(overdueDays({ status, due_on: "2026-03-28" }, today), 0);
  }
});
