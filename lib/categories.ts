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

/**
 * Keyword → category name rules. First match wins.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PERSONAL MERCHANTS
 * Add [/pattern/i, 'Category'] lines here for small local shops you frequent.
 * These run FIRST, so they always win over the generic rules below.
 * Example (uncomment and edit):
 *   [/пекарна иванови|petko butcher/i, 'Food & Dining'],
 * ─────────────────────────────────────────────────────────────────────────────
 */
const MERCHANT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // ── PERSONAL MERCHANTS (household-specific overrides) ────────────────────
  // [/your-local-shop-name/i, 'Groceries'],   ← add your own lines here

  // ── BEVERAGES ─────────────────────────────────────────────────────────────
  // Must come before Groceries so "coffee" inside a supermarket name still wins
  [/starbucks|coffee\b|cafe\b|кафе/i, 'Beverages'],

  // ── GROCERIES ─────────────────────────────────────────────────────────────
  [/\blidl\b|kaufland|billa|fantastico|t[\s-]market|\bmarket\b|\bcba\b|metro\s+cash|супермаркет|магазин/i, 'Groceries'],

  // ── FOOD & DINING ─────────────────────────────────────────────────────────
  [/restaurant|mcdonald|kfc|pizza|burger|kebab|\bbar\b|grill|грил|ресторан|glovo/i, 'Food & Dining'],

  // ── TRANSPORT ─────────────────────────────────────────────────────────────
  [/\bomv\b|shell|\beko\b|lukoil|petrol\b|бензин|\bbolt\b|uber|\btaxi\b|такси/i, 'Transport'],

  // ── HEALTH ────────────────────────────────────────────────────────────────
  [/apteka|аптека|sopharmacy|pharma|аптеч|болница|hospital|clinic|медицин|\bsmdl\b|лаборатор/i, 'Health'],

  // ── ENTERTAINMENT ─────────────────────────────────────────────────────────
  [/netflix|spotify|hbo|youtube|\bsteam\b|anthropic|openai|cinema|kino|кино/i, 'Entertainment'],

  // ── UTILITIES ─────────────────────────────────────────────────────────────
  [/vivacom|\ba1\b|yettel|telenor|топлофикация|toplofikatsia|в\s+и\s+к|(?<![а-яА-Я])вик(?![а-яА-Я])|водоснабд|електро|(?<![а-яА-Я])ток(?![а-яА-Я])|(?<![а-яА-Я])вода(?![а-яА-Я])|internet|интернет/i, 'Utilities'],

  // ── HOUSING ───────────────────────────────────────────────────────────────
  [/\brent\b|наем|mortgage|ипотек/i, 'Housing'],

  // ── SHOPPING ──────────────────────────────────────────────────────────────
  [/emag|technopolis|technomarket|zara|h&m|pepco|bulmag|\bmall\b|(?<![а-яА-Я])мол(?![а-яА-Я])|amazon|ikea|jysk/i, 'Shopping'],
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
