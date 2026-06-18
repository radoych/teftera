import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';
import { PillButton } from '@/components/PillButton';
import { SectionLabel } from '@/components/SectionLabel';

interface Item {
  id: string;
  description: string;
  amount: string;
}

// Prefilled with Gemini's extraction in the live flow; static demo here.
const INITIAL_ITEMS: Item[] = [
  { id: '1', description: 'Caramel Macchiato', amount: '5,40' },
  { id: '2', description: 'Blueberry Muffin', amount: '3,80' },
];

export default function ConfirmReceiptScreen() {
  const [merchant, setMerchant] = useState('Starbucks');
  const [total, setTotal] = useState('14,20');
  const [items, setItems] = useState<Item[]>(INITIAL_ITEMS);

  const removeItem = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const addItem = () =>
    setItems((prev) => [...prev, { id: String(Date.now()), description: '', amount: '' }]);

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Top bar */}
        <View className="flex-row items-center justify-between px-8 py-4">
          <View className="w-6" />
          <Text className="font-jakarta-medium text-headline-md text-on-surface">
            Потвърди бележката
          </Text>
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <MaterialIcons name="close" size={24} color="#e3e2e6" />
          </Pressable>
        </View>

        <ScrollView
          className="px-8"
          contentContainerClassName="pb-40"
          keyboardShouldPersistTaps="handled">
          {/* Thumbnail */}
          <View className="my-xl items-center">
            <View className="h-28 w-20 items-center justify-center rounded-xl bg-surface-container-high">
              <MaterialIcons name="receipt-long" size={28} color="rgba(255,255,255,0.4)" />
            </View>
          </View>

          {/* Merchant */}
          <View className="mb-xl">
            <SectionLabel className="mb-1">Търговец</SectionLabel>
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="Въведи търговец"
              placeholderTextColor="rgba(142,144,154,0.5)"
              className="font-jakarta-semibold text-headline-lg-mobile text-on-surface"
            />
            <HairlineDivider className="mt-xs" />
          </View>

          {/* Total */}
          <View className="mb-xl">
            <SectionLabel className="mb-1">Общо</SectionLabel>
            <View className="flex-row items-baseline">
              <Text className="mr-1 font-jakarta-semibold text-headline-xl text-primary-container">
                €
              </Text>
              <TextInput
                value={total}
                onChangeText={setTotal}
                keyboardType="decimal-pad"
                className="flex-1 font-jakarta-semibold text-headline-xl text-on-surface"
              />
            </View>
            <HairlineDivider className="mt-xs" />
          </View>

          {/* Date + Category */}
          <View className="mb-xl flex-row">
            <View className="flex-1 border-r border-white/5 py-md">
              <SectionLabel className="mb-xs">Дата</SectionLabel>
              <Text className="font-inter text-body-lg text-on-surface">24 ное 2023</Text>
            </View>
            <View className="flex-1 py-md pl-lg">
              <SectionLabel className="mb-xs">Категория</SectionLabel>
              <Text className="font-inter text-body-lg text-on-surface">Хранене</Text>
            </View>
          </View>
          <HairlineDivider className="mb-xl" />

          {/* Items */}
          <SectionLabel className="mb-md">Артикули</SectionLabel>
          {items.map((item) => (
            <View key={item.id}>
              <View className="flex-row items-center justify-between py-md">
                <TextInput
                  value={item.description}
                  onChangeText={(t) =>
                    setItems((prev) =>
                      prev.map((i) => (i.id === item.id ? { ...i, description: t } : i)),
                    )
                  }
                  placeholder="Артикул"
                  placeholderTextColor="rgba(142,144,154,0.5)"
                  className="flex-1 font-inter text-body-lg text-on-surface"
                />
                <View className="flex-row items-center gap-md">
                  <View className="flex-row items-center">
                    <Text className="mr-1 font-inter text-label-md text-on-surface-variant">€</Text>
                    <TextInput
                      value={item.amount}
                      onChangeText={(t) =>
                        setItems((prev) =>
                          prev.map((i) => (i.id === item.id ? { ...i, amount: t } : i)),
                        )
                      }
                      keyboardType="decimal-pad"
                      className="w-16 text-right font-inter-semibold text-data-mono text-on-surface"
                    />
                  </View>
                  <Pressable onPress={() => removeItem(item.id)} hitSlop={8}>
                    <MaterialIcons name="delete" size={18} color="#ffb4ab" />
                  </Pressable>
                </View>
              </View>
              <HairlineDivider />
            </View>
          ))}

          <Pressable onPress={addItem} className="flex-row items-center py-md active:opacity-70">
            <MaterialIcons name="add" size={20} color="#adc7ff" />
            <Text className="ml-md font-inter text-body-md text-on-surface-variant">
              Добави артикул
            </Text>
          </Pressable>
        </ScrollView>

        {/* Bottom actions */}
        <View className="absolute inset-x-0 bottom-0 flex-row gap-md bg-background px-8 pb-8 pt-md">
          <View className="flex-1">
            <PillButton
              label="Отново"
              variant="ghost"
              uppercase
              block
              onPress={() => router.replace('/scanner')}
            />
          </View>
          <View className="flex-1">
            <PillButton
              label="Запази"
              variant="filled"
              uppercase
              block
              onPress={() => router.replace('/(app)')}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
