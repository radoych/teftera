import { makeItem, makeList } from './fixtures';
import { buildListViews } from './views';

describe('buildListViews', () => {
  const lists = [
    makeList({ id: 'l1', vendor_id: 'v1', name: 'Kaufland', loyalty_card_id: 'c1' }),
    makeList({ id: 'l2', vendor_id: null, name: 'Старо име', loyalty_card_id: 'gone' }),
    makeList({ id: 'l3', vendor_id: 'v-unknown', name: 'Снимка' }),
  ];
  const items = [
    makeItem({ id: 'a', list_id: 'l1' }),
    makeItem({ id: 'b', list_id: 'l1', checked_at: '2026-11-02T10:00:00.000Z' }),
  ];
  const vendorName = (id: string) => (id === 'v1' ? 'Kaufland BG' : undefined);
  const cardNickname = (id: string) => (id === 'c1' ? 'Радо' : undefined);

  const views = buildListViews(lists, items, vendorName, cardNickname);

  it('sorts with sortLists and counts items per list', () => {
    expect(views.map((v) => v.list.id)).toEqual(['l1', 'l2', 'l3']);
    expect(views[0]?.counts).toEqual({ total: 2, open: 1, done: 1 });
    expect(views[1]?.counts).toEqual({ total: 0, open: 0, done: 0 });
  });

  it("titles a list with its vendor's current name, else the snapshot", () => {
    expect(views.map((v) => v.title)).toEqual(['Kaufland BG', 'Старо име', 'Снимка']);
  });

  it('resolves the card nickname, null when missing', () => {
    expect(views.map((v) => v.cardNickname)).toEqual(['Радо', null, null]);
  });
});
