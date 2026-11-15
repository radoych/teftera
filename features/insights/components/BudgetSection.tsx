import { MaterialIcons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { ProgressBar } from '@/components/ProgressBar';
import { SectionLabel } from '@/components/SectionLabel';
import { budgetStateColor } from '@/features/budgets/progress';
import type { BudgetProgress } from '@/features/budgets/types';
import type { CategoryLite } from '@/features/transactions/types';
import { categoryPresentation } from '@/lib/categories';
import { formatCurrency } from '@/lib/formatCurrency';
import { colors } from '@/lib/theme';

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
                <ProgressBar fraction={p.pct / 100} color={budgetStateColor(p.state)} />
                <Text
                  className="font-inter text-label-md"
                  style={{ color: remaining < 0 ? colors.error : colors.onSurfaceVariant }}
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
