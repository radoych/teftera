// features/vendors/learn.ts — when a receipt's raw merchant becomes a recognized name (pure).
import { merchantKey } from './key';
import type { VendorIndex } from './types';

/**
 * Learn `rawExtracted` (what Gemini read off the receipt) as an alias of the
 * vendor the user confirmed only when it is non-blank, differs from the final
 * name, and is not already recognized (by this or any other vendor — a raw
 * name that maps elsewhere is never silently re-pointed mid-save).
 */
export function shouldLearnAlias(
  rawExtracted: string,
  finalName: string,
  index: VendorIndex,
): boolean {
  const key = merchantKey(rawExtracted);
  if (!key) return false;
  if (key === merchantKey(finalName)) return false;
  return !index.byKey.has(key);
}
