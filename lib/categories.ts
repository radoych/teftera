/**
 * Default category catalog + lightweight merchant→category rules.
 *
 * Icons are @expo/vector-icons MaterialIcons glyph names.
 * Colors are drawn from the design palette (never the anomaly accent #c3f400).
 */
import type { ComponentProps } from 'react';
import type { MaterialIcons } from '@expo/vector-icons';

export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

export interface DefaultCategory {
  name: string;
  icon: MaterialIconName;
  color: string;
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Food & Dining', icon: 'restaurant', color: '#ffdfa7' },
  { name: 'Beverages', icon: 'local-cafe', color: '#d8e3ff' },
  { name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff' },
  { name: 'Transport', icon: 'directions-car', color: '#a8c8ff' },
  { name: 'Housing', icon: 'home', color: '#c4c6d0' },
  { name: 'Utilities', icon: 'bolt', color: '#ffdfa7' },
  { name: 'Health', icon: 'medical-services', color: '#ffb4ab' },
  { name: 'Entertainment', icon: 'movie', color: '#d8e3ff' },
  { name: 'Shopping', icon: 'shopping-bag', color: '#adc7ff' },
  { name: 'Other', icon: 'category', color: '#8e909a' },
] as const;

/** Keyword → category name rules. First match wins. */
const MERCHANT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/starbucks|coffee|cafe|кафе/i, 'Beverages'],
  [/lidl|kaufland|billa|fantastico|grocery|market|супермаркет/i, 'Groceries'],
  [/shell|omv|petrol|gas|fuel|uber|taxi|бензин/i, 'Transport'],
  [/restaurant|mcdonald|kfc|pizza|ресторан/i, 'Food & Dining'],
  [/pharmacy|apteka|hospital|clinic|аптека/i, 'Health'],
  [/netflix|spotify|cinema|kino|hbo|кино/i, 'Entertainment'],
  [/zara|h&m|mall|amazon|emag/i, 'Shopping'],
  [/electric|water|internet|vivacom|a1|ток|вода/i, 'Utilities'],
  [/rent|наем|mortgage/i, 'Housing'],
];

/**
 * Guess a default category name from a merchant string.
 * Returns 'Other' when nothing matches.
 */
export function guessCategory(merchant: string): string {
  for (const [pattern, category] of MERCHANT_RULES) {
    if (pattern.test(merchant)) {
      return category;
    }
  }
  return 'Other';
}

/**
 * Map a merchant to a household category id by name. Uses `guessCategory`
 * for the rule match, then looks the resulting name up in the household's
 * seeded categories. Falls back to the household's `Other` category, then null.
 */
export function resolveCategoryId(
  merchant: string,
  categories: ReadonlyArray<{ id: string; name: string }>,
): string | null {
  const guessed = guessCategory(merchant);
  const match = categories.find((c) => c.name === guessed);
  if (match) return match.id;
  const other = categories.find((c) => c.name === 'Other');
  return other ? other.id : null;
}
