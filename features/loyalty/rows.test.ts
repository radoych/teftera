import type { LoyaltyCardRow } from './dbTypes';
import { isNicknameTakenError, parseCodeFormat, toLoyaltyCard } from './rows';

const row = (over: Partial<LoyaltyCardRow> = {}): LoyaltyCardRow => ({
  id: 'c1',
  household_id: 'h1',
  vendor_id: null,
  nickname: 'Мария',
  code: '5901234123457',
  code_format: 'ean13',
  color: '#adc7ff',
  note: null,
  created_by: null,
  created_at: '2026-11-15T10:00:00Z',
  updated_at: '2026-11-15T10:00:00Z',
  ...over,
});

describe('parseCodeFormat', () => {
  it('passes known formats through', () => {
    for (const f of ['ean13', 'ean8', 'code128', 'qr'] as const) {
      expect(parseCodeFormat(f, 'x')).toBe(f);
    }
  });

  it('re-detects from the code when the stored format is unknown', () => {
    expect(parseCodeFormat('upc', '5901234123457')).toBe('ean13');
    expect(parseCodeFormat('', 'ABC')).toBe('code128');
  });
});

describe('toLoyaltyCard', () => {
  it('narrows code_format and keeps every other column', () => {
    const card = toLoyaltyCard(row({ code_format: 'code128', code: 'AB12' }));
    expect(card).toEqual({ ...row({ code: 'AB12' }), code_format: 'code128' });
  });
});

describe('isNicknameTakenError', () => {
  it('recognises the unique (household, vendor, nickname) violation', () => {
    expect(
      isNicknameTakenError({
        code: '23505',
        message:
          'duplicate key value violates unique constraint "loyalty_cards_household_id_vendor_id_nickname_key"',
      }),
    ).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isNicknameTakenError({ code: '23514', message: 'check' })).toBe(false);
    expect(isNicknameTakenError(new Error('network'))).toBe(false);
    expect(isNicknameTakenError(null)).toBe(false);
    expect(isNicknameTakenError('23505')).toBe(false);
  });
});
