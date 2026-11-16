import {
  aliasCountLabel,
  cardCountLabel,
  deleteVendorMessage,
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
