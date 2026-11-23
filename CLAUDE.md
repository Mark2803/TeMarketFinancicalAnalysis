# Финансовая аналитика — инструкция для работы с кодом

Отдельный инструмент «Чайного Мастера» в разделе «Менеджмент»: https://tea-master-team.ru/management/finance/.
Владелец — Марк (не программист: объяснять просто, по-русски, коротко). Вход — только из админки Чайного Маркета (`/admin/management`, PIN).
**Репозиторий публичный** — никаких ключей, паролей, `DATABASE_URL`, id таблицы.

## Откуда цифры
- Считает только скрипт таблицы «Финансы V3» (Apps Script, репозиторий FinancialAnalyticsMP — на GitHub он старее, чем в таблице; актуальный код просить у Марка).
- `apps-script/Monthly.gs` — наш файл в том же Apps Script: перебирает месяцы с 2026-01, ставит их в `Главная!A2:B2`, вызывает
  `updateFinanceData()`, `updateProductsFromFinance()`, `updateBuyoutsData()`, `new ReportBuilder().build()` (НЕ `updateAllData` — там окна `getUi().alert` и свой lock),
  читает `Главная!D:E` и пишет строку в лист **«Помесячно»**: `Месяц | Дата с | Дата по | Обновлено | показатели` (показатели — по названиям из D, новые — в конец).
  Один месяц за запуск, следующий — разовым триггером `monthlyContinue` через минуту. Ежемесячно — триггер `monthlyAuto` (1-е, 06:00 МСК). Даты Марка в A2:B2 сохраняются в Script Properties и возвращаются в конце.
- Изменения в Monthly.gs Марк сам копирует в Apps Script (шаг 1 README).

## Устройство
- `backend/` — Node 22 + Express 5, порт 3200, `GET /management/finance/api/months` (кэш 5 мин, `?refresh=1`). Читает «Помесячно» роботом Google (тот же ключ, что у «Себестоимости»), только чтение.
  Доступ — заголовок `X-Management-Token`, проверка по `management_access_tokens` в базе Чайного Маркета (`auth.ts` — копия из Managment).
- `frontend/` — Vite + React 19 + ECharts, `base: /management/finance/`. 4 диаграммы: Выручка, Продано (шт.), Прибыль, Комиссия Ozon (модулем).
- nginx: `deploy/nginx.ssl.conf_finance` (`^~ /management/finance/…` выигрывает у общего `/management/` Менеджмента). Статика — `/home/ivanc1539/finance-web`, код — `/home/ivanc1539/finance-analysis`, служба `finance-backend`.
- Карточка в админке — `MANAGEMENT_TOOLS` в TeaMarketV2 (`рефакторинг`), `backend/src/modules/moderator/management/management.routes.ts`.

## Проверка
В песочнице Claude нет npm-сети: тесты чистой логики (`node --test …`, см. README), сборка — на сервере.

## Статус (23.11.2026)
Код написан, на сервер не выложен, Monthly.gs в таблицу не установлен.
