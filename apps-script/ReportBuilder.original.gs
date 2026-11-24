/**
 * ReportBuilder.gs
 *
 * Финансовый отчет Ozon на основе API_Финансы.
 *
 * Источник: /v1/finance/accrual/by-day
 *
 * Особенности:
 * - одно начисление может содержать несколько SKU;
 * - сумма Ozon записана только в одной строке начисления;
 * - все строки распределения суммируются по ID;
 * - суммы сравниваются в копейках;
 * - операции без SKU учитываются отдельно;
 * - неизвестная себестоимость не заменяется фактическим нулем;
 * - отчет не перезаписывается при ошибке сверки.
 */

class ReportBuilder {

  build() {

    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const finance = ss.getSheetByName(CONFIG.SHEETS.FINANCE);
    const products = ss.getSheetByName(CONFIG.SHEETS.PRODUCTS);
    const costs = ss.getSheetByName(CONFIG.SHEETS.COSTS);

    if (!finance || finance.getLastRow() < 2) {
      throw new Error(
        'Нет финансовых данных. Запустите updateFinanceData().'
      );
    }

    // -----------------------------------------
    // Вспомогательные функции
    // -----------------------------------------

    function isEmpty(value) {
      return value === '' ||
        value === null ||
        value === undefined;
    }

    function parseNumber(value, allowMissing) {

      if (isEmpty(value)) {
        return allowMissing ? null : 0;
      }

      if (typeof value === 'number') {
        if (!Number.isFinite(value)) {
          throw new Error('Некорректное число: ' + value);
        }
        return value;
      }

      const text = String(value)
        .trim()
        .replace(/[\s\u00A0\u202F]/g, '')
        .replace(',', '.');

      if (
        text === '' ||
        text === '.' ||
        text === '-' ||
        text === '—'
      ) {
        if (allowMissing) return null;

        throw new Error(
          'Отсутствует обязательное числовое значение: ' +
          String(value)
        );
      }

      const result = Number(text);

      if (!Number.isFinite(result)) {
        throw new Error('Некорректное число: ' + value);
      }

      return result;
    }

    function money(value) {
      return Math.round(parseNumber(value, false) * 100);
    }

    function rub(value) {
      return value / 100;
    }

    function text(value) {
      return isEmpty(value) ? '' : String(value).trim();
    }

    function headerIndex(headers, name, required) {
      const index = headers.indexOf(name);

      if (index < 0 && required) {
        throw new Error('Отсутствует колонка: ' + name);
      }

      return index;
    }

    function sum(items, key) {
      return items.reduce(function(total, item) {
        return total + item[key];
      }, 0);
    }

    // -----------------------------------------
    // Справочник товаров
    // -----------------------------------------

    const productMap = new Map();

    if (products && products.getLastRow() > 1) {

      const values = products.getDataRange().getValues();
      const headers = values.shift().map(text);

      const skuCol = headerIndex(headers, 'SKU', false);
      const articleCol = headerIndex(
        headers, 'Артикул / offer_id', false
      );
      const nameCol = headerIndex(
        headers, 'Название товара', false
      );

      if (skuCol >= 0) {

        values.forEach(function(row) {

          const sku = text(row[skuCol]);

          if (!sku) return;

          productMap.set(sku, {
            article: articleCol >= 0
              ? text(row[articleCol])
              : '',
            name: nameCol >= 0
              ? text(row[nameCol])
              : ''
          });

        });

      }

    }

    // -----------------------------------------
    // Себестоимость
    // -----------------------------------------

    const costMap = new Map();

    if (costs && costs.getLastRow() > 1) {

      const values = costs.getDataRange().getValues();
      const headers = values.shift().map(text);

      const articleCol = headerIndex(
        headers, 'Артикул', false
      );

      const costCol = headerIndex(
        headers, 'Себестоимость', false
      );

      if (articleCol >= 0 && costCol >= 0) {

        values.forEach(function(row) {

          const article = text(row[articleCol]);

          if (!article) return;

          const cost = parseNumber(
            row[costCol],
            true
          );

          costMap.set(article, cost);

        });

      }

    }

    // -----------------------------------------
    // Финансовые операции
    // -----------------------------------------

    const values = finance.getDataRange().getValues();
    const headers = values.shift().map(text);

    const I = {
      id: headerIndex(headers, 'ID начисления', true),
      category: headerIndex(headers, 'Категория', true),
      sku: headerIndex(headers, 'SKU', true),
      quantity: headerIndex(
        headers, 'Количество (справочно)', true
      ),
      sale: headerIndex(headers, 'Выручка', true),
      commission: headerIndex(headers, 'Комиссия', true),
      delivery: headerIndex(headers, 'Логистика', true),
      other: headerIndex(
        headers, 'Прочие начисления', true
      ),
      total: headerIndex(headers, 'Итого Ozon', true),
      allocated: headerIndex(headers, 'Распределено', true)
    };

    // Контроль по каждому начислению
    const accruals = new Map();

    // Группировка по SKU
    const grouped = new Map();

    let ozonTotal = 0;
    let allocatedTotal = 0;
    let withoutSkuTotal = 0;

    // -----------------------------------------
    // Обработка строк API_Финансы
    // -----------------------------------------

    values.forEach(function(row, index) {

      const sheetRow = index + 2;
      const id = text(row[I.id]);

      if (!id) {

        // Полностью пустые строки допускаются.
        const hasData = row.some(function(cell) {
          return !isEmpty(cell);
        });

        if (hasData) {
          throw new Error(
            'Отсутствует ID начисления, строка ' +
            sheetRow
          );
        }

        return;
      }

      const category = text(row[I.category]);
      const sku = text(row[I.sku]);

      if (
        category !== 'ITEM' &&
        category !== 'POSTING' &&
        category !== 'NON_ITEM'
      ) {
        throw new Error(
          'Неизвестная категория ' + category +
          ', строка ' + sheetRow
        );
      }

      // Создаем запись начисления
      if (!accruals.has(id)) {

        accruals.set(id, {
          category: category,
          hasTotal: false,
          total: 0,
          allocated: 0,
          rows: 0
        });

      }

      const accrual = accruals.get(id);

      if (accrual.category !== category) {
        throw new Error(
          'Разные категории для ID ' + id
        );
      }

      accrual.rows++;

      // ---------------------------------------
      // Контрольная сумма Ozon
      // ---------------------------------------

      const rawTotal = row[I.total];

      if (!isEmpty(rawTotal)) {

        const amount = money(rawTotal);

        if (accrual.hasTotal) {
          throw new Error(
            'Повторная контрольная сумма для ID ' +
            id + ', строка ' + sheetRow
          );
        }

        accrual.hasTotal = true;
        accrual.total = amount;

        ozonTotal += amount;

      }

      // ---------------------------------------
      // Детализация строки
      // ---------------------------------------

      const revenue = money(row[I.sale]);
      const commission = money(row[I.commission]);
      const delivery = money(row[I.delivery]);
      const other = money(row[I.other]);
      const allocated = money(row[I.allocated]);

      const calculated =
        revenue +
        commission +
        delivery +
        other;

      if (calculated !== allocated) {

        throw new Error(
          'Расхождение детализации, строка ' +
          sheetRow +
          '. Расчет: ' + rub(calculated) +
          ', распределено: ' + rub(allocated)
        );

      }

      accrual.allocated += allocated;
      allocatedTotal += allocated;

      if (!sku) {
        withoutSkuTotal += allocated;
      }

      // ---------------------------------------
      // Группировка по SKU
      // ---------------------------------------

      const key = sku || '__UNALLOCATED__';

      if (!grouped.has(key)) {

        grouped.set(key, {
          sku: sku,
          quantity: 0,
          revenue: 0,
          commission: 0,
          delivery: 0,
          other: 0,
          payout: 0,
          saleIds: new Set(),
          notes: new Set()
        });

      }

      const item = grouped.get(key);

      item.revenue += revenue;
      item.commission += commission;
      item.delivery += delivery;
      item.other += other;
      item.payout += allocated;

      // Количество продаж справочное.
      // Учитываем только положительную выручку.
      if (category === 'POSTING' && revenue > 0) {

        const saleKey = id + '|' + sku;

        if (!item.saleIds.has(saleKey)) {

          item.saleIds.add(saleKey);

          item.quantity += parseNumber(
            row[I.quantity],
            false
          );

        }

      }

      if (category === 'ITEM') {
        item.notes.add('Товарные услуги');
      }

      if (category === 'NON_ITEM') {
        item.notes.add('Операции без SKU');
      }

    });

    // -----------------------------------------
    // Проверка каждого начисления
    // -----------------------------------------

    accruals.forEach(function(accrual, id) {

      if (!accrual.hasTotal) {
        throw new Error(
          'Отсутствует сумма Ozon для ID ' + id
        );
      }

      if (accrual.total !== accrual.allocated) {

        throw new Error(
          'Расхождение начисления ID ' + id +
          '. Ozon: ' + rub(accrual.total) +
          ', распределено: ' +
          rub(accrual.allocated) +
          ', разница: ' +
          rub(accrual.total - accrual.allocated)
        );

      }

    });

    // -----------------------------------------
    // Общая сверка
    // -----------------------------------------

    if (ozonTotal !== allocatedTotal) {

      throw new Error(
        'ОШИБКА СВЕРКИ. Ozon: ' +
        rub(ozonTotal) +
        ', распределено: ' +
        rub(allocatedTotal) +
        ', разница: ' +
        rub(ozonTotal - allocatedTotal)
      );

    }

    // -----------------------------------------
    // Формирование строк отчета
    // -----------------------------------------

    const entries = Array.from(grouped.values());

    entries.sort(function(a, b) {
      return b.payout - a.payout;
    });

    const reportRows = [];

    let missingCosts = 0;
    let knownCostTotal = 0;

    entries.forEach(function(item) {

      const product = productMap.get(item.sku) || {
        article: '',
        name: ''
      };

      const article = product.article;

      const notes = Array.from(item.notes);

      const hasCost = Boolean(
        item.sku &&
        article &&
        costMap.has(article) &&
        costMap.get(article) !== null
      );

      const unitCost = hasCost
        ? costMap.get(article)
        : null;

      const quantity = item.quantity;

      let totalCost = null;
      let profit = null;
      let profitability = null;

      if (!item.sku) {

        // Общехозяйственные операции Ozon.
        // Себестоимость не применяется.
        totalCost = 0;
        profit = rub(item.payout);

      } else if (hasCost) {

        totalCost = Math.round(
          Math.max(0, quantity) *
          unitCost * 100
        ) / 100;

        knownCostTotal += totalCost;

        profit = rub(item.payout) - totalCost;

        if (totalCost > 0) {
          profitability = profit / totalCost;
        }

      } else {

        missingCosts++;

        if (!article) {
          notes.push('Не найден артикул');
        }

        notes.push('Нет себестоимости');

      }

      const name = item.sku
        ? (product.name || 'SKU ' + item.sku)
        : 'Операции без SKU';

      const revenue = rub(item.revenue);
      const payout = rub(item.payout);

      const deductions = rub(
        item.revenue - item.payout
      );

      const detail =
        item.revenue +
        item.commission +
        item.delivery +
        item.other;

      const difference = detail - item.payout;

      reportRows.push([
        article,
        name,
        quantity,
        revenue,
        payout,
        deductions,
        0,
        hasCost ? unitCost : '',
        totalCost === null ? '' : totalCost,
        profit === null ? '' : profit,
        profitability === null ? '' : profitability,
        difference === 0
          ? 'OK'
          : 'РАЗНИЦА ' + rub(difference),
        notes.join(' | '),
        item.sku,
        rub(item.commission),
        rub(item.delivery),
        rub(item.other)
      ]);

    });

    // -----------------------------------------
    // Итоги
    // -----------------------------------------

    const totalQuantity = sum(entries, 'quantity');
    const totalRevenue = rub(sum(entries, 'revenue'));
    const totalPayout = rub(sum(entries, 'payout'));

    const totalDeductions =
      totalRevenue - totalPayout;

    const totalCommission =
      rub(sum(entries, 'commission'));

    const totalDelivery =
      rub(sum(entries, 'delivery'));

    const totalOther =
      rub(sum(entries, 'other'));

    // Налог — только ориентировочная модель.
    const tax = Math.round(
      Math.max(0, totalPayout) * 0.06 * 100
    ) / 100;

    const allCostsKnown = missingCosts === 0;

    const totalProfit = allCostsKnown
      ? Math.round(
          (totalPayout - knownCostTotal - tax) * 100
        ) / 100
      : '';

    const totalProfitability =
      allCostsKnown && knownCostTotal > 0
        ? totalProfit / knownCostTotal
        : '';

    const headersReport = [
      'Артикул',
      'Название товара',
      'Кол-во продано*',
      'Выручка',
      'Получено на счет',
      'Удержания Ozon',
      'Налог 6%**',
      'Себестоимость ед.',
      'Себестоимость всего',
      'Прибыль руб**',
      'Доходность %',
      'Проверка',
      'Комментарий',
      'SKU',
      'Комиссия',
      'Логистика',
      'Прочие операции'
    ];

    const totalRow = reportRows.length + 2;

    const totalValues = [
      '',
      'ИТОГО',
      totalQuantity,
      totalRevenue,
      totalPayout,
      totalDeductions,
      tax,
      '',
      allCostsKnown ? knownCostTotal : '',
      totalProfit,
      totalProfitability,
      'OK',
      allCostsKnown
        ? 'Налог 6% — ориентировочная модель.'
        : 'Неизвестна себестоимость ' +
          missingCosts + ' SKU. Прибыль не рассчитана.',
      '',
      totalCommission,
      totalDelivery,
      totalOther
    ];

    // -----------------------------------------
    // Запись отчета
    // -----------------------------------------

    const report =
      ss.getSheetByName(CONFIG.SHEETS.REPORT) ||
      ss.insertSheet(CONFIG.SHEETS.REPORT);

    report.clearContents();
    report.clearFormats();

    report.getRange(
      1, 1, 1, headersReport.length
    ).setValues([headersReport]);

    for (
      let offset = 0;
      offset < reportRows.length;
      offset += 400
    ) {

      const batch = reportRows.slice(
        offset,
        offset + 400
      );

      report.getRange(
        offset + 2,
        1,
        batch.length,
        headersReport.length
      ).setValues(batch);

    }

    report.getRange(
      totalRow, 1, 1, headersReport.length
    ).setValues([totalValues]);

    // -----------------------------------------
    // Контрольные показатели
    // -----------------------------------------

    const controlRows = [
      ['Контроль Ozon', rub(ozonTotal)],
      ['Распределено', rub(allocatedTotal)],
      ['Разница', rub(ozonTotal - allocatedTotal)],
      ['Без SKU', rub(withoutSkuTotal)],
      ['Количество начислений', accruals.size],
      ['SKU без себестоимости', missingCosts]
    ];

    report.getRange(
      totalRow + 2,
      2,
      controlRows.length,
      2
    ).setValues(controlRows);

    // -----------------------------------------
    // Оформление
    // -----------------------------------------

    report.setFrozenRows(1);

    report.getRange(
      1, 1, 1, headersReport.length
    ).setFontWeight('bold');

    report.getRange(
      totalRow, 1, 1, headersReport.length
    ).setFontWeight('bold');

    if (reportRows.length > 0) {

      report.getRange(
        2, 4, reportRows.length + 1, 7
      ).setNumberFormat('#,##0.00');

      report.getRange(
        2, 11, reportRows.length + 1, 1
      ).setNumberFormat('0.00%');

    }

    report.setColumnWidth(1, 150);
    report.setColumnWidth(2, 280);
    report.setColumnWidth(13, 380);
    report.setColumnWidth(14, 150);

    // Синхронизация сводки с актуальным отчетом.
    // Не изменяем A:B: там расположен период отчета.
    const main = ss.getSheetByName('Главная');
    if (main) {
      const reportRef = "'" + report.getName().replace(/'/g, "''") + "'!";
      const summary = [
        ['Выручка', '=' + reportRef + 'D' + totalRow],
        ['Продано, шт. (предварительно)', '=' + reportRef + 'C' + totalRow],
        ['Начислено Ozon (нетто)', '=' + reportRef + 'E' + totalRow],
        ['Удержания Ozon', '=' + reportRef + 'F' + totalRow],
        ['Налог 6% (модель)', '=' + reportRef + 'G' + totalRow],
        ['Себестоимость (предварительно)', '=' + reportRef + 'I' + totalRow],
        ['Прибыль (предварительно)', '=' + reportRef + 'J' + totalRow],
        ['Комиссия Ozon', '=' + reportRef + 'O' + totalRow],
        ['Логистика Ozon', '=' + reportRef + 'P' + totalRow],
        ['Прочие операции', '=' + reportRef + 'Q' + totalRow],
        ['Контроль начислений', '=' + reportRef + 'C' + (totalRow + 4)],
        ['Начисления без SKU', '=' + reportRef + 'C' + (totalRow + 5)]
      ];
      main.getRange(2, 4, summary.length, 2).setValues(summary);
      main.getRange(2, 5, summary.length, 1).setNumberFormat('#,##0.00');
      main.getRange('E3').setNumberFormat('0');
    }
    Logger.log(
      'Отчет сформирован.\n' +
      'Начислений: ' + accruals.size + '\n' +
      'Сумма Ozon: ' + rub(ozonTotal) + '\n' +
      'Распределено: ' + rub(allocatedTotal) + '\n' +
      'Разница: ' +
        rub(ozonTotal - allocatedTotal) + '\n' +
      'Без SKU: ' + rub(withoutSkuTotal) + '\n' +
      'SKU без себестоимости: ' + missingCosts
    );

  }

}


/**
 * Ручной запуск из редактора Apps Script.
 */
function buildProductReport() {
  new ReportBuilder().build();
}
