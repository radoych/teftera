import type { OpenAnomaly } from './api';
import { reasonByTxId } from './reasons';

describe('reasonByTxId', () => {
  it('maps transaction ids to reasons', () => {
    const open: OpenAnomaly[] = [
      { id: 'a1', transactionId: 't1', reason: 'Над обичайното', score: 3.2 },
      { id: 'a2', transactionId: 't2', reason: 'Под обичайното', score: -2.8 },
    ];
    const m = reasonByTxId(open);
    expect(m.get('t1')).toBe('Над обичайното');
    expect(m.get('t2')).toBe('Под обичайното');
    expect(m.size).toBe(2);
  });
  it('is empty for no anomalies', () => {
    expect(reasonByTxId([]).size).toBe(0);
  });
});
