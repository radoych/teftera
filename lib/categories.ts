/**
 * Default category catalog + lightweight merchant→category rules.
 *
 * Icons are @expo/vector-icons MaterialIcons glyph names.
 * Colors are drawn from the design palette (never the anomaly accent #c3f400).
 */
import type { ComponentProps } from 'react';
import type { MaterialIcons } from '@expo/vector-icons';
import type { CategoryLite } from '@/features/transactions/types';

export type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

/** How a category renders: label, glyph and accent colour. */
export interface CategoryPresentation {
  name: string;
  icon: MaterialIconName;
  color: string;
}

/** The single "unknown / deleted / null category" presentation. */
export const FALLBACK_CATEGORY: Readonly<CategoryPresentation> = {
  name: 'Other',
  icon: 'category',
  color: '#8e909a',
};

/**
 * Presentation for a (possibly missing) category. Every screen, list, chart and
 * the PDF report goes through this, so an unknown category looks the same
 * everywhere.
 */
export function categoryPresentation(
  cat?: Pick<CategoryLite, 'name' | 'icon' | 'color'> | null,
): CategoryPresentation {
  return {
    name: cat?.name ?? FALLBACK_CATEGORY.name,
    icon: (cat?.icon as MaterialIconName | undefined) ?? FALLBACK_CATEGORY.icon,
    color: cat?.color ?? FALLBACK_CATEGORY.color,
  };
}

export interface DefaultCategory {
  name: string;
  icon: MaterialIconName;
  color: string;
  kind: 'expense' | 'income';
}

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Food & Dining', icon: 'restaurant', color: '#ffdfa7', kind: 'expense' },
  { name: 'Beverages', icon: 'local-cafe', color: '#d8e3ff', kind: 'expense' },
  { name: 'Groceries', icon: 'shopping-basket', color: '#adc7ff', kind: 'expense' },
  { name: 'Transport', icon: 'directions-car', color: '#a8c8ff', kind: 'expense' },
  { name: 'Housing', icon: 'home', color: '#c4c6d0', kind: 'expense' },
  { name: 'Utilities', icon: 'bolt', color: '#ffdfa7', kind: 'expense' },
  { name: 'Health', icon: 'medical-services', color: '#ffb4ab', kind: 'expense' },
  { name: 'Entertainment', icon: 'movie', color: '#d8e3ff', kind: 'expense' },
  { name: 'Shopping', icon: 'shopping-bag', color: '#adc7ff', kind: 'expense' },
  { name: 'Other', icon: 'category', color: '#8e909a', kind: 'expense' },
  { name: 'Заплата', icon: 'payments', color: '#d8e3ff', kind: 'income' },
  { name: 'Друг приход', icon: 'account-balance-wallet', color: '#c4c6d0', kind: 'income' },
] as const;

/**
 * Unified merchant knowledge: [pattern, brand display name | null, category].
 * First match wins for BOTH brand normalization (rows with a brand) and
 * category guessing. dsk-import derives its BRAND_RULES from this table.
 */
