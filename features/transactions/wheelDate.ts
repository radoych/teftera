// features/transactions/wheelDate.ts — pure date math for the wheel picker.

/** Number of days in a 1-based month of a year. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Clamp a day to the valid range [1, daysInMonth] for the given year/month. */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(Math.max(day, 1), daysInMonth(year, month));
}

/** Compose a clamped YYYY-MM-DD from 1-based wheel parts. */
export function partsToISO(year: number, month: number, day: number): string {
  const d = clampDay(year, month, day);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Decompose an ISO date into 1-based { year, month, day }. */
export function isoToParts(iso: string): { year: number; month: number; day: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { year: y ?? 1970, month: m ?? 1, day: d ?? 1 };
}
