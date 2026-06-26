import { buildReceiptObjectKey } from './objectKey';

describe('buildReceiptObjectKey', () => {
  it('builds {householdId}/{uuid}.jpg', () => {
    expect(buildReceiptObjectKey('house-1', 'uuid-9')).toBe('house-1/uuid-9.jpg');
  });

  it('throws when householdId is empty', () => {
    expect(() => buildReceiptObjectKey('', 'uuid-9')).toThrow();
  });

  it('throws when uuid is empty', () => {
    expect(() => buildReceiptObjectKey('house-1', '')).toThrow();
  });
});
