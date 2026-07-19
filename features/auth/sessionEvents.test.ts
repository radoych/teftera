import { shouldSkipAuthEvent } from './sessionEvents';

describe('shouldSkipAuthEvent', () => {
  it('skips TOKEN_REFRESHED for the same, already-ready user', () => {
    expect(shouldSkipAuthEvent('TOKEN_REFRESHED', 'u1', 'u1', 'ready')).toBe(true);
  });
  it('does not skip a different user', () => {
    expect(shouldSkipAuthEvent('TOKEN_REFRESHED', 'u2', 'u1', 'ready')).toBe(false);
  });
  it('does not skip SIGNED_IN or non-ready status', () => {
    expect(shouldSkipAuthEvent('SIGNED_IN', 'u1', 'u1', 'ready')).toBe(false);
    expect(shouldSkipAuthEvent('TOKEN_REFRESHED', 'u1', 'u1', 'error')).toBe(false);
  });
});
