/**
 * Разбор листа «Помесячно» (его ведёт скрипт таблицы Monthly.gs).
 * Строка 1 — заголовок: Месяц | Дата с | Дата по | Обновлено | показатели «Главной».
 */
export type MonthRow = {
  month: string; // 2026-01
  from: string;
  to: string;
  updated: string;
  revenue: number | null; // Выручка
  sold: number | null; // Продано, шт.
  profit: number | null; // Прибыль
  commission: number | null; // Комиссия Ozon, модулем (в таблице она с минусом)
  values: Record<string, number | null>; // все показатели как в таблице
};

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

function toNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function parseMonths(values: unknown[][]): MonthRow[] {
  if (values.length < 2) return [];
  const header = values[0].map((h) => String(h ?? "").trim());
  // Столбец показателя ищем по началу названия: «Прибыль (предварительная)» найдётся по «прибыль».
  const col = (prefix: string) => header.findIndex((h, i) => i >= 4 && norm(h).startsWith(prefix));
  const iRevenue = col("выручка");
  const iSold = col("продано");
  const iProfit = col("прибыль");
  const iCommission = col("комиссия");
  const pick = (row: unknown[], i: number) => (i === -1 ? null : toNumber(row[i]));

  const rows: MonthRow[] = [];
  for (const row of values.slice(1)) {
    const month = String(row[0] ?? "").trim();
    if (!MONTH_RE.test(month)) continue;
    const all: Record<string, number | null> = {};
    header.forEach((h, i) => { if (i >= 4 && h) all[h] = toNumber(row[i]); });
    const commission = pick(row, iCommission);
    rows.push({
      month,
      from: String(row[1] ?? ""),
      to: String(row[2] ?? ""),
      updated: String(row[3] ?? ""),
      revenue: pick(row, iRevenue),
      sold: pick(row, iSold),
      profit: pick(row, iProfit),
      commission: commission === null ? null : Math.abs(commission),
      values: all
    });
  }
  return rows.sort((a, b) => a.month.localeCompare(b.month));
}
