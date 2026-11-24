/** Логика выбора периода в календаре месяцев (без интерфейса — проверяется тестами). Месяц — строка «ГГГГ-ММ». */

export type RangeState = { from: string; to: string; picking: boolean };

/** Сдвиг месяца: shiftMonth("2026-01", -1) → "2025-12". */
export function shiftMonth(key: string, delta: number): string {
  const total = Number(key.slice(0, 4)) * 12 + Number(key.slice(5, 7)) - 1 + delta;
  const y = Math.floor(total / 12);
  const m = total - y * 12 + 1;
  return `${y}-${m < 10 ? "0" : ""}${m}`;
}

/** Первый клик выбирает начало (и ждёт конец), второй — конец. Конец раньше начала — меняем местами. */
export function clickMonth(state: RangeState, key: string): RangeState {
  if (!state.picking) return { from: key, to: key, picking: true };
  return key < state.from
    ? { from: key, to: state.from, picking: false }
    : { from: state.from, to: key, picking: false };
}

/** Быстрый выбор: весь период, текущий год последнего месяца с данными или последние N месяцев. */
export function presetRange(preset: "all" | "year" | number, available: string[]): { from: string; to: string } | null {
  if (!available.length) return null;
  const first = available[0];
  const last = available[available.length - 1];
  const clamp = (from: string) => ({ from: from < first ? first : from, to: last });
  if (preset === "all") return { from: first, to: last };
  if (preset === "year") return clamp(`${last.slice(0, 4)}-01`);
  return clamp(shiftMonth(last, -(preset - 1)));
}
