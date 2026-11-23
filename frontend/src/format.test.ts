// Запуск: node --test --experimental-strip-types src/format.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatRub, formatCount, formatMonth, formatMonthShort, deltaPercent } from "./format.ts";

const nbsp = (s: string) => s.replace(/[  ]/g, " ");

test("formatRub: целые рубли с пробелами", () => {
  assert.equal(nbsp(formatRub(1271200.8)), "1 271 201 ₽");
  assert.equal(nbsp(formatRub(null)), "—");
});

test("formatCount: штуки", () => {
  assert.equal(nbsp(formatCount(1963)), "1 963 шт.");
});

test("formatMonth: название месяца", () => {
  assert.equal(formatMonth("2026-03"), "Март 2026");
  assert.equal(formatMonthShort("2026-03"), "мар 26");
});

test("deltaPercent: изменение к прошлому месяцу", () => {
  assert.equal(deltaPercent(110, 100), 10);
  assert.equal(deltaPercent(50, 0), null);
  assert.equal(deltaPercent(50, null), null);
  assert.equal(deltaPercent(-50, -100), 50);
});
