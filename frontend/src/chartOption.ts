import { formatCount, formatMonth, formatMonthShort, formatRub } from "./format.ts";

export type ChartRow = {
  month: string;
  revenue: number | null;
  sold: number | null;
  profit: number | null;
  commission: number | null;
};

type SeriesDef = {
  key: "revenue" | "profit" | "commission" | "sold";
  name: string;
  color: string;
  axis: 0 | 1;
  format: (n: number | null) => string;
};

export const SERIES: SeriesDef[] = [
  { key: "revenue", name: "Выручка", color: "#2f5a34", axis: 0, format: formatRub },
  { key: "profit", name: "Прибыль", color: "#6fa77a", axis: 0, format: formatRub },
  { key: "commission", name: "Комиссия Ozon", color: "#c07a3a", axis: 0, format: formatRub },
  { key: "sold", name: "Продано, шт.", color: "#8a6a3b", axis: 1, format: formatCount }
];


/**
 * Один линейный график: у каждого показателя своя линия, точка — месяц.
 * Рубли — левая шкала, штуки — правая (иначе 800 шт. потерялись бы рядом с 480 000 ₽).
 */
export function buildChartOption(rows: ChartRow[]): Record<string, unknown> {
  const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
  const axisLabel = { color: "#6b6b60", fontSize: 11, formatter: (v: number) => compact.format(v) };

  return {
    animationDuration: 500,
    legend: { top: 0, left: 0, itemWidth: 14, itemHeight: 10, textStyle: { color: "#1f2a1f", fontSize: 13 } },
    grid: { left: 8, right: 8, top: 44, bottom: 4, containLabel: true },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: "#b9ae97" } },
      formatter: (items: Array<{ dataIndex: number; seriesIndex: number; marker: string }>) => {
        const i = items[0]?.dataIndex ?? 0;
        const lines = items.map((it) => {
          const s = SERIES[it.seriesIndex];
          const raw = rows[i][s.key];
          const text = s.key === "profit" && raw === null ? "не рассчитана" : s.format(raw);
          return `${it.marker}${s.name}: <b>${text}</b>`;
        });
        return `${formatMonth(rows[i].month)}<br/>${lines.join("<br/>")}`;
      }
    },
    xAxis: {
      type: "category",
      boundaryGap: false,
      data: rows.map((r) => formatMonthShort(r.month)),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#d8d0bf" } },
      axisLabel: { color: "#6b6b60", fontSize: 12 }
    },
    yAxis: [
      { type: "value", name: "₽", nameTextStyle: { color: "#6b6b60" }, splitLine: { lineStyle: { color: "#ece6d8" } }, axisLabel },
      { type: "value", name: "шт.", nameTextStyle: { color: "#6b6b60" }, splitLine: { show: false }, axisLabel }
    ],
    series: SERIES.map((s) => ({
      name: s.name,
      type: "line",
      yAxisIndex: s.axis,
      smooth: 0.25,
      symbol: "circle",
      symbolSize: 7,
      connectNulls: false,
      // Штуки — пунктиром: у них своя (правая) шкала.
      lineStyle: { width: s.axis === 1 ? 2 : 3, type: s.axis === 1 ? "dashed" : "solid", color: s.color },
      itemStyle: { color: s.color },
      emphasis: { focus: "series" },
      data: rows.map((r) => r[s.key])
    }))
  };
}
