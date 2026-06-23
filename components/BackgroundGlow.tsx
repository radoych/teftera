import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

/**
 * Ambient background glows: a faint blue glow top-right and a subtle lime glow
 * bottom-left, per the design spec. Sits behind all content (zIndex -1) and is
 * non-interactive.
 *
 * Note: the lime tone here is a sanctioned ambient glow only. The anomaly accent
 * (#c3f400) must never be used on regular UI elements.
 */
export function BackgroundGlow() {
  const { width, height } = useWindowDimensions();

  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id="blueGlow" cx="100%" cy="0%" r="70%">
            <Stop offset="0" stopColor="#adc7ff" stopOpacity={0.14} />
            <Stop offset="1" stopColor="#adc7ff" stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="limeGlow" cx="0%" cy="100%" r="60%">
            <Stop offset="0" stopColor="#c3f400" stopOpacity={0.06} />
            <Stop offset="1" stopColor="#c3f400" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width={width} height={height} fill="#121316" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#blueGlow)" />
        <Rect x="0" y="0" width={width} height={height} fill="url(#limeGlow)" />
      </Svg>
    </View>
  );
}
