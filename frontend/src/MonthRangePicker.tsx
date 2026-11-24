import { useEffect, useRef, useState } from "react";
import { clickMonth, presetRange, type RangeState } from "./monthRange.ts";

const SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const label = (key: string) => `${SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

type Props = {
  available: string[]; // месяцы, по которым есть данные, по порядку
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
};

/**
 * Выбор периода календарём месяцев: кнопка с периодом → окно с сеткой 12 месяцев, годы листаются стрелками.
 * Первый клик — начало, второй — конец. Месяцы без данных недоступны.
 */
export default function MonthRangePicker({ available, from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<RangeState>({ from, to, picking: false });
  const [hover, setHover] = useState<string | null>(null);
  const [year, setYear] = useState(Number(to.slice(0, 4)));
  const box = useRef<HTMLDivElement>(null);

  const firstYear = Number(available[0].slice(0, 4));
  const lastYear = Number(available[available.length - 1].slice(0, 4));
  const has = new Set(available);

  useEffect(() => { if (!open) setState({ from, to, picking: false }); }, [from, to, open]);

  // Закрыть по клику вне окна и по Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (key: string) => {
    const next = clickMonth(state, key);
    setState(next);
    if (!next.picking) { onChange(next.from, next.to); setOpen(false); }
  };

  const applyPreset = (preset: "all" | "year" | number) => {
    const r = presetRange(preset, available);
    if (r) { onChange(r.from, r.to); setOpen(false); }
  };

  // Подсветка: выбранный промежуток, а пока выбирается конец — до месяца под курсором.
  const end = state.picking && hover ? hover : state.to;
  const lo = state.from < end ? state.from : end;
  const hi = state.from < end ? end : state.from;

  return (
    <div className="mrp" ref={box}>
      <button className="mrp-button" onClick={() => { setYear(Number(to.slice(0, 4))); setOpen(!open); }} aria-expanded={open}>
        <span className="mrp-icon" aria-hidden>📅</span>
        {from === to ? label(from) : `${label(from)} — ${label(to)}`}
        <span className="mrp-caret" aria-hidden>▾</span>
      </button>

      {open && (
        <div className="mrp-pop" role="dialog" aria-label="Выбор периода">
          <div className="mrp-presets">
            <button onClick={() => applyPreset("all")}>Весь период</button>
            <button onClick={() => applyPreset("year")}>Этот год</button>
            <button onClick={() => applyPreset(12)}>12 мес.</button>
            <button onClick={() => applyPreset(6)}>6 мес.</button>
            <button onClick={() => applyPreset(3)}>3 мес.</button>
          </div>

          <div className="mrp-year">
            <button onClick={() => setYear(year - 1)} disabled={year <= firstYear} aria-label="Предыдущий год">‹</button>
            <b>{year}</b>
            <button onClick={() => setYear(year + 1)} disabled={year >= lastYear} aria-label="Следующий год">›</button>
          </div>

          <div className="mrp-grid">
            {SHORT.map((name, i) => {
              const key = `${year}-${i < 9 ? "0" : ""}${i + 1}`;
              const enabled = has.has(key);
              const inRange = key >= lo && key <= hi;
              const edge = key === lo || key === hi;
              return (
                <button
                  key={key}
                  disabled={!enabled}
                  className={`mrp-month${inRange ? " in" : ""}${edge ? " edge" : ""}`}
                  onClick={() => pick(key)}
                  onMouseEnter={() => setHover(key)}
                  onMouseLeave={() => setHover(null)}
                >
                  {name}
                </button>
              );
            })}
          </div>

          <div className="mrp-hint">{state.picking ? "Выберите последний месяц периода" : "Нажмите первый месяц периода, затем последний"}</div>
        </div>
      )}
    </div>
  );
}