export const MERCHANT_TABLE: ReadonlyArray<readonly [RegExp, string | null, string]> = [
  // ── PERSONAL MERCHANTS (household-specific overrides) ────────────────────
  // Add [/pattern/i, null, 'Category'] lines here for small local shops.
  // These run FIRST, so they always win over the generic rules below.

  // ── BEVERAGES (before Groceries so "coffee" inside a market name wins) ───
  [/starbucks|coffee\b|cafe\b|кафе/i, null, 'Beverages'],

  // ── GROCERIES ────────────────────────────────────────────────────────────
  [/\blidl\b/i, 'Lidl', 'Groceries'],
  [/kaufland/i, 'Kaufland', 'Groceries'],
  [/billa/i, 'Billa', 'Groceries'],
  [/fantastico/i, 'Fantastico', 'Groceries'],
  [/t[\s-]market|\bmarket\b|\bcba\b|metro\s+cash|супермаркет|магазин/i, null, 'Groceries'],

  // ── FOOD & DINING ────────────────────────────────────────────────────────
  [/restaurant|mcdonald|kfc|pizza|burger|kebab|\bbar\b|grill|грил|ресторан|glovo/i, null, 'Food & Dining'],

  // ── TRANSPORT ────────────────────────────────────────────────────────────
  [/\bomv\b/i, 'OMV', 'Transport'],
  [/shell/i, 'Shell', 'Transport'],
  [/\beko\b|lukoil|petrol\b|бензин|\bbolt\b|uber|\btaxi\b|такси/i, null, 'Transport'],

  // ── HEALTH ───────────────────────────────────────────────────────────────
  [/sopharmacy/i, 'SOpharmacy', 'Health'],
  [/apteka|аптека|pharma|аптеч|болница|hospital|clinic|медицин|\bsmdl\b|лаборатор/i, null, 'Health'],

  // ── ENTERTAINMENT ────────────────────────────────────────────────────────
  [/netflix/i, 'Netflix', 'Entertainment'],
  [/spotify/i, 'Spotify', 'Entertainment'],
  [/anthropic/i, 'Anthropic', 'Entertainment'],
  [/hbo|youtube|\bsteam\b|openai|cinema|kino|кино/i, null, 'Entertainment'],

  // ── UTILITIES ────────────────────────────────────────────────────────────
  [/vivacom|\ba1\b|yettel|telenor|топлофикация|toplofikatsia|в\s+и\s+к|(?<![а-яА-Я])вик(?![а-яА-Я])|водоснабд|електро|(?<![а-яА-Я])ток(?![а-яА-Я])|(?<![а-яА-Я])вода(?![а-яА-Я])|internet|интернет/i, null, 'Utilities'],

  // ── HOUSING ──────────────────────────────────────────────────────────────
  [/\brent\b|наем|mortgage|ипотек/i, null, 'Housing'],

  // ── SHOPPING ─────────────────────────────────────────────────────────────
  [/\bdm\b/i, 'dm', 'Shopping'],
  [/emag|technopolis|technomarket|zara|h&m|pepco|bulmag|\bmall\b|(?<![а-яА-Я])мол(?![а-яА-Я])|amazon|ikea|jysk/i, null, 'Shopping'],
];

/** Brand normalization rules, derived — consumed by services/dsk-import.ts. */
export const BRAND_RULES: ReadonlyArray<readonly [RegExp, string]> = MERCHANT_TABLE.filter(
  (row): row is readonly [RegExp, string, string] => row[1] !== null,
).map(([re, brand]) => [re, brand] as const);

/**
 * Guess a default category name from a merchant string.
 * Returns 'Other' when nothing matches.
 */
export function guessCategory(merchant: string): string {
  for (const [pattern, , category] of MERCHANT_TABLE) {
    if (pattern.test(merchant)) return category;
  }
  return 'Other';
}

const INCOME_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/заплата|salary|payroll|възнаграждение|осигур|пенси/i, 'Заплата'],
];

/** Guess an income category name; fallback 'Друг приход'. */
export function guessIncomeCategory(merchant: string): string {
  for (const [pattern, category] of INCOME_RULES) {
    if (pattern.test(merchant)) return category;
  }
  return 'Друг приход';
}

/**
 * Map a merchant to a household category id by name. Uses `guessCategory`
 * (or `guessIncomeCategory` for income) for the rule match, then looks the
 * resulting name up in the household's seeded categories of the matching
 * `kind`. Falls back to the household's `Other` / `Друг приход` category,
 * then null.
 */
export function resolveCategoryId(
  merchant: string,
  categories: ReadonlyArray<{ id: string; name: string; kind?: 'expense' | 'income' }>,
  kind: 'expense' | 'income' = 'expense',
): string | null {
  const pool = categories.filter((c) => (c.kind ?? 'expense') === kind);
  const guessed = kind === 'income' ? guessIncomeCategory(merchant) : guessCategory(merchant);
  const match = pool.find((c) => c.name === guessed);
  if (match) return match.id;
  const fallbackName = kind === 'income' ? 'Друг приход' : 'Other';
  const fallback = pool.find((c) => c.name === fallbackName);
  return fallback ? fallback.id : null;
}
