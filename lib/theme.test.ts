import { colors, tailwindColors } from './theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwindConfig = require('../tailwind.config.js') as {
  theme: { extend: { colors: Record<string, string> } };
};

describe('theme tokens', () => {
  it('are all 6-digit hex colours', () => {
    Object.values(colors).forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
  });

  it('anomaly is an alias of secondary-fixed', () => {
    expect(colors.anomaly).toBe(colors.secondaryFixed);
    expect(tailwindColors.anomaly).toBe(tailwindColors['secondary-fixed']);
  });

  it('every camel-cased token has a tailwind counterpart with the same value', () => {
    const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
    Object.entries(colors).forEach(([k, v]) => {
      expect(tailwindColors[kebab(k) as keyof typeof tailwindColors]).toBe(v);
    });
    expect(Object.keys(tailwindColors)).toHaveLength(Object.keys(colors).length);
  });

  it('tailwind.config.js uses the theme module as its single colour source', () => {
    expect(tailwindConfig.theme.extend.colors).toEqual(tailwindColors);
  });
});
