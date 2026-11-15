import { Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { ProgressBar } from '@/components/ProgressBar';
import { SectionLabel } from '@/components/SectionLabel';
import { formatCurrency } from '@/lib/formatCurrency';
import type { CategorySpend } from '@/features/transactions/dashboard';

interface CategoryBreakdownListProps {
  rows: CategorySpend[];
}

/** Spending by category. */
export function CategoryBreakdownList({ rows }: CategoryBreakdownListProps) {
  return (
    <>
      <HairlineDivider className="my-xl" />

      <SectionLabel className="mb-lg">Разходи по категория</SectionLabel>
      {rows.length === 0 ? (
        <Text className="font-inter text-body-md text-on-surface-variant">
          Няма разходи за този период.
        </Text>
      ) : (
        <View className="gap-lg">
          {rows.map((c) => (
            <View key={c.id} className="gap-sm">
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-md">
                  <View
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: c.color }}
                  />
                  <Text className="font-inter text-body-md text-on-surface">
                    {c.name}
                  </Text>
                </View>
                <Text className="font-inter-semibold text-data-mono text-on-surface">
                  {formatCurrency(c.totalCents)}
                </Text>
              </View>
              <ProgressBar fraction={c.fraction} color={c.color} minFraction={0.02} />
            </View>
          ))}
        </View>
      )}
    </>
  );
}
