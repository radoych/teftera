import { initials } from './initials';

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    expect(initials('Радослав Иванов')).toBe('РИ');
    expect(initials('anna maria smith')).toBe('AM');
  });

  it('handles a single name', () => {
    expect(initials('мария')).toBe('М');
  });

  it('ignores extra whitespace', () => {
    expect(initials('  Ivan   Petrov ')).toBe('IP');
  });

  it('falls back to "?" for an empty or blank name', () => {
    expect(initials('')).toBe('?');
    expect(initials('   ')).toBe('?');
  });

  it('keeps astral characters whole', () => {
    expect(initials('😀 Smile')).toBe('😀S');
  });
});
