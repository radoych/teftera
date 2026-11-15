import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { SectionLabel } from '@/components/SectionLabel';
import type { BudgetProgress } from '@/features/budgets/types';
import type { CategoryLite } from '@/features/transactions/types';
import { categoryPresentation } from '@/lib/categories';
import { formatCurrency } from '@/lib/formatCurrency';

interface BudgetSectionProps {
  rows: BudgetProgress[];
  categoryById: Map<string, CategoryLite>;
}

/** Budget vs Actual — fixed to current-month + household; range/person pills ignored. */
export function BudgetSection({ rows, categoryById }: BudgetSectionProps) {
  return (
    <>
      <HairlineDivider className="my-xl" />

      <SectionLabel className="mb-lg">Бюджет</SectionLabel>
      {rows.length === 0 ? (
        <Text className="font-inter text-body-md text-on-surface-variant">
          Задай бюджети от Профил → Управление на бюджети.
        </Text>
      ) : (
        <View className="gap-lg">
          {rows.map((p) => {
            const { icon, color: iconColor, name } = categoryPresentation(
              categoryById.get(p.categoryId),
            );
            const barColor =
              p.state === 'over'
                ? '#ffb4ab'
                : p.state === 'warning'
                  ? '#ffdfa7'
                  : '#adc7ff';
            const remaining = p.budgetCents - p.spentCents;
            return (
              <View key={p.categoryId} className="gap-sm">
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-md">
                    <MaterialIcons name={icon} size={16} color={iconColor} />
                    <Text className="font-inter text-body-md text-on-surface">
                      {name}
                    </Text>
                  </View>
                  <Text className="font-inter-semibold text-data-mono text-on-surface">
                    {formatCurrency(p.spentCents)} / {formatCurrency(p.budgetCents)}
                  </Text>
                </View>
                <View
                  className="h-1.5 overflow-hidden bg-surface-container"
                  style={{ borderRadius: 9999 }}
                >
                  <View
                    className="h-full"
                    style={{
                      width: `${Math.min(p.pct, 100)}%`,
                      backgroundColor: barColor,
                      borderRadius: 9999,
                    }}
                  />
                </View>
                <Text
                  className="font-inter text-label-md"
                  style={{ color: remaining < 0 ? '#ffb4ab' : '#c4c6d0' }}
                >
                  {remaining < 0
                    ? `Над бюджета с ${formatCurrency(-remaining)}`
                    : `Остава ${formatCurrency(remaining)}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </>
  );
}
