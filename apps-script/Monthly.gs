/***** Monthly.gs *****/
/**
 * Помесячные итоги для «Финансовой аналитики» (tea-master-team.ru/management/finance/).
 *
 * Лист «Помесячно»: одна строка = один месяц (Месяц | Дата с | Дата по | Обновлено | показатели «Главной»).
 * Скрипт сам ставит месяц в Главная!A2:B2, запускает те же шаги, что «Обновить все данные и отчет»,
 * читает итог (колонки D:E «Главной») и пишет строку. В конце возвращает ваши даты в A2:B2.
 *
 * Меню (добавить в onOpen в Main.gs):
 *   .addItem('Заполнить помесячно с января 2026', 'startMonthlyBackfill')
 *   .addItem('Пересчитать прошлый месяц', 'recalcLastMonth')
 *
 * Один месяц считается за один запуск (у Google лимит 6 минут), следующий запускается сам через минуту.
 * Каждое 1-е число в ~06:00 МСК скрипт сам дописывает прошлый месяц.
 */

const MONTHLY = {
  SHEET: 'Помесячно',
  MAIN_SHEET: 'Главная',
  FIRST_MONTH: '2026-01',
  FIXED: ['Месяц', 'Дата с', 'Дата по', 'Обновлено'],
  MAIN_RANGE: 'D2:E60',
  MAX_FAILS: 3,
  COSTS_SHEET: 'Себестоимость',
  DEFAULT_COST: 100,
  PROP_FROM: 'MONTHLY_SAVED_FROM',
  PROP_TO: 'MONTHLY_SAVED_TO',
  PROP_FAILS: 'MONTHLY_FAILS_'
};

/* ---------- Чистые функции (без обращения к таблице) ---------- */

function pad2_(n) {
  return (n < 10 ? '0' : '') + n;
}

function monthKey_(year, monthIndex) {
  return year + '-' + pad2_(monthIndex + 1);
}

/** Все месяцы от fromKey до toKey включительно: ['2026-01', '2026-02', …]. */
function monthsBetween_(fromKey, toKey) {
  const result = [];
  let y = Number(fromKey.slice(0, 4));
  let m = Number(fromKey.slice(5, 7)) - 1;
  const endY = Number(toKey.slice(0, 4));
  const endM = Number(toKey.slice(5, 7)) - 1;
  while (y < endY || (y === endY && m <= endM)) {
    result.push(monthKey_(y, m));
    m++;
    if (m > 11) { m = 0; y++; }
  }
  return result;
}

/** Последний закрытый месяц: 23.11.2026 → '2026-10'. */
function lastClosedMonth_(now) {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return monthKey_(d.getFullYear(), d.getMonth());
}

/** Первое и последнее число месяца. */
function monthBounds_(key) {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7)) - 1;
  return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) };
}

/** Заголовок листа: постоянные столбцы, затем показатели. Новые показатели — в конец. */
function mergeHeader_(header, names) {
  const result = header.length ? header.map(String) : MONTHLY.FIXED.slice();
  names.forEach(function (name) {
    const clean = String(name || '').trim();
    if (clean && result.indexOf(clean) === -1) result.push(clean);
  });
  return result;
}

/** Значение показателя из строк [название, значение] по началу названия, без учёта регистра. */
function findValue_(rows, name) {
  const wanted = String(name).trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    const label = String(rows[i][0] || '').trim().toLowerCase();
    if (label && label.indexOf(wanted) === 0) {
      const value = rows[i][1];
      return value === '' || value === null || value === undefined ? '' : value;
    }
  }
  return '';
}

/**
 * Повтор при ответе Ozon «слишком много запросов» (429): пауза 5, 10, 15, 20, 25 с — до 6 попыток.
 * Остальные ошибки пробрасываются сразу.
 */
function withOzonRetry_(fn) {
  const MAX = 6;
  for (let attempt = 1; ; attempt++) {
    try {
      return fn();
    } catch (error) {
      const is429 = /Ozon API: 429/.test(String(error && error.message));
      if (!is429 || attempt >= MAX) throw error;
      Utilities.sleep(5000 * attempt);
    }
  }
}

/**
 * Включает повтор для всех запросов к Ozon на время помесячного расчёта.
 * Ваш файл OzonApi.gs не меняется: оборачиваем его метод post во время работы скрипта.
 * Плюс пауза 1 с между запросами, чтобы реже упираться в лимит.
 */
