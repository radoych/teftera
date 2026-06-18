import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { formatCurrency } from '@/lib/formatCurrency';
import type { TransactionView } from '../types';

interface TransactionRowProps {
  tx: TransactionView;
  onPress?: () => void;
  showDivider?: boolean;
}

/**
 * A single transaction row. Flagged anomalies use the anomaly accent
 * (#c3f400 / secondary-fixed): a dot on the icon, a "Маркирана" chip, lime
 * amount text, and a reason label. Income is shown in primary with a +.
 */
export function TransactionRow({ tx, onPress, showDivider = true }: TransactionRowProps) {
  const amountColor = tx.isFlagged
    ? 'text-secondary-fixed'
    : tx.isIncome
      ? 'text-primary'
      : 'text-on-surface';
  const sign = tx.isIncome ? '+' : '';

  return (
    <View>
      <Pressable
        onPress={onPress}
        className="flex-row items-center justify-between py-md active:bg-white/5">
        <View className="flex-row items-center gap-md">
          <View className="relative h-10 w-10 items-center justify-center rounded-full bg-surface-container-high">
            <MaterialIcons name={tx.icon} size={20} color={tx.iconColor} />
            {tx.isFlagged ? (
              <View className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-background bg-secondary-fixed" />
            ) : null}
          </View>
          <View>
            <View className="flex-row items-center gap-2">
              <Text className="font-jakarta-semibold text-headline-md text-on-surface">
                {tx.merchant}
              </Text>
              {tx.isFlagged ? (
                <View className="rounded-sm bg-secondary-fixed/10 px-1.5 py-0.5">
                  <Text className="font-inter-semibold text-[10px] uppercase text-secondary-fixed">
                    Маркирана
                  </Text>
                </View>
              ) : null}
            </View>
            <Text className="font-inter text-body-md text-on-surface-variant opacity-70">
              {tx.meta}
            </Text>
          </View>
        </View>
        <View className="items-end">
          <Text className={`font-inter-semibold text-headline-md ${amountColor}`}>
            {sign}
            {formatCurrency(tx.amountCents)}
          </Text>
          {tx.isFlagged && tx.flagReason ? (
            <Text className="font-inter text-[10px] text-secondary-fixed opacity-70">
              {tx.flagReason}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {showDivider ? <HairlineDivider /> : null}
    </View>
  );
}
