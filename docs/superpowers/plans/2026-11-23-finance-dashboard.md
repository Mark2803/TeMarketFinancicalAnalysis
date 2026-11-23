# Финансовая аналитика — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** помесячные итоги Ozon копятся в листе «Помесячно» таблицы «Финансы V3», а страница `/management/finance/` показывает 4 диаграммы по месяцам.

**Architecture:** скрипт таблицы (`apps-script/Monthly.gs`, новый файл, старые не меняются) сам перебирает месяцы через A2/B2 и пишет строки; backend (Express, порт 3200) читает лист роботом Google; frontend (Vite + React + ECharts) рисует диаграммы.

**Tech Stack:** Google Apps Script (V8), Node 22 + Express 5 + pg, Vite 6 + React 19 + echarts 5 + echarts-for-react.

**Spec:** `docs/superpowers/specs/2026-11-23-finance-dashboard-design.md`

## Global Constraints
- Секретов в репозитории нет (он публичный): ключ Ozon, ключ робота Google, `DATABASE_URL` — только в `.env` на сервере.
- Лист «Главная» не меняется: читаются колонки D (название) и E (значение), пишутся только A2/B2 и затем восстанавливаются.
- Лист итогов — ровно `Помесячно`, один лист, одна строка на месяц (`ГГГГ-ММ`), повтор перезаписывает строку.
- Существующие функции скрипта (в таблице, Main.gs от Марка 23.11.2026): `updateFinanceData()`, `updateProductsFromFinance()`, `updateBuyoutsData()`, `new ReportBuilder().build()`, `ensureMainSheet()`, `logMessage(msg, data)`. `updateAllData()` НЕ вызывать (там `getUi().alert` — падает в триггере, и свой `LockService.getScriptLock`).
- Таймзона скрипта — `Europe/Moscow`. Первый месяц — 2026-01. Считаются только закрытые месяцы.
- Адреса: страница `/management/finance/`, API `/management/finance/api/…`, порт 3200. Вход — токен `X-Management-Token` из `management_access_tokens` (как в Managment `backend/src/auth.ts`).
- Показатели на диаграммах (названия строк «Главной», как на скриншоте 23.11.2026): `Выручка`, `Продано, шт. (предварительно)`, `Прибыль (предварительная)`, `Комиссия Ozon` (на «Главной» отрицательная — на диаграмме показывать модулем).
- В песочнице Claude нет сети для npm — сборку и `npm install` проверяет Марк на сервере; чистая логика проверяется `node --test` без зависимостей.

## Review Focus
- Название строки на «Главной» чуть другое (например, сократили «(предварительная)») → искать по началу строки (`startsWith`) без регистра; если не найдено — пустая ячейка в «Помесячно», а не падение. Тест в Task 1.
- Марк вручную жмёт кнопку, пока идёт автозаполнение → `tryLock` не взят: запуск откладывается, A2/B2 не портятся. Проверка вручную в Task 1.
- В «Помесячно» есть пустые/битые строки или месяцы не по порядку → backend пропускает строки без `ГГГГ-ММ`, сортирует по месяцу. Тест в Task 2.
- Новый показатель добавился на «Главную» → новый столбец дописывается справа, старые строки не ломаются. Тест в Task 1.
- Токен админки истёк (60 мин) → страница показывает «Откройте заново через админку», а не пустые графики. Task 3.

---

### Task 1: Скрипт таблицы `Monthly.gs`

**Files:**
- Create: `apps-script/Monthly.gs`
- Test: `apps-script/monthly.test.mjs` (грузит чистые функции из `Monthly.gs` через `vm`)

**Interfaces:**
- Produces (лист): `Помесячно`, заголовок `Месяц | Дата с | Дата по | <показатели в порядке «Главной»> | Обновлено`.
- Produces (меню, вызываются из `onOpen` Марка одной строкой `addMonthlyMenu_(menu)` — либо отдельное меню «Помесячно» через собственный `onOpen`-установщик, см. шаг 3).
- Чистые функции (тестируются): `monthsBetween_(fromKey: string, toKey: string): string[]`, `lastClosedMonth_(now: Date): string`, `monthBounds_(key: string): {from: Date, to: Date}`, `mergeHeader_(header: string[], names: string[]): string[]`, `findValue_(rows: any[][], name: string): number|''`.

