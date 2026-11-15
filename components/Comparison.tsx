import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { colors } from '@/lib/theme';

/**
 * Signed % delta line shared by Dashboard and Insights.
 * ▲ error-red for an increase, ▼ lime for a decrease, — grey when flat.
 * Renders nothing when `pct` is null (no baseline).
 */
export function Comparison({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return null;
  const up = pct > 0;
  const color = pct === 0 ? colors.onSurfaceVariant : up ? colors.error : colors.secondaryFixed;
  const icon = pct === 0 ? 'remove' : up ? 'arrow-upward' : 'arrow-downward';
  return (
    <View className="flex-row items-center gap-1">
      <MaterialIcons name={icon} size={14} color={color} />
      <Text style={{ color }} className="font-inter text-body-md">
        {Math.abs(pct)}% {label}
      </Text>
    </View>
  );
}
