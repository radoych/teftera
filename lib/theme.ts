// Design tokens — the single source of truth for the Teftera palette.
//
// Consumed in two places:
//   • app code: `import { colors } from '@/lib/theme'` for props that cannot
//     take a className (MaterialIcons `color`, `placeholderTextColor`,
//     ActivityIndicator, Reanimated `interpolateColor`, SVG fills, …);
//   • tailwind.config.js: `require('./lib/theme.ts').tailwindColors`, so the
//     NativeWind classes (`bg-primary-container`, …) come from the same values.
//
// Because the Tailwind config loads this file outside Metro, it MUST stay
// dependency-free (no imports at all) and use only erasable TypeScript
// syntax (no enums / namespaces / parameter properties) so it loads under
// Tailwind's jiti loader and Node's native type stripping alike.

/** Camel-cased palette for use in TS/TSX. Values from CLAUDE.md → Design System. */
export const colors = {
  background: '#121316',
  surface: '#121316',
  surfaceContainerLowest: '#0d0e11',
  surfaceContainerLow: '#1a1c1f',
  surfaceContainer: '#1e2023',
  surfaceContainerHigh: '#292a2d',
  surfaceContainerHighest: '#343538',
  surfaceBright: '#38393c',
  surfaceVariant: '#343538',
  primary: '#d8e3ff',
  primaryContainer: '#adc7ff',
  onPrimary: '#112f5e',
  onPrimaryContainer: '#385283',
  surfaceTint: '#adc7ff',
  // ANOMALY ACCENT ONLY — never use the secondary family for anything else.
  secondaryFixed: '#c3f400',
  secondaryFixedDim: '#abd600',
  secondaryContainer: '#c3f400',
  onSecondaryContainer: '#556d00',
  tertiary: '#ffdfa7',
  tertiaryContainer: '#ecc16f',
  onSurface: '#e3e2e6',
  onBackground: '#e3e2e6',
  onSurfaceVariant: '#c4c6d0',
  outline: '#8e909a',
  outlineVariant: '#44474f',
  error: '#ffb4ab',
  errorContainer: '#93000a',
  /** Greppable alias for `secondaryFixed` — the lime anomaly accent. */
  anomaly: '#c3f400',
  /** Input placeholder text — on-surface-variant (#c4c6d0) at 30% opacity. */
  placeholder: 'rgba(196,198,208,0.3)',
} as const;

export type ColorToken = keyof typeof colors;

/** Kebab-cased token map in Tailwind's naming (`bg-primary-container`, …). */
export const tailwindColors = {
  background: colors.background,
  surface: colors.surface,
  'surface-container-lowest': colors.surfaceContainerLowest,
  'surface-container-low': colors.surfaceContainerLow,
  'surface-container': colors.surfaceContainer,
  'surface-container-high': colors.surfaceContainerHigh,
  'surface-container-highest': colors.surfaceContainerHighest,
  'surface-bright': colors.surfaceBright,
  'surface-variant': colors.surfaceVariant,
  primary: colors.primary,
  'primary-container': colors.primaryContainer,
  'on-primary': colors.onPrimary,
  'on-primary-container': colors.onPrimaryContainer,
  'surface-tint': colors.surfaceTint,
  'secondary-fixed': colors.secondaryFixed,
  'secondary-fixed-dim': colors.secondaryFixedDim,
  'secondary-container': colors.secondaryContainer,
  'on-secondary-container': colors.onSecondaryContainer,
  tertiary: colors.tertiary,
  'tertiary-container': colors.tertiaryContainer,
  'on-surface': colors.onSurface,
  'on-background': colors.onBackground,
  'on-surface-variant': colors.onSurfaceVariant,
  outline: colors.outline,
  'outline-variant': colors.outlineVariant,
  error: colors.error,
  'error-container': colors.errorContainer,
  anomaly: colors.anomaly,
  placeholder: colors.placeholder,
} as const;
