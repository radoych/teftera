import { Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { formatCurrency } from '@/lib/formatCurrency';
import type { NormalizedTransaction } from '@/services/dsk-import';

export function ImportRow({ row, muted, badge }: { row: NormalizedTransaction; muted?: boolean; badge?: string }) {
  return (
    <View>
      <View className={`flex-row items-center justify-between py-md ${muted ? 'opacity-45' : ''}`}>
        <View className="flex-1 pr-3">
          <Text numberOfLines={1} className="font-inter text-body-lg text-on-surface">
            {row.merchant || 'Без търговец'}
          </Text>
          <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
            {row.date} · {row.categoryGuess}
            {row.originalCurrency === 'BGN'
              ? ` · от ${formatCurrency(row.originalAmountCents ?? 0, 'BGN')}`
              : ''}
          </Text>
        </View>
        <View className="items-end gap-1">
          <Text className="font-inter-semibold text-body-lg text-on-surface">
            {formatCurrency(row.amountEurCents)}
          </Text>
          {badge ? (
            <Text className="font-inter-semibold text-[10px] uppercase text-on-surface-variant">
              {badge}
            </Text>
          ) : null}
        </View>
      </View>
      <HairlineDivider />
    </View>
  );
}
