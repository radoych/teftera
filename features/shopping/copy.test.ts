import { clearDoneTitle, listMetaLabel, progressLabel } from './copy';

describe('listMetaLabel', () => {
  it('counts what is left to take', () => {
    expect(listMetaLabel({ total: 5, open: 2, done: 3 })).toBe('2 за вземане');
  });

  it('says done when everything is taken', () => {
    expect(listMetaLabel({ total: 3, open: 0, done: 3 })).toBe('Готово');
  });

  it('says empty for a list without items', () => {
    expect(listMetaLabel({ total: 0, open: 0, done: 0 })).toBe('Празен');
  });
});

describe('clearDoneTitle', () => {
  it('uses the singular for one item', () => {
    expect(clearDoneTitle(1)).toBe('Премахване на 1 взет продукт?');
  });

  it('uses the count form otherwise', () => {
    expect(clearDoneTitle(4)).toBe('Премахване на 4 взети продукта?');
  });
});

describe('progressLabel', () => {
  it('is "done / total"', () => {
    expect(progressLabel({ total: 8, open: 5, done: 3 })).toBe('3 / 8');
  });
});
