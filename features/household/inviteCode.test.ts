import { formatInviteCode, normalizeInviteCode } from './inviteCode';

describe('normalizeInviteCode', () => {
  it('uppercases and strips dashes/spaces', () => {
    expect(normalizeInviteCode('9f4k-7x2b')).toBe('9F4K7X2B');
    expect(normalizeInviteCode('  9f4k 7x2b ')).toBe('9F4K7X2B');
  });
});

describe('formatInviteCode', () => {
  it('groups 8 chars as XXXX-XXXX, uppercased', () => {
    expect(formatInviteCode('9f4k7x2b')).toBe('9F4K-7X2B');
    expect(formatInviteCode('9F4K7X2B')).toBe('9F4K-7X2B');
  });
  it('returns short codes unchanged (no trailing dash)', () => {
    expect(formatInviteCode('ABC')).toBe('ABC');
  });
});
