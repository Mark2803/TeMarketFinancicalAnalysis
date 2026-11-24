// Запуск: node --test --experimental-strip-types src/monthRange.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { clickMonth, presetRange, shiftMonth } from "./monthRange.ts";

const available = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];

test("clickMonth: первый клик — начало, второй — конец; если раньше начала — меняются местами", () => {
  let r = clickMonth({ from: "2026-01", to: "2026-10", picking: false }, "2026-03");
  assert.deepEqual(r, { from: "2026-03", to: "2026-03", picking: true });
  r = clickMonth(r, "2026-07");
  assert.deepEqual(r, { from: "2026-03", to: "2026-07", picking: false });
  r = clickMonth(clickMonth(r, "2026-08"), "2026-05");
  assert.deepEqual(r, { from: "2026-05", to: "2026-08", picking: false });
});

test("shiftMonth: сдвиг по месяцам через год", () => {
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-10", -5), "2026-05");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
});

test("presetRange: весь период, этот год, последние N месяцев — в пределах данных", () => {
  assert.deepEqual(presetRange("all", available), { from: "2026-01", to: "2026-10" });
  assert.deepEqual(presetRange("year", available), { from: "2026-01", to: "2026-10" });
  assert.deepEqual(presetRange(3, available), { from: "2026-08", to: "2026-10" });
  assert.deepEqual(presetRange(12, available), { from: "2026-01", to: "2026-10" });
  assert.equal(presetRange(3, []), null);
});
