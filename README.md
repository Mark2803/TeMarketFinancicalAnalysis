# Финансовая аналитика (tea-master-team.ru/management/finance)

Диаграммы по месяцам: выручка, продано штук, прибыль, комиссия Ozon. Данные — из таблицы «Финансы V3», лист «Помесячно».
Вход — из админки: `/admin/management` → PIN → карточка «Финансовая аналитика». Устройство проекта — в `CLAUDE.md`.

**Репозиторий публичный — ключей, паролей и id таблицы сюда не класть.**

## Шаг 1. Скрипт в таблице «Финансы V3»

1. Таблица → **Расширения → Apps Script**.
2. Слева **+ → Скрипт**, назвать `Monthly` (получится `Monthly.gs`), вставить целиком код из [`apps-script/Monthly.gs`](apps-script/Monthly.gs), сохранить (💾).
3. Открыть `Main.gs`, в `onOpen` после строки `'buildProductReport'` + `)` дописать два пункта, чтобы получилось:
   ```js
       .addItem(
         'Сформировать отчет',
         'buildProductReport'
       )
       .addItem('Заполнить помесячно с января 2026', 'startMonthlyBackfill')
       .addItem('Пересчитать прошлый месяц', 'recalcLastMonth')
       .addToUi();
   ```
   Сохранить.
   Также заменить целиком код файла `ReportBuilder.gs` на [`apps-script/ReportBuilder.gs`](apps-script/ReportBuilder.gs)
   (исправлена ошибка «Расхождение детализации» на августе 2026; товар без себестоимости считается по 100 ₽).
   Исходная версия Марка до правки — `apps-script/ReportBuilder.original.gs`.
4. Вернуться в таблицу, обновить страницу (F5). В меню **Ozon** появятся новые пункты.
5. **Ozon → Заполнить помесячно с января 2026**. Google попросит разрешения (Продолжить → аккаунт → «Дополнительные настройки» → «Перейти…» → Разрешить) — после этого нажать пункт ещё раз.
6. Готово: скрипт сам переберёт месяцы (по одному в минуту, ~10–30 минут) и заполнит лист «Помесячно». Ход работы — на листе «Логи». В конце в A2:B2 вернутся ваши даты.
   Пока идёт заполнение, кнопку «Обновить все данные» не нажимать (скажет «Обновление уже выполняется»).
7. Дальше ничего делать не нужно: каждое 1-е число около 06:00 прошлый месяц добавится сам.

Если месяц 3 раза подряд не посчитался (например, Ozon не ответил), заполнение останавливается — запись в «Логи». Повторить: снова пункт «Заполнить помесячно…» (готовые месяцы пропускаются).
Пересчитать месяц заново: удалить его строку в «Помесячно» и нажать «Заполнить помесячно…»; прошлый месяц — пунктом «Пересчитать прошлый месяц».

## Шаг 2. Первая выкладка на сервер

Команды — в SSH-сессии под `root` (вход — см. CLAUDE.md репозитория TeaMarketV2). Репозиторий публичный — токен GitHub не нужен.

1. Код:
   ```
   U="runuser -u ivanc1539 --"
   mkdir -p /home/ivanc1539/finance-analysis && chown ivanc1539:ivanc1539 /home/ivanc1539/finance-analysis
   $U git clone https://github.com/Mark2803/TeMarketFinancicalAnalysis.git /home/ivanc1539/finance-analysis
   ```
2. Ключ робота Google — тот же, что у «Себестоимости». Проверить, что он есть: `ls -l /home/ivanc1539/managment-secrets/google-key.json`.
   Если файла нет — выложить его по шагу 2 README репозитория Managment.
3. Настройки:
   ```
   cd /home/ivanc1539/finance-analysis/backend && $U cp .env.example .env && nano .env
   ```
   `DATABASE_URL` — как в `/home/ivanc1539/tea-market-v2/backend/.env` (без части после `?`), `SPREADSHEET_ID` — как в `.env` Менеджмента (`/home/ivanc1539/managment/backend/.env`).
4. Сборка:
   ```
   $U npm install --include=dev && $U npm run build
   cd ../frontend && $U npm install --include=dev && $U npm run build
   mkdir -p /home/ivanc1539/finance-web/management/finance && cp -r dist/. /home/ivanc1539/finance-web/management/finance/
   chown -R ivanc1539:www-data /home/ivanc1539/finance-web
   ```
5. Служба:
   ```
   cp /home/ivanc1539/finance-analysis/deploy/finance-backend.service /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now finance-backend && sleep 3 && systemctl is-active finance-backend
   curl -s http://127.0.0.1:3200/management/finance/api/health
   ```
   Должно быть `active` и `{"ok":true}`.
6. nginx:
   ```
   cp /home/ivanc1539/finance-analysis/deploy/nginx.ssl.conf_finance /home/ivanc1539/conf/web/tea-master-team.ru/
   nginx -t && systemctl reload nginx
   ```
7. Карточка в админке — выкладка TeaMarketV2 (ветка `рефакторинг`, backend).
8. Проверка: админка → Менеджмент → PIN → «Финансовая аналитика».

## Обновление

```
U="runuser -u ivanc1539 --"; cd /home/ivanc1539/finance-analysis && $U git pull
cd backend && $U npm install --include=dev && $U npm run build && systemctl restart finance-backend
cd ../frontend && $U npm install --include=dev && $U npm run build && cp -r dist/. /home/ivanc1539/finance-web/management/finance/ && chown -R ivanc1539:www-data /home/ivanc1539/finance-web
```

Журнал: `journalctl -u finance-backend -n 100`.

## Тесты

`node --test apps-script/monthly.test.mjs apps-script/reportbuilder.test.mjs`, `cd backend && npm test`, `cd frontend && npm test`.
