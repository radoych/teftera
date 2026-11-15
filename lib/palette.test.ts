import { COLOR_CHOICES } from './palette';

describe('COLOR_CHOICES', () => {
  it('are unique hex colours', () => {
    COLOR_CHOICES.forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
    expect(new Set(COLOR_CHOICES).size).toBe(COLOR_CHOICES.length);
  });

  it('never include the lime anomaly accent family', () => {
    const lime = ['#c3f400', '#abd600', '#556d00'];
    COLOR_CHOICES.forEach((c) => expect(lime).not.toContain(c));
  });
});
