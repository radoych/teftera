// features/vendors/copy.ts — Bulgarian strings that depend on counts (pure).

/** "1 разпознато име" / "3 разпознати имена". */
export const aliasCountLabel = (n: number): string =>
  n === 1 ? '1 разпознато име' : `${n} разпознати имена`;

/** "1 карта" / "2 карти". */
export const cardCountLabel = (n: number): string => (n === 1 ? '1 карта' : `${n} карти`);

/** "1 търговец" / "5 търговеца" (count form after a numeral). */
export const vendorCountLabel = (n: number): string =>
  n === 1 ? '1 търговец' : `${n} търговеца`;

/**
 * Vendor-list meta line, zero parts omitted:
 * "3 разпознати имена · 1 карта · списък". Empty string when nothing to say.
 */
export function vendorMetaLine(counts: {
  aliases: number;
  cards: number;
  hasList: boolean;
}): string {
  const parts: string[] = [];
  if (counts.aliases > 0) parts.push(aliasCountLabel(counts.aliases));
  if (counts.cards > 0) parts.push(cardCountLabel(counts.cards));
  if (counts.hasList) parts.push('списък');
  return parts.join(' · ');
}

/** Delete-confirm message on the vendor detail screen (spec §10 vendor.delete.message). */
export const deleteVendorMessage = (aliases: number): string =>
  `Разпознатите имена (${aliases}) се изтриват. Картите и списъкът остават без търговец.`;
