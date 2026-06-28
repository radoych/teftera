import { View, type DimensionValue } from 'react-native';

/** A neutral loading placeholder block (no shimmer). */
export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
}: {
  height?: number;
  width?: DimensionValue;
  radius?: number;
}) {
  return (
    <View
      className="bg-surface-container-high"
      style={{ height, width, borderRadius: radius, opacity: 0.6 }}
    />
  );
}
