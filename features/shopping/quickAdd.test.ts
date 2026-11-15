import { parseQuickAdd } from './quickAdd';

describe('parseQuickAdd', () => {
  it.each([
    // Spec §8.2 examples.
    ['мляко x2', { name: 'мляко', quantity: '2' }],
    ['2 кисело мляко', { name: 'кисело мляко', quantity: '2' }],
    ['хляб', { name: 'хляб', quantity: null }],
    ['1.5 кг картофи', { name: 'кг картофи', quantity: '1.5' }],
    // Trailing forms.
    ['мляко ×2', { name: 'мляко', quantity: '2' }],
    ['мляко * 2', { name: 'мляко', quantity: '2' }],
    ['мляко 2x', { name: 'мляко', quantity: '2' }],
    ['мляко X3', { name: 'мляко', quantity: '3' }],
    ['мляко х2', { name: 'мляко', quantity: '2' }], // Cyrillic "х"
    // Leading forms.
    ['2x мляко', { name: 'мляко', quantity: '2' }],
    ['2бр мляко', { name: 'мляко', quantity: '2' }],
    ['3 бр. яйца', { name: 'яйца', quantity: '3' }],
    ['1,5 кг ябълки', { name: 'кг ябълки', quantity: '1,5' }],
  ])('%p → %p', (input, expected) => {
    expect(parseQuickAdd(input)).toEqual(expected);
  });

  it('trims and collapses whitespace', () => {
    expect(parseQuickAdd('   кисело    мляко   x2  ')).toEqual({
      name: 'кисело мляко',
      quantity: '2',
    });
  });

  it('returns null for blank input', () => {
    expect(parseQuickAdd('')).toBeNull();
    expect(parseQuickAdd('  ')).toBeNull();
  });

  it('keeps a lone number or quantity as the name rather than producing a blank name', () => {
    expect(parseQuickAdd('2')).toEqual({ name: '2', quantity: null });
    expect(parseQuickAdd('x2')).toEqual({ name: 'x2', quantity: null });
    expect(parseQuickAdd('7up')).toEqual({ name: '7up', quantity: null });
  });

  it('does not treat a number inside the name as a quantity', () => {
    expect(parseQuickAdd('мляко 3.6%')).toEqual({ name: 'мляко 3.6%', quantity: null });
    expect(parseQuickAdd('хляб 500г')).toEqual({ name: 'хляб 500г', quantity: null });
  });
});
