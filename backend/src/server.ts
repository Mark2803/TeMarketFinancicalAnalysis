import express, { type NextFunction, type Request, type Response } from "express";
import { requireManagementToken } from "./auth.js";
import { getValues, sheetRange } from "./google-sheets.js";
import { parseMonths, type MonthRow } from "./months.js";

/**
 * Бэкенд «Финансовой аналитики». За nginx: https://tea-master-team.ru/management/finance/api/…
 * Только читает лист «Помесячно» таблицы «Финансы V3».
 */
const app = express();
app.set("trust proxy", "loopback");

const BASE = "/management/finance/api";
const SHEET = process.env.MONTHLY_SHEET || "Помесячно";
const CACHE_MS = 5 * 60 * 1000;
let cache: { at: number; months: MonthRow[] } | null = null;

app.get(`${BASE}/health`, (_req, res) => { res.json({ ok: true }); });

app.use(BASE, requireManagementToken);

app.get(`${BASE}/months`, async (req, res, next) => {
  try {
    if (!cache || req.query.refresh === "1" || Date.now() - cache.at > CACHE_MS) {
      cache = { at: Date.now(), months: parseMonths(await getValues(sheetRange(SHEET, "A1:ZZ"))) };
    }
    res.json({ months: cache.months, updatedAt: new Date(cache.at).toISOString() });
  } catch (error) {
    next(error);
  }
});

app.use(BASE, (_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Не найдено." } });
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(error);
  const message = error instanceof Error ? error.message : "Неизвестная ошибка";
  res.status(500).json({ error: { code: "SERVER_ERROR", message: `Ошибка сервера: ${message}` } });
});

const port = Number(process.env.PORT) || 3200;
app.listen(port, "127.0.0.1", () => { console.log(`Finance backend: http://127.0.0.1:${port}`); });
