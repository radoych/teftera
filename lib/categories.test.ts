import { DEFAULT_CATEGORIES, guessCategory } from './categories';

describe('guessCategory', () => {
  it('matches known merchants', () => {
    expect(guessCategory('Starbucks Coffee')).toBe('Beverages');
    expect(guessCategory('LIDL Sofia')).toBe('Groceries');
    expect(guessCategory('Shell Station')).toBe('Transport');
  });

  it('matches Bulgarian keywords', () => {
    expect(guessCategory('Аптека 36.6')).toBe('Health');
  });

  it('falls back to Other', () => {
    expect(guessCategory('Some Unknown Place')).toBe('Other');
  });

  it('every default category name is unique', () => {
    const names = DEFAULT_CATEGORIES.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('always has an Other category for the fallback', () => {
    expect(DEFAULT_CATEGORIES.some((c) => c.name === 'Other')).toBe(true);
  });
});