function installOzonRetry_() {
  if (typeof OzonApi === 'undefined' || OzonApi.prototype.__monthlyRetry) return;
  const original = OzonApi.prototype.post;
  OzonApi.prototype.post = function (path, payload) {
    const self = this;
    return withOzonRetry_(function () {
      Utilities.sleep(1000);
      return original.call(self, path, payload);
    });
  };
  OzonApi.prototype.__monthlyRetry = true;
}

/**
 * Артикулы из «Отчет_по_товарам» с пометкой «Нет себестоимости» в комментарии — через запятую.
 * Из-за них отчёт не считает прибыль месяца.
 */
function missingCostSkus_(values) {
  return missingCostRows_(values).map(function (r) { return r[0]; }).join(', ');
}

/** [[артикул, название], …] товаров с пометкой «Нет себестоимости» в отчёте. */
function missingCostRows_(values) {
  if (!values.length) return [];
  const header = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  const iSku = header.indexOf('артикул');
  const iComment = header.indexOf('комментарий');
  const iName = header.findIndex(function (h) { return h.indexOf('название') === 0; });
  if (iSku === -1 || iComment === -1) return [];
  const result = [];
  const seen = {};
  for (let i = 1; i < values.length; i++) {
    const sku = String(values[i][iSku] || '').trim();
    const comment = String(values[i][iComment] || '').toLowerCase();
    if (sku && comment.indexOf('нет себестоимости') !== -1 && !seen[sku]) {
      seen[sku] = true;
      result.push([sku, iName === -1 ? '' : String(values[i][iName] || '').trim()]);
    }
  }
  return result;
}

/**
 * Что записать в лист «Себестоимость» для товаров без цены (решение Марка 23.11.2026: такие товары = 100 ₽).
 * Есть строка, но цена пустая/не число («.», «146,00%») → заменить на defaultCost. Нет строки → дописать.
 * Строки с нормальной ценой не трогаем. row — номер строки листа (с 1).
 */
function defaultCostPlan_(costValues, missing, defaultCost) {
  const updates = [];
  const appends = [];
  const index = {};
  for (let i = 1; i < costValues.length; i++) {
    const sku = String(costValues[i][0] || '').trim();
    if (sku && !(sku in index)) index[sku] = i;
  }
  const isPrice = function (v) {
    if (typeof v === 'number') return isFinite(v) && v > 0;
    const t = String(v || '').trim();
    return /^\d+([.,]\d+)?$/.test(t.replace(/\s/g, '')) && Number(t.replace(/\s/g, '').replace(',', '.')) > 0;
  };
  missing.forEach(function (item) {
    const sku = item[0];
    if (sku in index) {
      if (!isPrice(costValues[index[sku]][2])) updates.push({ row: index[sku] + 1, value: defaultCost });
    } else {
      appends.push([sku, (item[1] || sku) + ' (себестоимость ' + defaultCost + ' ₽ по умолчанию)', defaultCost]);
      index[sku] = -1;
    }
  });
  return { updates: updates, appends: appends };
}

/* ---------- Работа с таблицей ---------- */

/** Пункт меню: заполнить все месяцы с января 2026 и включить ежемесячный автозапуск. */
function startMonthlyBackfill() {
  const props = PropertiesService.getScriptProperties();
  Object.keys(props.getProperties()).forEach(function (k) {
    if (k.indexOf(MONTHLY.PROP_FAILS) === 0) props.deleteProperty(k);
  });
  ensureMonthlyTrigger_();
  scheduleContinue_(1000);
  notify_('Заполнение «Помесячно» запущено.\n\n' +
    'Скрипт сам переберёт месяцы с января 2026 (по одному в минуту, обычно 10–30 минут). ' +
    'Пока он работает, даты в A2:B2 будут меняться — в конце вернутся ваши.\n\n' +
    'Ход работы — на листе «Логи». Дальше каждое 1-е число прошлый месяц добавится сам.');
}

/** Пункт меню: пересчитать прошлый месяц (перезаписать строку). */
function recalcLastMonth() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    notify_('Сейчас идёт другой расчёт. Попробуйте через пару минут.');
    return;
  }
  const key = lastClosedMonth_(new Date());
  try {
    saveUserDates_();
    recalcMonth_(key);
    notify_('Месяц ' + key + ' пересчитан и записан в «' + MONTHLY.SHEET + '».');
  } catch (error) {
    logMessage('Помесячно: ошибка пересчёта ' + key, { message: error.message });
    notify_('Ошибка при пересчёте ' + key + ':\n\n' + error.message);
  } finally {
    restoreUserDates_();
    lock.releaseLock();
  }
}

