import {
  cleanMerchant,
  normalizeDskRow,
  normalizeMerchant,
  occurredAtISO,
  parseBgAmount,
  parseCsv,
  parseDskCsv,
  parseDskDate,
} from './dsk-import';

/** Build a DSK-shaped CSV: UTF-8 BOM, fully quoted fields, CRLF rows. */
function toCsv(rows: string[][]): string {
  const body = rows
    .map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  return `﻿${body}`;
}

// Mirrors services/__fixtures__/dsk-sample.csv (kept on disk for manual device testing).
const SAMPLE = toCsv([
  ['БАНКА', 'БАНКА ДСК ЕАД'],
  ['Сметка', 'BG00STSA00000000000000 EUR'],
  ['За период от:', '01.02.2026'],
  [
    'Дата на осчетоводяване',
    'Вальор',
    'Описание',
    'Контрагент',
    'IBAN на получател / наредител',
    'BIC на контрагента',
    'Реф. на контрагента',
    'Доп. реквизити',
    'Код вид плащане',
    'Сума EUR',
    'Кредит EUR',
    'Дата',
    'Час',
  ],
  ['04.02.2026', '04.02.2026', 'ПОС', 'BGR SHUMEN LIDL BALGARIYA EOOD BUL SIMEO', '', '', '', '', '', '37,66', '', '04.02.2026', '21:48'],
  ['05.02.2026', '05.02.2026', 'ПОС', 'BGR SOFIYA DM BULGARIA EOOD', '', '', '', '', '', '6,64', '', '05.02.2026', '14:19'],
  ['08.02.2026', '08.02.2026', 'ИНТЕРНЕТ', 'USA ANTHROPIC COM CLAUDE AI SUBSCRIPTION', '', '', '', '', '', '21,60', '', '08.02.2026', '09:00'],
  ['06.02.2026', '06.02.2026', 'ПОС', 'BGR SHUMEN SOPHARMACY BUL SLAVYANSKI 14E', '', '', '', '', '', '16,67', '', '06.02.2026', '17:08'],
  ['02.02.2026', '02.02.2026', 'ПЛАЩАНЕ', 'ТОПЛОФИКАЦИЯ СОФИЯ ЕАД', 'BG91STSA93000004594021', '', '', '', '', '30,83', '', '01.02.2026', '17:12'],
  ['15.02.2026', '15.02.2026', 'ЗАПЛАТА', 'ФИРМА ЕООД', '', '', '', '', '', '', '506,22', '15.02.2026', '09:30'],
  ['07.02.2026', '07.02.2026', 'P2P', 'ИВАН ПЕТРОВ', 'BG22STSA93000024104000', '', '', '', '', '', '150,00', '07.02.2026', '16:04'],
]);

describe('DSK primitives', () => {
  it('parses Bulgarian amounts', () => {
    expect(parseBgAmount('1 234,56')).toBe(123456);
    expect(parseBgAmount('-45,00')).toBe(-4500);
    expect(parseBgAmount('12,50')).toBe(1250);
  });

  it('parses DSK dates to ISO', () => {
    expect(parseDskDate('05.03.2024')).toBe('2024-03-05');
  });

  it('cleans merchant whitespace', () => {
    expect(cleanMerchant('  LIDL   SOFIA  ')).toBe('LIDL SOFIA');
  });
});

