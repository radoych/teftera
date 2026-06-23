import { parseManualEntry } from './schema';

const base = { amount: '12,50', merchant: 'Billa', note: '', date: '2026-06-22' };

describe('parseManualEntry', () => {
  it('parses a valid entry to integer cents and trims fields', () => {
    const r = parseManualEntry({ ...base, merchant: '  Billa  ', note: '  lunch ' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual({
        amountCents: 1250,
        merchant: 'Billa',
        note: 'lunch',
        date: '2026-06-22',
      });
    }
  });

  it('maps an empty note to null', () => {
    const r = parseManualEntry({ ...base, note: '   ' });
    expect(r.success && r.data.note).toBeNull();
  });

  it('rejects a zero or negative amount', () => {
    const zero = parseManualEntry({ ...base, amount: '0' });
    const neg = parseManualEntry({ ...base, amount: '-5' });
    expect(zero.success).toBe(false);
    expect(neg.success).toBe(false);
    if (!zero.success) expect(zero.errors.amount).toBeTruthy();
  });

  it('rejects an unparseable amount', () => {
    const r = parseManualEntry({ ...base, amount: 'abc' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.amount).toBeTruthy();
  });

  it('rejects an empty merchant', () => {
    const r = parseManualEntry({ ...base, merchant: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.merchant).toBeTruthy();
  });

  it('rejects an invalid date', () => {
    const r = parseManualEntry({ ...base, date: '2026-02-30' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.errors.date).toBeTruthy();
  });
});