/** Автозапуск 1-го числа: дописать недостающие месяцы (обычно один — прошлый). */
function monthlyAuto() {
  monthlyContinue();
}

/** Один шаг заполнения: считает первый недостающий месяц и, если остались ещё, ставит следующий шаг. */
function monthlyContinue() {
  deleteTriggers_('monthlyContinue');

  const lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    // Кто-то нажал кнопку вручную — попробуем позже, даты не трогаем.
    scheduleContinue_(2 * 60 * 1000);
    return;
  }

  try {
    const missing = missingMonths_();
    if (!missing.length) {
      finishChain_('Помесячно: все месяцы заполнены');
      return;
    }

    const key = missing[0];
    saveUserDates_();

    try {
      recalcMonth_(key);
      PropertiesService.getScriptProperties().deleteProperty(MONTHLY.PROP_FAILS + key);
    } catch (error) {
      const props = PropertiesService.getScriptProperties();
      const fails = Number(props.getProperty(MONTHLY.PROP_FAILS + key) || 0) + 1;
      props.setProperty(MONTHLY.PROP_FAILS + key, String(fails));
      logMessage('Помесячно: ошибка месяца ' + key + ' (попытка ' + fails + ')', { message: error.message });
      if (fails >= MONTHLY.MAX_FAILS) {
        finishChain_('Помесячно: остановлено — месяц ' + key + ' не считается ' + fails + ' раза подряд');
        return;
      }
    }

    if (missingMonths_().length) {
      scheduleContinue_(60 * 1000);
    } else {
      finishChain_('Помесячно: все месяцы заполнены');
    }
  } finally {
    lock.releaseLock();
  }
}

/** Считает один месяц и записывает (или перезаписывает) его строку. */
function recalcMonth_(key) {
  const main = ensureMainSheet();
  const bounds = monthBounds_(key);

  main.getRange('A2:B2').setValues([[bounds.from, bounds.to]]);
  SpreadsheetApp.flush();

  logMessage('Помесячно: расчёт месяца ' + key);
  installOzonRetry_();

  // Те же шаги, что «Обновить все данные и отчет», но без всплывающих окон.
  updateFinanceData();
  updateProductsFromFinance();
  updateBuyoutsData();
  new ReportBuilder().build();
  SpreadsheetApp.flush();

  // Товары без себестоимости получают 100 ₽ в листе «Себестоимость», отчёт строится заново — иначе прибыль не считается.
  const reportSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Отчет_по_товарам');
  const missing = reportSheet ? missingCostRows_(reportSheet.getDataRange().getDisplayValues()) : [];
  if (missing.length && applyDefaultCosts_(missing)) {
    logMessage('Помесячно: себестоимость ' + MONTHLY.DEFAULT_COST + ' ₽ по умолчанию', { month: key, skus: missing.map(function (r) { return r[0]; }).join(', ') });
    new ReportBuilder().build();
    SpreadsheetApp.flush();
  }

  const rows = main.getRange(MONTHLY.MAIN_RANGE).getValues()
    .filter(function (r) { return String(r[0] || '').trim(); });

  rows.push(['Себестоимость 100 ₽ по умолчанию (артикулы)', missing.map(function (r) { return r[0]; }).join(', ')]);

  writeMonthRow_(key, bounds, rows);
  logMessage('Помесячно: месяц ' + key + ' записан');
}

function writeMonthRow_(key, bounds, rows) {
  const sheet = monthlySheet_();
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const oldHeader = sheet.getLastRow() >= 1
    ? sheet.getRange(1, 1, 1, lastCol).getValues()[0].filter(function (h) { return String(h).trim(); })
    : [];
  const header = mergeHeader_(oldHeader, rows.map(function (r) { return r[0]; }));

  if (header.join('|') !== oldHeader.join('|')) {
    sheet.getRange(1, 1, 1, header.length).setValues([header])
      .setFontWeight('bold').setBackground('#e6f4ea');
    sheet.setFrozenRows(1);
  }

  const row = header.map(function (name, i) {
    if (i === 0) return key;
    if (i === 1) return bounds.from;
    if (i === 2) return bounds.to;
    if (i === 3) return new Date();
    return findValue_(rows, name);
  });

  const keys = sheet.getLastRow() >= 2
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; })
    : [];
  const index = keys.indexOf(key);
  const rowNumber = index === -1 ? sheet.getLastRow() + 1 : index + 2;

  sheet.getRange(rowNumber, 1).setNumberFormat('@');
  sheet.getRange(rowNumber, 1, 1, row.length).setValues([row]);
  sheet.getRange(rowNumber, 2, 1, 2).setNumberFormat('dd.mm.yyyy');
  sheet.getRange(rowNumber, 4).setNumberFormat('dd.mm.yyyy hh:mm');
  for (let c = 4; c < row.length; c++) {
    if (typeof row[c] === 'number') sheet.getRange(rowNumber, c + 1).setNumberFormat('#,##0.00');
  }

  // Строки по порядку месяцев.
  if (sheet.getLastRow() > 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).sort(1);
  }
}

