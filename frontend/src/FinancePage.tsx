import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, loadMonths, type MonthRow } from "./api";
import { deltaPercent, formatMonth } from "./format";
import FinanceChart from "./FinanceChart";
import MonthRangePicker from "./MonthRangePicker";
import { SERIES } from "./chartOption.ts";


const sum = (values: Array<number | null>) =>
  values.some((v) => v !== null) ? values.reduce<number>((acc, v) => acc + (v ?? 0), 0) : null;

export default function FinancePage() {
  const [months, setMonths] = useState<MonthRow[] | null>(null);
  const [updatedAt, setUpdatedAt] = useState("");
  const [error, setError] = useState<{ locked: boolean; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const data = await loadMonths(refresh);
      setMonths(data.months);
      setUpdatedAt(data.updatedAt);
      setError(null);
    } catch (e) {
      const locked = e instanceof ApiError && e.status === 401;
      setError({ locked, message: e instanceof Error ? e.message : "Не удалось загрузить данные." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // По умолчанию — весь доступный период.
  useEffect(() => {
    if (!months?.length) return;
    if (!from || !months.some((m) => m.month === from)) setFrom(months[0].month);
    if (!to || !months.some((m) => m.month === to)) setTo(months[months.length - 1].month);
  }, [months, from, to]);

  const selected = useMemo(
    () => (months ?? []).filter((m) => (!from || m.month >= from) && (!to || m.month <= to)),
    [months, from, to]
  );
  const keys = useMemo(() => selected.map((m) => m.month), [selected]);

  return (
    <main className="page">
      <div className="top">
        <div>
          <a className="back" href="/admin/management">← Менеджмент</a>
          <h1>Финансовая аналитика</h1>
          <p className="muted">Ozon по месяцам · данные из таблицы «Финансы V3», лист «Помесячно»</p>
        </div>
        {months && months.length > 0 && (
          <div className="period">
            <MonthRangePicker
              available={months.map((m) => m.month)}
              from={from || months[0].month}
              to={to || months[months.length - 1].month}
              onChange={(f, t) => { setFrom(f); setTo(t); }}
            />
            <button className="btn secondary" onClick={() => void load(true)} disabled={loading}>{loading ? "Обновляю…" : "Обновить"}</button>
          </div>
        )}
      </div>

      {error && (
        <div className="alert">
          {error.locked
            ? <>Доступ закрыт. Откройте инструмент заново через <a href="/admin/management">админку → «Менеджмент»</a> (ввод PIN).</>
            : error.message}
        </div>
      )}

      {!error && months === null && <p className="muted">Загружаю…</p>}

      {!error && months !== null && months.length === 0 && (
        <div className="panel">
          <h2>Месяцы ещё не посчитаны</h2>
          <p className="muted">Откройте таблицу «Финансы V3» → меню Ozon → «Заполнить помесячно с января 2026». Скрипт сам переберёт месяцы, затем обновите эту страницу.</p>
        </div>
      )}

      {selected.length > 0 && (
        <>
          <div className="tiles">
            {SERIES.map((metric) => {
              const values = selected.map((m) => m[metric.key]);
              const last = values[values.length - 1] ?? null;
              const prev = values.length > 1 ? values[values.length - 2] : null;
              const delta = deltaPercent(last, prev);
              const lowerIsBetter = metric.key === "commission";
              const good = delta === null ? null : lowerIsBetter ? delta <= 0 : delta >= 0;
              const missing = values.filter((v) => v === null).length;
              return (
                <section className="tile" key={metric.key}>
                  <h2><span className="dot" style={{ background: metric.color }} />{metric.name}</h2>
                  <div className="total">{metric.format(sum(values))}</div>
                  {metric.key === "profit" && missing > 0 && (
                    <div className="muted small warn">не рассчитана в {missing} из {values.length} мес.: в таблице нет себестоимости части товаров</div>
                  )}
                  {delta !== null && (
                    <div className={`delta ${good ? "up" : "down"}`} title="Последний месяц к предыдущему">
                      {delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} {Math.abs(delta).toLocaleString("ru-RU")}% <span className="small">{formatMonth(keys[keys.length - 1]).split(" ")[0].toLowerCase()} к пред.</span>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
          <section className="panel chart-panel">
            <div className="muted small">за {selected.length === 1 ? formatMonth(keys[0]) : `${formatMonth(keys[0])} — ${formatMonth(keys[keys.length - 1])}`} · рубли — левая шкала, штуки (пунктир) — правая · клик по названию скрывает линию</div>
            <FinanceChart rows={selected} />
          </section>
        </>
      )}

      {updatedAt && <p className="muted small footer">Данные с сервера: {new Date(updatedAt).toLocaleString("ru-RU")}. Новый месяц добавляется 1-го числа.</p>}
    </main>
  );
}
