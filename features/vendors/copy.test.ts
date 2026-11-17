import {
  aliasCountLabel,
  cardCountLabel,
  deleteVendorMessage,
  mergeIntoLines,
  vendorCountLabel,
  vendorMetaLine,
} from './copy';

describe('vendor copy', () => {
  it('pluralizes recognized names and cards', () => {
    expect(aliasCountLabel(1)).toBe('1 разпознато име');
    expect(aliasCountLabel(3)).toBe('3 разпознати имена');
    expect(cardCountLabel(1)).toBe('1 карта');
    expect(cardCountLabel(2)).toBe('2 карти');
    expect(vendorCountLabel(1)).toBe('1 търговец');
    expect(vendorCountLabel(12)).toBe('12 търговеца');
  });

  it('builds the meta line, omitting zero parts', () => {
    expect(vendorMetaLine({ aliases: 3, cards: 1, hasList: true })).toBe(
      '3 разпознати имена · 1 карта · списък',
    );
    expect(vendorMetaLine({ aliases: 0, cards: 2, hasList: false })).toBe('2 карти');
    expect(vendorMetaLine({ aliases: 0, cards: 0, hasList: false })).toBe('');
  });

  it('formats the delete message with the alias count', () => {
    expect(deleteVendorMessage(4)).toBe(
      'Разпознатите имена (4) се изтриват. Картите и списъкът остават без търговец.',
    );
  });
});

describe('mergeIntoLines', () => {
  const base = {
    source: 'Kaufland Stara',
    target: 'Kaufland',
    aliases: 0,
    cards: 0,
    sourceHasList: false,
    targetHasList: false,
  };

  it('describes a bare merge', () => {
    expect(mergeIntoLines(base)).toEqual([
      '„Kaufland Stara“ изчезва като отделен търговец.',
      'Името „Kaufland Stara“ става разпознато име на „Kaufland“.',
      'Транзакциите остават непроменени.',
    ]);
  });

  it('counts names and cards with agreement', () => {
    const lines = mergeIntoLines({ ...base, aliases: 2, cards: 1 });
    expect(lines[1]).toBe(
      'Името „Kaufland Stara“ и 2 разпознати имена стават разпознати имена на „Kaufland“.',
    );
    expect(lines[2]).toBe('1 карта минава към „Kaufland“.');
    expect(mergeIntoLines({ ...base, cards: 3 })[2]).toBe(
      '3 карти минават към „Kaufland“.',
    );
  });

  it('moves the list, or appends its items when both have one', () => {
    expect(mergeIntoLines({ ...base, sourceHasList: true })).toContain(
      'Списъкът за пазаруване минава към „Kaufland“.',
    );
    expect(
      mergeIntoLines({ ...base, sourceHasList: true, targetHasList: true }),
    ).toContain(
      'Продуктите от списъка на „Kaufland Stara“ се добавят към списъка на „Kaufland“.',
    );
    expect(mergeIntoLines({ ...base, targetHasList: true })).toHaveLength(3);
  });
});
