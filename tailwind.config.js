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
      colors: {
        background: '#121316',
        surface: '#121316',
        'surface-container-lowest': '#0d0e11',
        'surface-container-low': '#1a1c1f',
        'surface-container': '#1e2023',
        'surface-container-high': '#292a2d',
        'surface-container-highest': '#343538',
        'surface-bright': '#38393c',
        'surface-variant': '#343538',
        primary: '#d8e3ff',
        'primary-container': '#adc7ff',
        'on-primary': '#112f5e',
        'on-primary-container': '#385283',
        'surface-tint': '#adc7ff',
        // ANOMALY ACCENT ONLY — never use for anything else.
        'secondary-fixed': '#c3f400',
        'secondary-fixed-dim': '#abd600',
        'secondary-container': '#c3f400',
        'on-secondary-container': '#556d00',
        tertiary: '#ffdfa7',
        'tertiary-container': '#ecc16f',
        'on-surface': '#e3e2e6',
        'on-background': '#e3e2e6',
        'on-surface-variant': '#c4c6d0',
        outline: '#8e909a',
        'outline-variant': '#44474f',
        error: '#ffb4ab',
        'error-container': '#93000a',
      },
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
