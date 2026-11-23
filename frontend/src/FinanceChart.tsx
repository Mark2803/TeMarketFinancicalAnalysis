import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import { buildChartOption, type ChartRow } from "./chartOption.ts";

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

/** Общий график по месяцам (настройки — chartOption.ts). Клик по названию в легенде скрывает/показывает ряд. */
export default function FinanceChart({ rows }: { rows: ChartRow[] }) {
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
    echarts.getInstanceByDom(ref.current)?.setOption(buildChartOption(rows), true);
  }, [rows]);

  return <div className="chart" ref={ref} />;
}
