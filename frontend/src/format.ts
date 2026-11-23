const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

const int = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });

export function formatRub(n: number | null): string {
  return n === null ? "—" : `${int.format(Math.round(n))} ₽`;
}

export function formatCount(n: number | null): string {
  return n === null ? "—" : `${int.format(Math.round(n))} шт.`;
}

/** 2026-03 → «Март 2026». */
export function formatMonth(key: string): string {
  return `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;
}

/** 2026-03 → «мар 26» (подпись под столбцом). */
export function formatMonthShort(key: string): string {
  return `${MONTHS_SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}`;
}

/** Изменение в процентах к прошлому значению; нельзя посчитать — null. */
export function deltaPercent(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}
