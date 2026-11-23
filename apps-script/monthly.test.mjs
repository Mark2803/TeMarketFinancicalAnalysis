// Тесты чистых функций Monthly.gs. Запуск: node --test apps-script/
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = { module: { exports: {} } };
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("./Monthly.gs", import.meta.url), "utf8"), ctx);
const m = ctx.module.exports;

test("monthsBetween_: январь–октябрь = 10 месяцев", () => {
  const list = m.monthsBetween_("2026-01", "2026-10");
  assert.equal(list.length, 10);
  assert.equal(list[0], "2026-01");
  assert.equal(list[9], "2026-10");
  assert.deepEqual([...m.monthsBetween_("2026-11", "2027-02")], ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.equal(m.monthsBetween_("2026-05", "2026-04").length, 0);
});

test("lastClosedMonth_: прошлый месяц, через границу года", () => {
  assert.equal(m.lastClosedMonth_(new Date(2026, 10, 23)), "2026-10");
  assert.equal(m.lastClosedMonth_(new Date(2027, 0, 1)), "2026-12");
});

test("monthBounds_: первое и последнее число", () => {
  const b = m.monthBounds_("2026-02");
  assert.equal(b.from.getDate(), 1);
  assert.equal(b.from.getMonth(), 1);
  assert.equal(b.to.getDate(), 28);
  assert.equal(m.monthBounds_("2026-12").to.getDate(), 31);
});

test("mergeHeader_: новый показатель дописывается в конец, старые столбцы не сдвигаются", () => {
  assert.deepEqual(
    [...m.mergeHeader_(["Месяц", "Дата с", "Дата по", "Обновлено", "Выручка"], ["Выручка", "Комиссия Ozon"])],
    ["Месяц", "Дата с", "Дата по", "Обновлено", "Выручка", "Комиссия Ozon"]
  );
  assert.deepEqual(
    [...m.mergeHeader_([], ["Выручка", "", "Выручка"])],
    ["Месяц", "Дата с", "Дата по", "Обновлено", "Выручка"]
  );
});

test("findValue_: по началу названия без регистра, иначе пусто", () => {
  assert.equal(m.findValue_([["Прибыль (предварительная)", 5]], "прибыль"), 5);
  assert.equal(m.findValue_([["  Выручка ", 10]], "Выручка"), 10);
  assert.equal(m.findValue_([], "Выручка"), "");
  assert.equal(m.findValue_([["Выручка", ""]], "Выручка"), "");
});
