// Тест ReportBuilder.gs на строках, из-за которых падал август 2026. Запуск: node --test apps-script/reportbuilder.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const HEADER = ["ID начисления", "Дата", "Категория", "Номер отправления", "Группа отправления", "Схема", "SKU", "Количество (справочно)", "Тип услуги", "Выручка", "Комиссия", "Логистика", "Прочие начисления", "Итого Ozon", "Распределено", "Разница"];

function run(financeRows, costRows) {
  const written = {};
  const sheet = (name, values) => ({
    getName: () => name,
    getLastRow: () => values.length,
    getDataRange: () => ({ getValues: () => values.map((r) => r.slice()) }),
    getRange: (r) => ({
      setValues: (vals) => { written[name] = written[name] || []; vals.forEach((row) => written[name].push(row)); },
      setNumberFormat: () => ({}), setFontWeight: () => ({})
    }),
    clearContents() {}, clearFormats() {}, setFrozenRows() {}, setColumnWidth() {}
  });
  const sheets = {
    "API_Финансы": sheet("API_Финансы", [HEADER, ...financeRows]),
    "API_Товары": sheet("API_Товары", [["SKU", "Артикул / offer_id", "Название товара"], ["111", "A-1", "Товар 1"], ["222", "B-2", "Товар 2"]]),
    "Себестоимость": sheet("Себестоимость", [["Артикул", "Наименование", "Себестоимость"], ...costRows])
  };
  const ctx = {
    CONFIG: { SHEETS: { FINANCE: "API_Финансы", PRODUCTS: "API_Товары", COSTS: "Себестоимость", REPORT: "Отчет_по_товарам" } },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => sheets[n] || null, insertSheet: (n) => sheet(n, []) }) },
    Logger: { log() {} }
  };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL("./ReportBuilder.gs", import.meta.url), "utf8") + "\nthis.RB = ReportBuilder;", ctx);
  new ctx.RB().build();
  const rows = written["Отчет_по_товарам"];
  return { rows, total: rows.find((r) => r[1] === "ИТОГО"), bySku: (sku) => rows.find((r) => r[13] === sku) };
}

// Одно отправление, два товара. Ozon: 195,52. В «Распределено» сумма поделена неверно (190,76 и 4,76).
const AUGUST = [
  ["59100531828", "2026-08-08", "POSTING", "x-1", "x", "Fbs", "111", 1, "POSTING", 280, -50.4, -29.08, 0, 195.52, 190.76, -9.76],
  ["59100531828", "2026-08-08", "POSTING", "x-1", "x", "Fbs", "222", 1, "POSTING", 0, 0, -5, 0, "", 4.76, 9.76]
];

test("август 2026: отчёт строится, суммы по товарам — из частей начисления", () => {
  const r = run(AUGUST, [["A-1", "Товар 1", 150], ["B-2", "Товар 2", 50]]);
  assert.equal(r.bySku("111")[4], 200.52);
  assert.equal(r.bySku("222")[4], -5);
  assert.equal(r.total[4], 195.52);
  assert.equal(r.bySku("111")[11], "OK");
});

test("нет себестоимости → 100 ₽ за штуку, прибыль посчитана", () => {
  const r = run(AUGUST, [["A-1", "Товар 1", "."]]);
  assert.equal(r.bySku("111")[7], 100);
  assert.match(r.bySku("111")[12], /Нет себестоимости — взято 100 ₽/);
  assert.notEqual(r.total[9], "");
});

test("сумма Ozon не сходится ни с частями, ни с распределённым — ошибка, как раньше", () => {
  const bad = [["1", "2026-08-08", "POSTING", "y-1", "y", "Fbs", "111", 1, "POSTING", 100, 0, 0, 0, 999, 100, 0]];
  assert.throws(() => run(bad, []), /Расхождение начисления/);
});