- [ ] **Step 1: тест** — `monthsBetween_('2026-01','2026-10')` → 10 ключей, первый `2026-01`, последний `2026-10`; `lastClosedMonth_(new Date(2026,10,23))` → `'2026-10'`, `lastClosedMonth_(new Date(2027,0,1))` → `'2026-12'`; `monthBounds_('2026-02').to.getDate()` → `28`; `mergeHeader_(['Месяц','Дата с','Дата по','Выручка','Обновлено'], ['Выручка','Комиссия Ozon'])` → `['Месяц','Дата с','Дата по','Выручка','Комиссия Ozon','Обновлено']`; `findValue_([['Прибыль (предварительная)', 5]], 'прибыль')` → `5`; `findValue_([], 'Выручка')` → `''`.
- [ ] **Step 2:** `node --test apps-script/monthly.test.mjs` → FAIL (нет файла).
- [ ] **Step 3: реализация.** Функции листа:
  - `startMonthlyBackfill()` (пункт меню «Заполнить помесячно с января 2026»): ставит месячный триггер `ScriptApp.newTrigger('monthlyTick').timeBased().onMonthDay(1).atHour(6)` (если такого нет), запоминает A2/B2 в `PropertiesService` (`MONTHLY_SAVED_FROM/TO`), запускает `monthlyTick()`.
  - `monthlyTick()`: `LockService.getScriptLock().tryLock(5000)`; нет лока → поставить себе разовый триггер через 2 мин и выйти. Берёт первый месяц из `monthsBetween_('2026-01', lastClosedMonth_(new Date()))`, которого нет в «Помесячно» → `recalcMonth_(key)`; если остались ещё — разовый триггер `monthlyTick` через 1 мин; если нет — вернуть сохранённые A2/B2, удалить разовые триггеры.
  - `recalcLastMonth()` (пункт меню «Пересчитать прошлый месяц»): то же для `lastClosedMonth_` с перезаписью.
  - `recalcMonth_(key)`: A2/B2 = `monthBounds_`, `SpreadsheetApp.flush()`, `updateFinanceData(); updateProductsFromFinance(); updateBuyoutsData(); new ReportBuilder().build(); SpreadsheetApp.flush()`, читает `Главная!D2:E40`, upsert строки по ключу месяца (столбец A, текстом), `logMessage`. Ошибка → `logMessage` + строка не пишется, A2/B2 всё равно восстанавливаются в `finally` при завершении цепочки.
  - Меню: `function onOpenMonthly_(){}` не нужен — Марк добавляет в свой `onOpen` строку `.addItem('Заполнить помесячно с января 2026','startMonthlyBackfill').addItem('Пересчитать прошлый месяц','recalcLastMonth')` (инструкция в README). В конце файла — блок `if (typeof module !== 'undefined') module.exports = {...}` для тестов.
- [ ] **Step 4:** `node --test apps-script/monthly.test.mjs` → PASS.
- [ ] **Step 5: commit** `feat: скрипт помесячных итогов для таблицы`.