describe('parseCsv', () => {
  it('strips a leading BOM', () => {
    expect(parseCsv('﻿"a","b"')).toEqual([['a', 'b']]);
  });

  it('keeps commas inside quoted fields', () => {
    expect(parseCsv('"a","b,c","d"')).toEqual([['a', 'b,c', 'd']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('"e""f"')).toEqual([['e"f']]);
  });

  it('splits CRLF rows and keeps newlines inside quotes', () => {
    expect(parseCsv('"a"\r\n"b\r\nc"')).toEqual([['a'], ['b\r\nc']]);
  });
});

describe('parseDskCsv', () => {
  it('skips the metadata preamble and returns only transaction rows', () => {
    const rows = parseDskCsv(SAMPLE);
    expect(rows).toHaveLength(7); // 5 debit + 2 credit
  });

  it('maps the real DSK columns', () => {
    const first = parseDskCsv(SAMPLE)[0]!;
    expect(first.merchantRaw).toBe('BGR SHUMEN LIDL BALGARIYA EOOD BUL SIMEO');
    expect(first.debit).toBe('37,66');
    expect(first.credit).toBe('');
    expect(first.date).toBe('04.02.2026');
    expect(first.time).toBe('21:48');
    expect(first.currency).toBe('EUR');
  });

  it('captures credit (income) rows', () => {
    const salary = parseDskCsv(SAMPLE).find((r) => r.merchantRaw === 'ФИРМА ЕООД');
    expect(salary?.debit).toBe('');
    expect(salary?.credit).toBe('506,22');
  });
});

describe('normalizeMerchant', () => {
  it('maps known card-acceptor names to clean brands', () => {
    expect(normalizeMerchant('BGR SHUMEN LIDL BALGARIYA EOOD BUL SIMEO')).toBe('Lidl');
    expect(normalizeMerchant('BGR SOFIYA DM BULGARIA EOOD')).toBe('dm');
    expect(normalizeMerchant('USA ANTHROPIC COM CLAUDE AI SUBSCRIPTION')).toBe('Anthropic');
    expect(normalizeMerchant('BGR SHUMEN SOPHARMACY BUL SLAVYANSKI 14E')).toBe('SOpharmacy');
  });

  it('passes Cyrillic counterparties through cleaned', () => {
    expect(normalizeMerchant('  ТОПЛОФИКАЦИЯ СОФИЯ   ЕАД ')).toBe('ТОПЛОФИКАЦИЯ СОФИЯ ЕАД');
  });

  it('strips the country + city prefix from unknown Latin acceptors', () => {
    expect(normalizeMerchant('BGR SHUMEN TRANCHEV OOD')).toBe('TRANCHEV OOD');
  });

  it('cuts trailing address noise from unknown Latin acceptors', () => {
    expect(normalizeMerchant('BGR SHUMEN ZOO GRUP STEFANOV BUL SIMEON')).toBe('ZOO GRUP STEFANOV');
  });
});

describe('occurredAtISO', () => {
  it('combines date + time into a local-wallclock ISO timestamp', () => {
    const d = new Date(occurredAtISO('2026-02-04', '21:48'));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getDate()).toBe(4);
    expect(d.getHours()).toBe(21);
    expect(d.getMinutes()).toBe(48);
  });

  it('defaults to midnight when the time is missing', () => {
    const d = new Date(occurredAtISO('2026-02-04', ''));
    expect(d.getHours()).toBe(0);
    expect(d.getMinutes()).toBe(0);
  });

  it('occurredAtISO with a non-ISO date still returns a parseable timestamp when possible', () => {
    // regex fails → falls back to Date parsing → midnight ISO
    const out = occurredAtISO('2026-7-1', '10:30');
    expect(Number.isNaN(new Date(out).getTime())).toBe(false);
    expect(out.endsWith('Z')).toBe(true);
  });
});

describe('normalizeDskRow', () => {
  it('normalizes a EUR debit into an expense (no conversion)', () => {
    const out = normalizeDskRow({
      date: '04.02.2026',
      merchantRaw: 'BGR SHUMEN LIDL BALGARIYA EOOD BUL SIMEO',
      description: 'POS',
      debit: '37,66',
      credit: '',
      time: '21:48',
      currency: 'EUR',
    })!;
    expect(out.kind).toBe('expense');
    expect(out.amountEurCents).toBe(3766);
    expect(out.originalAmountCents).toBeNull();
    expect(out.originalCurrency).toBeNull();
    expect(out.merchant).toBe('Lidl');
    expect(out.categoryGuess).toBe('Groceries');
    expect(out.date).toBe('2026-02-04');
    // occurredAt carries the real transaction date + time (local wall-clock).
    const occ = new Date(out.occurredAt);
    expect(occ.getFullYear()).toBe(2026);
    expect(occ.getMonth()).toBe(1); // February
    expect(occ.getDate()).toBe(4);
    expect(occ.getHours()).toBe(21);
    expect(occ.getMinutes()).toBe(48);
  });

  it('normalizes a EUR credit into income', () => {
    const out = normalizeDskRow({
      date: '15.02.2026',
      merchantRaw: 'ФИРМА ЕООД',
      description: 'ЗАПЛАТА',
      debit: '',
      credit: '506,22',
      time: '09:30',
      currency: 'EUR',
    })!;
    expect(out.kind).toBe('income');
    expect(out.amountEurCents).toBe(50622);
  });

  it('converts a pre-2026 BGN debit and retains the original', () => {
    const out = normalizeDskRow({
      date: '01.02.2024',
      merchantRaw: 'LIDL Sofia',
      description: 'POS',
      debit: '1 955,83',
      credit: '',
      time: '14:05',
      currency: 'BGN',
    })!;
    expect(out.kind).toBe('expense');
    expect(out.originalCurrency).toBe('BGN');
    expect(out.originalAmountCents).toBe(195583);
    expect(out.amountEurCents).toBe(100000); // 1955.83 BGN = 1000.00 EUR
    expect(out.date).toBe('2024-02-01');
    expect(out.categoryGuess).toBe('Groceries');
  });

  it('drops rows with zero amount (both debit and credit empty)', () => {
    const row = {
      date: '01.07.2026', merchantRaw: 'INFO ROW', description: '', debit: '', credit: '',
      time: '', currency: 'EUR' as const,
    };
    expect(normalizeDskRow(row)).toBeNull();
  });
});
