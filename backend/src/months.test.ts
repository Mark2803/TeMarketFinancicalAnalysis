// Запуск: node --test --experimental-strip-types src/months.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMonths } from "./months.ts";

const header = ["Месяц", "Дата с", "Дата по", "Обновлено", "выручка ", "Продано, шт. (предварительно)", "Прибыль (предварительная)", "Комиссия Ozon"];

test("parseMonths: пропускает пустые и битые строки, сортирует по месяцу", () => {
  const rows = parseMonths([
    header,
    ["2026-02", "01.02.2026", "28.02.2026", "01.03.2026 06:00", 200, 20, 50, -449885.24],
    ["", "", "", "", 1, 1, 1, 1],
    ["мусор", "", "", "", 1, 1, 1, 1],
    ["2026-01", "01.01.2026", "31.01.2026", "", 100, 10, 30, -10]
  ]);
  assert.deepEqual(rows.map((r) => r.month), ["2026-01", "2026-02"]);
  assert.equal(rows[1].revenue, 200);
  assert.equal(rows[1].sold, 20);
  assert.equal(rows[1].profit, 50);
  assert.equal(rows[1].commission, 449885.24);
  assert.equal(rows[0].from, "01.01.2026");
  assert.equal(rows[1].values["Комиссия Ozon"], -449885.24);
});

test("parseMonths: нет столбца или пустое значение → null", () => {
  const rows = parseMonths([
    ["Месяц", "Дата с", "Дата по", "Обновлено", "Выручка"],
    ["2026-03", "", "", "", ""]
  ]);
  assert.equal(rows[0].profit, null);
  assert.equal(rows[0].revenue, null);
});

test("parseMonths: пустой лист", () => {
  assert.deepEqual(parseMonths([]), []);
});
