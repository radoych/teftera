import { Text, View } from 'react-native';
import { FloatingActionBar } from '@/components/FloatingActionBar';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { TransactionRow } from '@/features/transactions/components/TransactionRow';
import type { TransactionDayGroup } from '@/features/transactions/types';

// Static demo data — replaced with live, day-grouped Supabase data in Step 5.
const DEMO_GROUPS: TransactionDayGroup[] = [
  {
    label: 'Днес, 24 окт',
    items: [
      { id: '1', merchant: 'Apple Store', meta: 'Electronics • 10:24', amountCents: 129900, icon: 'shopping-bag', iconColor: '#d8e3ff', isFlagged: false },
      { id: '2', merchant: "L'Artisan Bistro", meta: 'Dining • 09:12', amountCents: 8450, icon: 'restaurant', iconColor: '#c4c6d0', isFlagged: true, flagReason: 'Необичайно място' },
      { id: '3', merchant: 'Uber', meta: 'Transport • 08:45', amountCents: 2412, icon: 'directions-car', iconColor: '#d8e3ff', isFlagged: false },
    ],
  },
  {
    label: 'Вчера, 23 окт',
    items: [
      { id: '4', merchant: 'Заплата', meta: 'Income • 13:00', amountCents: 840000, icon: 'account-balance-wallet', iconColor: '#ffdfa7', isFlagged: false, isIncome: true },
      { id: '5', merchant: 'Figma Pro', meta: 'Work • 11:30', amountCents: 1500, icon: 'subscriptions', iconColor: '#c4c6d0', isFlagged: false },
      { id: '6', merchant: 'Непознат търговец', meta: 'Uncategorized • 10:15', amountCents: 100, icon: 'payments', iconColor: '#c4c6d0', isFlagged: true, flagReason: 'Провери малка сума' },
      { id: '7', merchant: 'Whole Foods', meta: 'Groceries • 09:00', amountCents: 6240, icon: 'local-grocery-store', iconColor: '#c4c6d0', isFlagged: false },
    ],
  },
];

export default function HistoryScreen() {
  return (
    <Screen
      withTabBar
      floatingAboveTabBar={
        <FloatingActionBar
          actions={[
            { label: 'Филтри', icon: 'tune', variant: 'filled' },
            { label: 'Търси', icon: 'search', variant: 'ghost' },
          ]}
        />
      }>
      <View className="h-16 flex-row items-center">
        <Text className="font-jakarta-semibold text-headline-lg-mobile text-on-surface">
          История
        </Text>
      </View>

      {DEMO_GROUPS.map((group) => (
        <View key={group.label} className="mt-lg">
          <SectionLabel className="mb-sm">{group.label}</SectionLabel>
          {group.items.map((tx, i) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              showDivider={i < group.items.length - 1}
            />
          ))}
        </View>
      ))}
    </Screen>
  );
}
