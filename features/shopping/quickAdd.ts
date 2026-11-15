// features/shopping/quickAdd.ts — parse a quick-add line into name + quantity. Pure.
import type { QuickAddDraft } from './types';

// A count: "2", "1.5", "1,5".
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
// Multiplication marks: Latin x/X, the × sign, and Cyrillic х/Х (same key on a BG layout).
const TIMES = '[xX×хХ]';

/** "мляко x2" · "мляко ×2" · "мляко * 2" · "мляко 2x". */
const TRAILING = new RegExp(String.raw`^(.+?)\s+(?:(?:${TIMES}|\*)\s*${NUM}|${NUM}\s*${TIMES})$`, 'u');
/** "2 мляко" · "2x мляко" · "2бр мляко" · "3 бр. яйца" · "1.5 кг картофи". */
const LEADING = new RegExp(String.raw`^${NUM}(?:\s*(?:${TIMES}|бр\.?))?\s+(.+)$`, 'iu');

/**
 * Split a typed line into an item name and an optional quantity. A trailing
 * multiplier wins over a leading count; units stay part of the name
 * ("1.5 кг картофи" → "кг картофи" × "1.5") so nothing typed is lost. Returns
 * null for a blank line. Never produces a blank name — a lone "2" is a name.
 */
export function parseQuickAdd(text: string): QuickAddDraft | null {
  const clean = text.trim().replace(/\s+/g, ' ');
  if (!clean) return null;

  const trailing = TRAILING.exec(clean);
  if (trailing) {
    const [, name, a, b] = trailing;
    const quantity = a ?? b;
    if (name && quantity) return { name, quantity };
  }

  const leading = LEADING.exec(clean);
  if (leading) {
    const [, quantity, name] = leading;
    if (name && quantity) return { name, quantity };
  }

  return { name: clean, quantity: null };
}
