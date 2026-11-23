// Запуск: node --test --experimental-strip-types src/chartOption.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChartOption } from "./chartOption.ts";

const rows = [
  { month: "2026-01", revenue: 100, sold: 10, profit: null, commission: 30 },
  { month: "2026-02", revenue: 200, sold: 20, profit: 50, commission: 60 }
];

test("один график: 4 ряда столбцов, вплотную внутри месяца, промежуток между месяцами", () => {
  const o = buildChartOption(rows) as any;
  assert.equal(o.series.length, 4);
  assert.deepEqual(o.series.map((s: any) => s.name), ["Выручка", "Прибыль", "Комиссия Ozon", "Продано, шт."]);
  assert.ok(o.series.every((s: any) => s.type === "bar"));
  assert.equal(o.series[0].barGap, "0%");
  assert.ok(parseInt(o.series[0].barCategoryGap) >= 20);
  assert.deepEqual(o.xAxis.data, ["янв 26", "фев 26"]);
});

test("штуки — на своей правой шкале, рубли — на левой", () => {
  const o = buildChartOption(rows) as any;
  assert.equal(o.yAxis.length, 2);
  assert.equal(o.series[3].yAxisIndex, 1);
  assert.ok(o.series.slice(0, 3).every((s: any) => (s.yAxisIndex ?? 0) === 0));
  assert.deepEqual(o.series[1].data.map((d: any) => d.value), [null, 50]);
});
