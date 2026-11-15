import { colors, tailwindColors } from './theme';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tailwindConfig = require('../tailwind.config.js') as {
  theme: { extend: { colors: Record<string, string> } };
};

describe('theme tokens', () => {
  it('are 6-digit hex colours, except the translucent placeholder and hairline', () => {
    const { placeholder: _placeholder, hairline: _hairline, ...opaque } = colors;
    Object.values(opaque).forEach((c) => expect(c).toMatch(/^#[0-9a-f]{6}$/));
  });

  it('placeholder is on-surface-variant at 30% opacity', () => {
    const [r, g, b] = [1, 3, 5].map((i) =>
      parseInt(colors.onSurfaceVariant.slice(i, i + 2), 16),
    );
    expect(colors.placeholder).toBe(`rgba(${r},${g},${b},0.3)`);
  });

  it('hairline is white at 5%', () => {
    expect(colors.hairline).toBe('rgba(255,255,255,0.05)');
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