### Task 2: Backend

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/.env.example`, `backend/src/server.ts`, `backend/src/auth.ts` (копия из Managment), `backend/src/google-sheets.ts` (копия `getValues`/`sheetRange`/доступ из Managment, только чтение, scope `spreadsheets.readonly`), `backend/src/months.ts`
- Test: `backend/src/months.test.ts` (`node --test --experimental-strip-types`)

**Interfaces:**
- Produces: `parseMonths(values: unknown[][]): MonthRow[]`, где `MonthRow = { month: string; from: string; to: string; revenue: number|null; sold: number|null; profit: number|null; commission: number|null; values: Record<string, number|null> }` (`commission` — модуль). `GET /management/finance/api/months` → `{ months: MonthRow[], updatedAt: string }`. Кэш 5 минут, `?refresh=1` сбрасывает.
- Env: `PORT=3200`, `DATABASE_URL`, `GOOGLE_SERVICE_ACCOUNT_FILE`, `SPREADSHEET_ID`, `MONTHLY_SHEET=Помесячно`.

- [ ] **Step 1: тест** — заголовок + строки `['2026-02',…]`, `['',…]`, `['мусор',…]`, `['2026-01',…]` → 2 месяца, по порядку `2026-01`, `2026-02`; `Комиссия Ozon = -449885.24` → `commission: 449885.24`; столбец `Выручка` найден при заголовке `выручка ` (регистр/пробелы); нет столбца прибыли → `profit: null`.
- [ ] **Step 2:** запуск → FAIL.
- [ ] **Step 3:** реализация `months.ts`, `server.ts` по образцу Managment (`requireManagementToken` на `/management/finance/api`, `health` без токена).
- [ ] **Step 4:** тест → PASS.
- [ ] **Step 5: commit** `feat: backend чтения листа «Помесячно»`.

### Task 3: Frontend

**Files:**
- Create: `frontend/package.json`, `frontend/index.html`, `frontend/vite.config.ts` (`base: '/management/finance/'`, proxy `/management/finance/api` → 3200), `frontend/tsconfig.json`, `frontend/src/main.tsx`, `frontend/src/api.ts` (токен `#t=` → `sessionStorage`, как Managment), `frontend/src/FinancePage.tsx`, `frontend/src/MetricChart.tsx`, `frontend/src/format.ts`, `frontend/src/styles.css`
- Test: `frontend/src/format.test.ts`

**Interfaces:**
- Consumes: `GET /management/finance/api/months` (Task 2).
- Produces: `formatRub(n)` → `1 271 201 ₽`; `formatMonth('2026-03')` → `Март 2026`; `deltaPercent(cur, prev)` → число или `null` при `prev` 0/null.

- [ ] **Step 1: тест** — значения выше.
- [ ] **Step 2:** FAIL. **Step 3:** реализация. Страница: заголовок, выбор «с — по» (месяцы из ответа), 4 карточки (2×2 на ПК, 1 колонка на телефоне): название, итог за период, изменение последнего месяца к предыдущему (зелёный/красный), столбцы ECharts с подсказкой. 401 → сообщение «Доступ закрыт. Откройте инструмент заново через админку → «Менеджмент»». Пусто → «Месяцы ещё не посчитаны: в таблице выберите Ozon → Заполнить помесячно».
- [ ] **Step 4:** PASS. **Step 5: commit** `feat: страница финансовой аналитики`.

### Task 4: Выкладка и документация

**Files:**
- Create: `deploy/nginx.ssl.conf_finance`, `deploy/finance-backend.service` (по образцу Managment, порт 3200, папка `/home/ivanc1539/finance-analysis`, статика `/home/ivanc1539/finance-web`), `README.md` (установка `Monthly.gs` в Apps Script + 2 строки в меню + выкладка на сервер по шагам), `CLAUDE.md` (устройство проекта).
- Modify (другой репозиторий): TeaMarketV2 ветка `рефакторинг`, `backend/src/modules/moderator/management/management.routes.ts` — карточка в `MANAGEMENT_TOOLS` «Финансовая аналитика» → `/management/finance/`.

- [ ] **Step 1:** nginx: `location ^~ /management/finance/api/` и `location ^~ /management/finance/` — с пояснением, что они должны быть в файле, который nginx читает (Hestia берёт `nginx.ssl.conf_*` по алфавиту; `^~` с более длинным префиксом выигрывает у `/management/` независимо от порядка).
- [ ] **Step 2:** карточка в TeaMarketV2, проверка `npx tsc --noEmit` там, где есть зависимости (у Марка/на сервере).
- [ ] **Step 3: commit** в обоих репозиториях.
