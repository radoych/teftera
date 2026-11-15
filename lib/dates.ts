/** Date helpers — bg-BG locale, used for grouping and display. */

const LOCALE = 'bg-BG';

// Intl formatter construction is the expensive part (locale data lookup), and
// these run once per transaction row — build each variant once, lazily.
// Mirrors getBgNumberFormat in formatCurrency.ts.
let timeFmt: Intl.DateTimeFormat | undefined;
let dayMonthFmt: Intl.DateTimeFormat | undefined;
let dayMonthYearFmt: Intl.DateTimeFormat | undefined;

function timeFormat(): Intl.DateTimeFormat {
  return (timeFmt ??= new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }));
}

function dayMonthFormat(): Intl.DateTimeFormat {
  return (dayMonthFmt ??= new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }));
}

function dayMonthYearFormat(): Intl.DateTimeFormat {
  return (dayMonthYearFmt ??= new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }));
}

/** YYYY-MM-DD in local time (the canonical `date` column format). */
export function toISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Month toolkit ───────────────────────────────────────────────────────────
// One definition of "calendar month": LOCAL time, zero-padded, bounds inclusive.
// Transaction `date` columns are YYYY-MM-DD strings, so month membership is a
// string-prefix test against `monthKey`.

/** 'YYYY-MM' for the local calendar month containing `date`. */
export function monthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** First day of the month containing `date`, shifted by `offset` whole months. */
export function startOfMonth(date: Date = new Date(), offset = 0): Date {
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

/** First day of the month for a given date (used for budgets.month). */
export function firstOfMonth(date: Date = new Date()): string {
  return `${monthKey(date)}-01`;
}

/** Inclusive [first, last] YYYY-MM-DD bounds of the month containing `date`. */
export function monthBounds(date: Date = new Date()): { startISO: string; endISO: string } {
  const y = date.getFullYear();
  const m = date.getMonth();
  return { startISO: toISODate(new Date(y, m, 1)), endISO: toISODate(new Date(y, m + 1, 0)) };
}

/** True when the YYYY-MM-DD `isoDate` falls in the calendar month containing `date`. */
export function isInMonth(isoDate: string, date: Date): boolean {
  return isoDate.startsWith(`${monthKey(date)}-`);
}

/** Sum of `amount_eur` (integer cents) over rows dated in the month containing `date`. */
export function sumInMonth(
  rows: ReadonlyArray<{ date: string; amount_eur: number }>,
  date: Date,
): number {
  const prefix = `${monthKey(date)}-`;
  return rows.reduce((sum, r) => (r.date.startsWith(prefix) ? sum + r.amount_eur : sum), 0);
}

/** Human day label: "Днес", "Вчера", or a localized date. */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const date = parseISODate(iso);
  const today = startOfDay(now);
  const target = startOfDay(date);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Днес';
  if (diffDays === 1) return 'Вчера';

  const fmt = target.getFullYear() === today.getFullYear() ? dayMonthFormat() : dayMonthYearFormat();
  return fmt.format(date);
}

export function formatTime(date: Date): string {
  return timeFormat().format(date);
}

function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** True only for a syntactically and calendar-valid YYYY-MM-DD string. */
export function isValidISODate(iso: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return false;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d);
  return (
    date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
  );
}

/** Bulgarian 3-letter month abbreviations; index 0 = January. */
const MONTH_ABBR_BG = [
  'ЯНУ', 'ФЕВ', 'МАР', 'АПР', 'МАЙ', 'ЮНИ',
  'ЮЛИ', 'АВГ', 'СЕП', 'ОКТ', 'НОЕ', 'ДЕК',
] as const;

/** BG 3-letter abbreviation for a 0-based month index (wraps via modulo 12). */
export function monthAbbr(monthIndex: number): string {
  return MONTH_ABBR_BG[((monthIndex % 12) + 12) % 12]!;
}

/** First day of the month `months-1` months before `now` — start of a `months`-month window including the current month. */
export function windowStartISO(months: number, now: Date = new Date()): string {
  return toISODate(new Date(now.getFullYear(), now.getMonth() - (months - 1), 1));
}
