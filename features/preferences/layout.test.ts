import {
  DEFAULT_DASHBOARD_SECTIONS,
  moveItem,
  resolveDashboardSections,
  setSectionVisible,
} from './layout';

describe('resolveDashboardSections', () => {
  it('returns defaults for empty/nullish input', () => {
    expect(resolveDashboardSections(null)).toEqual(DEFAULT_DASHBOARD_SECTIONS);
    expect(resolveDashboardSections([])).toEqual(DEFAULT_DASHBOARD_SECTIONS);
  });

  it('preserves stored order and visibility', () => {
    const stored = [
      { key: 'recent' as const, visible: false },
      { key: 'categories' as const, visible: true },
    ];
    expect(resolveDashboardSections(stored)).toEqual(stored);
  });

  it('appends known sections missing from storage (visible)', () => {
    const stored = [{ key: 'recent' as const, visible: true }];
    expect(resolveDashboardSections(stored)).toEqual([
      { key: 'recent', visible: true },
      { key: 'categories', visible: true },
    ]);
  });

  it('drops unknown keys', () => {
    const stored = [
      { key: 'budgets' as unknown as 'recent', visible: true },
      { key: 'recent' as const, visible: true },
      { key: 'categories' as const, visible: true },
    ];
    expect(resolveDashboardSections(stored)).toEqual([
      { key: 'recent', visible: true },
      { key: 'categories', visible: true },
    ]);
  });
});

describe('moveItem', () => {
  it('moves an item to a new index', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('is a no-op (copy) for same/out-of-range indices', () => {
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
    expect(moveItem(['a', 'b'], 0, 5)).toEqual(['a', 'b']);
  });
});

describe('setSectionVisible', () => {
  it('toggles one section immutably', () => {
    const sections = [
      { key: 'categories' as const, visible: true },
      { key: 'recent' as const, visible: true },
    ];
    const next = setSectionVisible(sections, 'categories', false);
    expect(next).toEqual([
      { key: 'categories', visible: false },
      { key: 'recent', visible: true },
    ]);
    expect(sections[0]!.visible).toBe(true); // original untouched
  });
});