/** Пишет 100 ₽ товарам без себестоимости. Возвращает true, если что-то изменилось. */
function applyDefaultCosts_(missing) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(MONTHLY.COSTS_SHEET);
  if (!sheet) return false;
  const plan = defaultCostPlan_(sheet.getDataRange().getValues(), missing, MONTHLY.DEFAULT_COST);
  plan.updates.forEach(function (u) { sheet.getRange(u.row, 3).setValue(u.value); });
  if (plan.appends.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, plan.appends.length, 3).setValues(plan.appends);
  }
  SpreadsheetApp.flush();
  return plan.updates.length + plan.appends.length > 0;
}

function monthlySheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(MONTHLY.SHEET) || ss.insertSheet(MONTHLY.SHEET);
}

/** Закрытые месяцы с января 2026, которых ещё нет в «Помесячно». */
function missingMonths_() {
  const sheet = monthlySheet_();
  const done = sheet.getLastRow() >= 2
    ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getDisplayValues().map(function (r) { return r[0]; })
    : [];
  return monthsBetween_(MONTHLY.FIRST_MONTH, lastClosedMonth_(new Date()))
    .filter(function (k) { return done.indexOf(k) === -1; });
}

/** Запоминает даты пользователя (один раз за цепочку). */
function saveUserDates_() {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty(MONTHLY.PROP_FROM)) return;
  const values = ensureMainSheet().getRange('A2:B2').getValues()[0];
  props.setProperty(MONTHLY.PROP_FROM, values[0] instanceof Date ? values[0].toISOString() : String(values[0]));
  props.setProperty(MONTHLY.PROP_TO, values[1] instanceof Date ? values[1].toISOString() : String(values[1]));
}

/** Возвращает даты пользователя в A2:B2. */
function restoreUserDates_() {
  const props = PropertiesService.getScriptProperties();
  const from = props.getProperty(MONTHLY.PROP_FROM);
  if (from === null) return;
  const to = props.getProperty(MONTHLY.PROP_TO);
  const parse = function (v) {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d.getTime()) ? v : d;
  };
  ensureMainSheet().getRange('A2:B2').setValues([[parse(from), parse(to)]]);
  props.deleteProperty(MONTHLY.PROP_FROM);
  props.deleteProperty(MONTHLY.PROP_TO);
}

function finishChain_(message) {
  deleteTriggers_('monthlyContinue');
  restoreUserDates_();
  logMessage(message);
}

function scheduleContinue_(delayMs) {
  ScriptApp.newTrigger('monthlyContinue').timeBased().after(delayMs).create();
}

/** Ежемесячный автозапуск: 1-е число, около 06:00 по времени таблицы (Москва). */
function ensureMonthlyTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'monthlyAuto';
  });
  if (!exists) {
    ScriptApp.newTrigger('monthlyAuto').timeBased().onMonthDay(1).atHour(6).create();
  }
}

function deleteTriggers_(handler) {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === handler) ScriptApp.deleteTrigger(t);
  });
}

/** Окно с сообщением, если скрипт запущен из меню; при автозапуске — только в лог. */
function notify_(text) {
  try {
    SpreadsheetApp.getUi().alert(text);
  } catch (e) {
    logMessage(text);
  }
}

// Для тестов (node --test apps-script/). В Google Apps Script этого объекта нет — строка ничего не делает.
if (typeof module !== 'undefined') {
  module.exports = { monthsBetween_, lastClosedMonth_, monthBounds_, mergeHeader_, findValue_, withOzonRetry_, missingCostSkus_, missingCostRows_, defaultCostPlan_ };
}
