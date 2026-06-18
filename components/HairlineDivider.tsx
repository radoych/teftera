import { StyleSheet, View, type ViewProps } from 'react-native';

/**
 * Hairline section separator. The whole app is flat (no cards) — sections are
 * divided by these instead. Exact spec: hairlineWidth, rgba(255,255,255,0.05).
 */
export function HairlineDivider({ style, ...rest }: ViewProps) {
  return <View style={[styles.divider, style]} {...rest} />;
}

const styles = StyleSheet.create({
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.05)',
    width: '100%',
  },
});
