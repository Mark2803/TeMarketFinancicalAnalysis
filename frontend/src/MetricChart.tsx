import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { formatMonth, formatMonthShort } from "./format";

echarts.use([BarChart, GridComponent, TooltipComponent, CanvasRenderer]);

type Props = {
  months: string[];
  values: Array<number | null>;
  color: string;
  format: (n: number | null) => string;
};

const NEGATIVE = "#a33a2b";

/** Столбцы по месяцам. Отрицательные значения (например, убыток) — красные. */
export default function MetricChart({ months, values, color, format }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => { observer.disconnect(); chart.dispose(); };
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.getInstanceByDom(ref.current);
    if (!chart) return;
    const compact = new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 });
    chart.setOption({
      animationDuration: 500,
      grid: { left: 8, right: 8, top: 16, bottom: 4, containLabel: true },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (items: Array<{ dataIndex: number }>) => {
          const i = items[0]?.dataIndex ?? 0;
          return `${formatMonth(months[i])}<br/><b>${format(values[i])}</b>`;
        }
      },
      xAxis: {
        type: "category",
        data: months.map(formatMonthShort),
        axisTick: { show: false },
        axisLine: { lineStyle: { color: "#d8d0bf" } },
        axisLabel: { color: "#6b6b60", fontSize: 11 }
      },
      yAxis: {
        type: "value",
        splitLine: { lineStyle: { color: "#ece6d8" } },
        axisLabel: { color: "#6b6b60", fontSize: 11, formatter: (v: number) => compact.format(v) }
      },
      series: [{
        type: "bar",
        barMaxWidth: 36,
        data: values.map((v) => ({
          value: v,
          itemStyle: { color: v !== null && v < 0 ? NEGATIVE : color, borderRadius: v !== null && v < 0 ? [0, 0, 6, 6] : [6, 6, 0, 0] }
        }))
      }]
    }, true);
  }, [months, values, color, format]);

  return <div className="chart" ref={ref} />;
}
