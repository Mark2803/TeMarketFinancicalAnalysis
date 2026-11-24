// Запуск: node --test --experimental-strip-types src/chartOption.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildChartOption } from "./chartOption.ts";

const rows = [
  { month: "2026-01", revenue: 100, sold: 10, profit: null, commission: 30 },
  { month: "2026-02", revenue: 200, sold: 20, profit: 50, commission: 60 }
];

test("линейный график: у каждого показателя своя линия", () => {
  const o = buildChartOption(rows) as any;
  assert.equal(o.series.length, 4);
  assert.deepEqual(o.series.map((s: any) => s.name), ["Выручка", "Прибыль", "Комиссия Ozon", "Продано, шт."]);
  assert.ok(o.series.every((s: any) => s.type === "line"));
  assert.equal(o.xAxis.boundaryGap, false);
  assert.deepEqual(o.xAxis.data, ["янв 26", "фев 26"]);
  assert.equal(o.tooltip.axisPointer.type, "line");
});

test("штуки — на своей правой шкале, рубли — на левой", () => {
  const o = buildChartOption(rows) as any;
  assert.equal(o.yAxis.length, 2);
  assert.equal(o.series[3].yAxisIndex, 1);
  assert.ok(o.series.slice(0, 3).every((s: any) => (s.yAxisIndex ?? 0) === 0));
  assert.deepEqual(o.series[1].data, [null, 50]);
});
