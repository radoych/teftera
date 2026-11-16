import { isInMonth, monthName } from '@/lib/dates';

/** "1 транзакция" / "N транзакции". */
export function transactionCount(n: number): string {
  return `${n} ${n === 1 ? 'транзакция' : 'транзакции'}`;
}

/** "1 съвпадение" / "N съвпадения". */
export function matchCount(n: number): string {
  return `${n} ${n === 1 ? 'съвпадение' : 'съвпадения'}`;
}

/**
 * Line under History's large title.
 *
 * History is not paged by month — it shows the whole loaded window, newest
 * first — so the plain view describes the month you land on (the current
 * calendar month): "87 транзакции през ноември". Once a search or filter
 * narrows the list, the rows span many months and a per-month count would not
 * match what is on screen, so it counts every match instead: "12 съвпадения".
 * `rows` are the already-filtered rows on screen.
 */
export function historySubtitle(
  rows: readonly { date: string }[],
  narrowed: boolean,
  now: Date = new Date(),
): string {
  if (narrowed) return matchCount(rows.length);
  const inMonth = rows.reduce((n, r) => (isInMonth(r.date, now) ? n + 1 : n), 0);
  return `${transactionCount(inMonth)} през ${monthName(now.getMonth())}`;
}
