import { makeItem, makeList } from './fixtures';
import { itemsByList, listCounts, nextPosition, sortLists, splitItems } from './order';

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('splitItems', () => {
  const items = [
    makeItem({ id: 'c', position: 2 }),
    makeItem({ id: 'a', position: 0 }),
    makeItem({ id: 'd1', position: 1, checked_at: '2026-11-02T10:00:00.000Z' }),
    makeItem({ id: 'd2', position: 3, checked_at: '2026-11-02T12:00:00.000Z' }),
    makeItem({ id: 'b', position: 1 }),
  ];

  it('keeps open items in position order and done items newest-taken first', () => {
    const { open, done } = splitItems(items, new Set());
    expect(ids(open)).toEqual(['a', 'b', 'c']);
    expect(ids(done)).toEqual(['d2', 'd1']);
  });

  it('keeps a checked item in the open group while it is settling', () => {
    const { open, done } = splitItems(items, new Set(['d1']));
    expect(ids(open)).toEqual(['a', 'b', 'd1', 'c']); // d1 ties b on position 1; id breaks it
    expect(ids(done)).toEqual(['d2']);
  });

  it('ignores settling ids that are not checked', () => {
    const { open, done } = splitItems(items, new Set(['a', 'zzz']));
    expect(ids(open)).toEqual(['a', 'b', 'c']);
    expect(ids(done)).toEqual(['d2', 'd1']);
  });

  it('breaks position ties by creation time, then id', () => {
    const tied = [
      makeItem({ id: 'y', position: 0, created_at: '2026-11-01T10:00:02.000Z' }),
      makeItem({ id: 'x', position: 0, created_at: '2026-11-01T10:00:01.000Z' }),
      makeItem({ id: 'w', position: 0, created_at: '2026-11-01T10:00:01.000Z' }),
    ];
    expect(ids(splitItems(tied, new Set()).open)).toEqual(['w', 'x', 'y']);
  });

  it('does not mutate its input', () => {
    const copy = items.map((i) => ({ ...i }));
    splitItems(items, new Set(['d1']));
    expect(items).toEqual(copy);
  });

  it('handles an empty list', () => {
    expect(splitItems([], new Set())).toEqual({ open: [], done: [] });
  });
});

describe('nextPosition', () => {
  it('is 0 for an empty list', () => {
    expect(nextPosition([])).toBe(0);
  });

  it('is max(position) + 1, regardless of order or checked state', () => {
    expect(
      nextPosition([
        makeItem({ id: 'a', position: 4 }),
        makeItem({ id: 'b', position: 9, checked_at: '2026-11-02T10:00:00.000Z' }),
        makeItem({ id: 'c', position: 1 }),
      ]),
    ).toBe(10);
  });
});

describe('listCounts', () => {
  it('counts total, open and done', () => {
    expect(
      listCounts([
        makeItem({ id: 'a' }),
        makeItem({ id: 'b', checked_at: '2026-11-02T10:00:00.000Z' }),
        makeItem({ id: 'c' }),
      ]),
    ).toEqual({ total: 3, open: 2, done: 1 });
  });

  it('is all zeros for an empty list', () => {
    expect(listCounts([])).toEqual({ total: 0, open: 0, done: 0 });
  });
});

describe('itemsByList', () => {
  it('groups items by list id', () => {
    const grouped = itemsByList([
      makeItem({ id: 'a', list_id: 'l1' }),
      makeItem({ id: 'b', list_id: 'l2' }),
      makeItem({ id: 'c', list_id: 'l1' }),
    ]);
    expect(ids(grouped.get('l1') ?? [])).toEqual(['a', 'c']);
    expect(ids(grouped.get('l2') ?? [])).toEqual(['b']);
    expect(grouped.get('l3')).toBeUndefined();
  });
});

describe('sortLists', () => {
  const at = (h: number) => `2026-11-02T${String(h).padStart(2, '0')}:00:00.000Z`;
  const lists = [
    makeList({ id: 'empty-new', updated_at: at(12) }),
    makeList({ id: 'done-old', updated_at: at(1) }),
    makeList({ id: 'open-old', updated_at: at(2) }),
    makeList({ id: 'done-new', updated_at: at(11) }),
    makeList({ id: 'open-new', updated_at: at(10) }),
    makeList({ id: 'empty-old', updated_at: at(0) }),
  ];
  const checked = '2026-11-02T09:00:00.000Z';
  const items = [
    makeItem({ id: '1', list_id: 'open-old' }),
    makeItem({ id: '2', list_id: 'open-new', checked_at: checked }),
    makeItem({ id: '3', list_id: 'open-new' }),
    makeItem({ id: '4', list_id: 'done-old', checked_at: checked }),
    makeItem({ id: '5', list_id: 'done-new', checked_at: checked }),
  ];

  it('puts lists with open items first, then fully done, then empty — each newest first', () => {
    expect(ids(sortLists(lists, items))).toEqual([
      'open-new',
      'open-old',
      'done-new',
      'done-old',
      'empty-new',
      'empty-old',
    ]);
  });

  it('does not mutate its input', () => {
    const before = ids(lists);
    sortLists(lists, items);
    expect(ids(lists)).toEqual(before);
  });
});
