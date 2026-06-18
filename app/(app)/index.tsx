import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { formatCurrency } from '@/lib/formatCurrency';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialIcons>['name'];

interface DemoEntry {
  id: string;
  merchant: string;
  meta: string;
  amountCents: number;
  icon: IconName;
  color: string;
  flagged?: boolean;
}

// Static demo data — replaced with live Supabase data in Step 5.
const DEMO_ENTRIES: DemoEntry[] = [
  { id: '1', merchant: 'Starbucks', meta: 'Beverages • 08:42', amountCents: 450, icon: 'local-cafe', color: '#d8e3ff' },
  { id: '2', merchant: 'Grocery Market', meta: 'Groceries • Вчера', amountCents: 6500, icon: 'shopping-basket', color: '#ffdfa7' },
  { id: '3', merchant: 'Shell Station', meta: 'Transport • 24 яну', amountCents: 7300, icon: 'directions-car', color: '#adc7ff', flagged: true },
];

export default function DashboardScreen() {
  const total = DEMO_ENTRIES.reduce((sum, e) => sum + e.amountCents, 0);

  return (
    <Screen withTabBar>
      {/* Top app bar */}
      <View className="h-16 flex-row items-center justify-between">
        <View>
          <Text className="font-jakarta-bold text-headline-lg-mobile text-primary">
            Teftera
          </Text>
          <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
            тефтера
          </Text>
        </View>
        <View className="flex-row items-center gap-4">
          <Pressable onPress={() => router.navigate('/(app)/profile')} hitSlop={8}>
            <MaterialIcons name="settings" size={24} color="#c4c6d0" />
          </Pressable>
          <View className="h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-surface-container-high">
            <MaterialIcons name="person" size={20} color="#c4c6d0" />
          </View>
        </View>
      </View>

      {/* Hero spending */}
      <View className="items-center py-xl">
        <SectionLabel>Похарчено този месец</SectionLabel>
        <Text className="mt-sm font-jakarta-semibold text-headline-xl text-on-surface">
          {formatCurrency(total)}
        </Text>
      </View>

      {/* Recent entries */}
      <View className="mb-md flex-row items-center justify-between">
        <SectionLabel>Последни</SectionLabel>
        <Pressable
          onPress={() => router.navigate('/(app)/history')}
          className="flex-row items-center gap-1">
          <Text className="font-inter-semibold text-label-md text-primary">Виж всички</Text>
          <MaterialIcons name="chevron-right" size={16} color="#d8e3ff" />
        </Pressable>
      </View>

      <View>
        {DEMO_ENTRIES.map((entry, i) => (
          <View key={entry.id}>
            <View className="flex-row items-center justify-between py-md">
              <View className="flex-row items-center gap-md">
                <View className="h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest">
                  <MaterialIcons name={entry.icon} size={22} color={entry.color} />
                </View>
                <View>
                  <View className="flex-row items-center gap-2">
                    {entry.flagged ? (
                      <View className="h-2 w-2 rounded-full bg-secondary-fixed" />
                    ) : null}
                    <Text className="font-jakarta-semibold text-headline-md text-on-surface">
                      {entry.merchant}
                    </Text>
                  </View>
                  <Text className="font-inter text-body-md text-on-surface-variant opacity-70">
                    {entry.meta}
                  </Text>
                </View>
              </View>
              <Text
                className={`font-inter-semibold text-headline-md ${entry.flagged ? 'text-secondary-fixed' : 'text-on-surface'}`}>
                {formatCurrency(entry.amountCents)}
              </Text>
            </View>
            {i < DEMO_ENTRIES.length - 1 ? <HairlineDivider /> : null}
          </View>
        ))}
      </View>

      {/* Quick actions */}
      <View className="mt-xl flex-row gap-md">
        <Pressable
          onPress={() => router.navigate('/scanner')}
          className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-full bg-primary-container active:opacity-80">
          <MaterialIcons name="photo-camera" size={20} color="#112f5e" />
          <Text className="font-jakarta-semibold text-headline-md text-on-primary">Сканирай</Text>
        </Pressable>
        <Pressable
          onPress={() => router.navigate('/manual-entry')}
          className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-full border border-white/10 active:opacity-80">
          <MaterialIcons name="add" size={20} color="#e3e2e6" />
          <Text className="font-jakarta-semibold text-headline-md text-on-surface">Ръчно</Text>
        </Pressable>
      </View>
    </Screen>
  );
}
