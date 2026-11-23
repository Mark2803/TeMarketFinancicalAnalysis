/**
 * Токен доступа приходит из админки (после ввода PIN) в адресе: /management/finance/#t=ТОКЕН.
 * Забираем его, убираем из адресной строки и держим только в этой вкладке (sessionStorage).
 */
const TOKEN_KEY = "management_token";

export function captureToken(): void {
  const match = window.location.hash.match(/(?:^#|&)t=([^&]+)/);
  if (match) {
    try { sessionStorage.setItem(TOKEN_KEY, decodeURIComponent(match[1])); } catch { /* приватный режим */ }
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }
}

const token = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? ""; } catch { return ""; } };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type MonthRow = {
  month: string;
  from: string;
  to: string;
  updated: string;
  revenue: number | null;
  sold: number | null;
  profit: number | null;
  commission: number | null;
  values: Record<string, number | null>;
};

export async function loadMonths(refresh = false): Promise<{ months: MonthRow[]; updatedAt: string }> {
  const response = await fetch(`/management/finance/api/months${refresh ? "?refresh=1" : ""}`, {
    headers: { "X-Management-Token": token() }
  });
  const body = (await response.json().catch(() => ({}))) as { months?: MonthRow[]; updatedAt?: string; error?: { message: string } };
  if (!response.ok) throw new ApiError(response.status, body.error?.message ?? `Ошибка ${response.status}`);
  return { months: body.months ?? [], updatedAt: body.updatedAt ?? "" };
}
