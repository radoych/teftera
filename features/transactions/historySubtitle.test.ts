import { historySubtitle, matchCount, transactionCount } from './historySubtitle';

const NOV_16 = new Date(2026, 10, 16);

describe('transactionCount / matchCount', () => {
  it('uses the singular only for exactly one', () => {
    expect(transactionCount(1)).toBe('1 транзакция');
    expect(transactionCount(0)).toBe('0 транзакции');
    expect(transactionCount(2)).toBe('2 транзакции');
    expect(transactionCount(21)).toBe('21 транзакции');
    expect(matchCount(1)).toBe('1 съвпадение');
    expect(matchCount(5)).toBe('5 съвпадения');
  });
});

describe('historySubtitle', () => {
  const rows = [
    { date: '2026-11-15' },
    { date: '2026-11-01' },
    { date: '2026-10-31' },
    { date: '2025-11-10' }, // same month, previous year
  ];

  it('counts the current calendar month in the plain view', () => {
    expect(historySubtitle(rows, false, NOV_16)).toBe('2 транзакции през ноември');
  });

  it('pluralises a single transaction', () => {
    expect(historySubtitle([{ date: '2026-11-02' }], false, NOV_16)).toBe(
      '1 транзакция през ноември',
    );
  });

  it('reads 0 at the start of a quiet month', () => {
    expect(historySubtitle([{ date: '2026-10-30' }], false, NOV_16)).toBe(
      '0 транзакции през ноември',
    );
  });

  it('counts every match once the list is narrowed', () => {
    expect(historySubtitle(rows, true, NOV_16)).toBe('4 съвпадения');
    expect(historySubtitle(rows.slice(0, 1), true, NOV_16)).toBe('1 съвпадение');
  });
});
