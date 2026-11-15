import { colors } from '@/lib/theme';
import { budgetProgress, budgetStateColor } from './progress';

describe('budgetProgress', () => {
  const spend = [
    { id: 'groceries', totalCents: 16000 },
    { id: 'dining', totalCents: 5000 },
  ];

  it('computes pct and under/warning/over per budgeted category', () => {
    const resolved = new Map([
      ['groceries', 20000], // 80% -> warning
      ['dining', 20000], // 25% -> under
    ]);
    const rows = budgetProgress(resolved, spend);
    const g = rows.find((r) => r.categoryId === 'groceries')!;
    expect(g).toMatchObject({ budgetCents: 20000, spentCents: 16000, pct: 80, state: 'warning' });
    expect(rows.find((r) => r.categoryId === 'dining')!.state).toBe('under');
  });

  it('treats exactly 80% as warning and just below as under', () => {
    expect(budgetProgress(new Map([['x', 10000]]), [{ id: 'x', totalCents: 7999 }])[0]!.state).toBe('under');
    expect(budgetProgress(new Map([['x', 10000]]), [{ id: 'x', totalCents: 8000 }])[0]!.state).toBe('warning');
  });

  it('treats exactly 100% as warning and just above as over', () => {
    expect(budgetProgress(new Map([['x', 10000]]), [{ id: 'x', totalCents: 10000 }])[0]!.state).toBe('warning');
    expect(budgetProgress(new Map([['x', 10000]]), [{ id: 'x', totalCents: 10001 }])[0]!.state).toBe('over');
  });

  it('includes budgeted categories with zero spend', () => {
    const rows = budgetProgress(new Map([['x', 10000]]), []);
    expect(rows[0]!).toMatchObject({ spentCents: 0, pct: 0, state: 'under' });
  });

  it('ignores spend for categories without a budget', () => {
    const rows = budgetProgress(new Map(), [{ id: 'x', totalCents: 9999 }]);
    expect(rows).toHaveLength(0);
  });

  it('sorts by pct descending', () => {
    const resolved = new Map([['a', 10000], ['b', 10000]]);
    const rows = budgetProgress(resolved, [{ id: 'a', totalCents: 2000 }, { id: 'b', totalCents: 9000 }]);
    expect(rows.map((r) => r.categoryId)).toEqual(['b', 'a']);
  });
});

describe('budgetStateColor', () => {
  it('maps each state to its theme token', () => {
    expect(budgetStateColor('over')).toBe(colors.error);
    expect(budgetStateColor('warning')).toBe(colors.tertiary);
    expect(budgetStateColor('under')).toBe(colors.primaryContainer);
  });
});
