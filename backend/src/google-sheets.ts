import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Чтение Google Таблицы от имени робота (служебного аккаунта) без сторонних библиотек:
 * подписываем JWT ключом робота, получаем токен Google, вызываем Sheets API. Только чтение.
 * Робот и ключ — те же, что у «Себестоимости» (costs-robot@teamaster-515514…).
 */
type ServiceKey = { client_email: string; private_key: string };

let key: ServiceKey | null = null;
let cachedToken: { value: string; expiresAt: number } | null = null;

function loadKey(): ServiceKey {
  if (key) return key;
  const file = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!file) throw new Error("Не задан GOOGLE_SERVICE_ACCOUNT_FILE (путь к ключу робота Google).");
  const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<ServiceKey>;
  if (!parsed.client_email || !parsed.private_key) throw new Error("Файл ключа Google повреждён: нет client_email или private_key.");
  key = { client_email: parsed.client_email, private_key: parsed.private_key };
  return key;
}

const b64url = (value: string) => Buffer.from(value).toString("base64url");

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const k = loadKey();
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: k.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }))}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(k.private_key).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` })
  });
  if (!response.ok) throw new Error(`Google не пустил робота (${response.status}): ${(await response.text()).slice(0, 300)}`);
  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

/** Диапазон с именем листа в кавычках: 'Помесячно'!A1:ZZ. */
export const sheetRange = (sheet: string, a1: string) => `'${sheet.replace(/'/g, "''")}'!${a1}`;

/** Числа — числами, даты — текстом как в таблице (01.01.2026). Нет листа — пустой список. */
export async function getValues(range: string): Promise<unknown[][]> {
  const id = process.env.SPREADSHEET_ID;
  if (!id) throw new Error("Не задан SPREADSHEET_ID.");
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}` +
    "?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING";
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` } });
  if (response.status === 400 && (await response.clone().text()).includes("Unable to parse range")) return [];
  if (!response.ok) throw new Error(`Google Таблица ответила ошибкой ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = (await response.json()) as { values?: unknown[][] };
  return data.values ?? [];
}
