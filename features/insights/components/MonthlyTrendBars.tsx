import { Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { SectionLabel } from '@/components/SectionLabel';
import type { TrendMonth } from '@/features/insights/aggregate';

interface MonthlyTrendBarsProps {
  trend: TrendMonth[];
}

/** Monthly trend — fixed last 6 months (range pill ignored). */
export function MonthlyTrendBars({ trend }: MonthlyTrendBarsProps) {
  return (
    <>
      <HairlineDivider className="my-xl" />

      <SectionLabel className="mb-lg">Месечна тенденция</SectionLabel>
      <View className="h-32 flex-row items-end justify-between gap-md">
        {trend.map((m) => (
          <View key={m.label} className="flex-1 items-center gap-sm">
            <View
              className={`w-full rounded-t-sm ${m.isCurrent ? 'border-t-2 border-primary bg-primary/40' : 'bg-surface-container-highest'}`}
              style={{ height: `${Math.max(m.fraction * 100, 2)}%` }}
            />
            <Text
              className={`font-inter text-[10px] ${m.isCurrent ? 'text-primary' : 'text-on-surface-variant opacity-60'}`}
            >
              {m.label}
            </Text>
          </View>
        ))}
      </View>
    </>
  );
}
