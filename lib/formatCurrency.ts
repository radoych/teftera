/**
 * Canonical money handling for Teftera.
 *
 * Hard rules (see CLAUDE.md):
 *  - Amounts are stored and passed around as INTEGER minor units (euro-cents).
 *    Never do float arithmetic on money.
 *  - Default and only display currency is EUR (€). Never hardcode `$`/USD.
 *  - BGN (лв) is legacy only (pre-2026 DSK imports), fixed rate 1 EUR = 1.95583 BGN.
 *  - All money display in the app goes through `formatCurrency`.
 */

/** Official irrevocable EUR↔BGN conversion rate. */
export const BGN_PER_EUR = 1.95583;

export type SupportedCurrency = 'EUR' | 'BGN';

const SYMBOLS: Record<SupportedCurrency, string> = {
  EUR: '€',
  BGN: 'лв',
};

/**
 * Format integer minor units (cents/stotinki) as a localized currency string.
 * Locale is bg-BG; default currency EUR.
 *
 * @param minorUnits integer amount in cents (e.g. 14250 → €142,50)
 *
 * The symbol is placed BEFORE the number (like `$`), not after. bg-BG's
 * `currency` style would suffix it, so we format the number with the `decimal`
 * style (keeping bg-BG grouping + comma decimal) and prepend the symbol.
 */
export function formatCurrency(
  minorUnits: number,
  currency: SupportedCurrency = 'EUR',
): string {
  if (!Number.isFinite(minorUnits)) {
    return formatCurrency(0, currency);
  }

  const major = minorUnits / 100;
  const sign = major < 0 ? '-' : '';
  const abs = Math.abs(major);

  let number: string;
  try {
    number = new Intl.NumberFormat('bg-BG', {
      style: 'decimal',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs);
  } catch {
    // Fallback if the runtime lacks full Intl (older Hermes builds).
    number = abs.toFixed(2).replace('.', ',');
  }

  return `${sign}${SYMBOLS[currency]}${number}`;
}

/**
 * Convert an integer BGN minor-unit amount (stotinki) to integer EUR cents,
 * using the fixed rate. Rounds to the nearest cent.
 */
export function bgnToEurCents(bgnMinorUnits: number): number {
  return Math.round(bgnMinorUnits / BGN_PER_EUR);
}

/**
 * Convert an integer EUR cent amount to integer BGN minor units (stotinki).
 * Rounds to the nearest stotinka.
 */
export function eurToBgnCents(eurMinorUnits: number): number {
  return Math.round(eurMinorUnits * BGN_PER_EUR);
}

/** Parse a user-entered decimal string (e.g. "12,50" or "12.50") to integer cents. */
export function parseAmountToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '' || !/^-?\d*\.?\d*$/.test(normalized)) {
    return null;
  }
  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return null;
  }
  return Math.round(value * 100);
}
