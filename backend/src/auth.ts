import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import pg from "pg";

/**
 * Вход в Менеджмент — только через админку Чайного Маркета:
 * после ввода PIN админка выдаёт токен (живёт 60 минут) и открывает инструмент.
 * Здесь проверяем этот токен по той же базе (таблица management_access_tokens).
 */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3 });

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function requireManagementToken(req: Request, res: Response, next: NextFunction) {
  try {
    const token = req.get("X-Management-Token") ?? "";
    if (token) {
      const result = await pool.query(
        "SELECT 1 FROM management_access_tokens WHERE token_hash = $1 AND expires_at > now()",
        [sha256(token)]
      );
      if (result.rowCount) { next(); return; }
    }
    res.status(401).json({ error: { code: "MANAGEMENT_LOCKED", message: "Доступ закрыт. Откройте инструмент заново через админку → «Менеджмент» (ввод PIN)." } });
  } catch (error) {
    next(error);
  }
}
