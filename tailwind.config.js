// The explicit .ts extension lets Node's native type stripping load it; on
// older Node, Tailwind's jiti fallback transpiles it instead.
const { tailwindColors } = require('./lib/theme.ts');

/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 — class-based dark theme is always-on for Teftera.
  // `darkMode: 'class'` (not the default 'media') lets the fixed dark scheme be
  // set without the web runtime throwing "Cannot manually set color scheme".
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './features/**/*.{ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      // Single source of truth: lib/theme.ts (also imported by app code as
      // `colors`). Keep that module dependency-free — this file loads it
      // outside Metro.
      colors: tailwindColors,
      fontFamily: {
        jakarta: ['PlusJakartaSans_400Regular'],
        'jakarta-medium': ['PlusJakartaSans_500Medium'],
        'jakarta-semibold': ['PlusJakartaSans_600SemiBold'],
        'jakarta-bold': ['PlusJakartaSans_700Bold'],
        inter: ['Inter_400Regular'],
        'inter-medium': ['Inter_500Medium'],
        'inter-semibold': ['Inter_600SemiBold'],
      },
      fontSize: {
        'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.8px' }],
        'headline-lg': ['28px', { lineHeight: '36px', letterSpacing: '-0.28px' }],
        'headline-lg-mobile': ['24px', { lineHeight: '32px' }],
        'headline-md': ['20px', { lineHeight: '28px' }],
        'body-lg': ['16px', { lineHeight: '26px' }],
        'body-md': ['14px', { lineHeight: '21px' }],
        'data-mono': ['14px', { lineHeight: '14px' }],
        'label-md': ['12px', { lineHeight: '12px', letterSpacing: '0.6px' }],
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '40px',
        xxl: '64px',
      },
      borderRadius: {
        // True pills — Stitch's `full` token was only 12px; override to 9999.
        full: '9999px',
        pill: '9999px',
      },
    },
  },
  plugins: [],
};
