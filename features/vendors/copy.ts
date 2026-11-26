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

export interface MergeIntoCounts {
  /** The vendor that disappears. */
  source: string;
  /** The vendor that absorbs it. */
  target: string;
  /** The source's recognized names, its own name excluded. */
  aliases: number;
  cards: number;
  sourceHasList: boolean;
  targetHasList: boolean;
}

/**
 * What `merge_vendors(source, target)` does, line by line, for the confirm
 * step (mirrors migration 20261115130200_shopping_lists.sql): names move as
 * recognized names, cards move, the list moves — or, when both have one, its
 * items are appended to the target's list. Transactions are untouched.
 */
export function mergeIntoLines(c: MergeIntoCounts): string[] {
  const lines = [`„${c.source}“ изчезва като отделен търговец.`];
  lines.push(
    c.aliases > 0
      ? `Името „${c.source}“ и ${aliasCountLabel(c.aliases)} стават разпознати имена на „${c.target}“.`
      : `Името „${c.source}“ става разпознато име на „${c.target}“.`,
  );
  if (c.cards > 0) {
    lines.push(
      `${cardCountLabel(c.cards)} ${c.cards === 1 ? 'минава' : 'минават'} към „${c.target}“.`,
    );
  }
  if (c.sourceHasList) {
    lines.push(
      c.targetHasList
        ? `Продуктите от списъка на „${c.source}“ се добавят към списъка на „${c.target}“.`
        : `Списъкът за пазаруване минава към „${c.target}“.`,
    );
  }
  lines.push('Транзакциите остават непроменени.');
  return lines;
}

/** "1 транзакция" / "4 транзакции". */
export const transactionCountLabel = (n: number): string =>
  n === 1 ? '1 транзакция' : `${n} транзакции`;

/**
 * Message of the "apply to existing?" confirm after a vendor's default
 * category changes: "3 транзакции на Lidl са с друга категория."
 */
export const recategorizeMessage = (n: number, vendorName: string): string =>
  `${transactionCountLabel(n)} на ${vendorName} ${n === 1 ? 'е' : 'са'} с друга категория.`;
