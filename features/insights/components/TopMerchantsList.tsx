import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { SectionLabel } from '@/components/SectionLabel';
import { formatCurrency } from '@/lib/formatCurrency';
import type { MerchantSpend } from '@/features/insights/aggregate';

interface TopMerchantsListProps {
  merchants: MerchantSpend[];
}

/** Top merchants. */
export function TopMerchantsList({ merchants }: TopMerchantsListProps) {
  return (
    <>
      <HairlineDivider className="my-xl" />

      <SectionLabel className="mb-md">Топ търговци</SectionLabel>
      {merchants.length === 0 ? (
        <Text className="font-inter text-body-md text-on-surface-variant">
          Няма търговци за този период.
        </Text>
      ) : (
        <View>
          {merchants.map((m, i) => (
            <View key={m.merchant}>
              <View className="flex-row items-center justify-between py-md">
                <View className="flex-row items-center gap-md">
                  <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
                    <MaterialIcons name="store" size={20} color="#c4c6d0" />
                  </View>
                  <Text className="font-inter text-body-md text-on-surface">
                    {m.merchant}
                  </Text>
                </View>
                <Text className="font-inter-semibold text-data-mono text-on-surface">
                  {formatCurrency(m.totalCents)}
                </Text>
              </View>
              {i < merchants.length - 1 ? <HairlineDivider /> : null}
            </View>
          ))}
        </View>
      )}
    </>
  );
}
