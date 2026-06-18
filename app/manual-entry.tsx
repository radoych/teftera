import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { HairlineDivider } from '@/components/HairlineDivider';

function FieldRow({
  label,
  children,
  onPress,
  chevron,
}: {
  label: string;
  children: React.ReactNode;
  onPress?: () => void;
  chevron?: boolean;
}) {
  const Body = (
    <View className="flex-row items-center justify-between px-6 py-5">
      <View className="flex-1 gap-1">
        <Text className="font-inter-medium text-label-md uppercase text-on-surface-variant opacity-60">
          {label}
        </Text>
        {children}
      </View>
      {chevron ? <MaterialIcons name="expand-more" size={22} color="#c4c6d0" /> : null}
    </View>
  );
  return (
    <View>
      {onPress ? (
        <Pressable onPress={onPress} className="active:bg-white/5">
          {Body}
        </Pressable>
      ) : (
        Body
      )}
      <HairlineDivider />
    </View>
  );
}

export default function ManualEntryScreen() {
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [note, setNote] = useState('');

  // Saving to Supabase is wired in Step 5. For now, DONE returns to the app.
  const onDone = () => router.back();

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Top app bar */}
        <View className="flex-row items-center justify-between px-6 py-4">
          <Pressable onPress={() => router.back()} hitSlop={8} className="-ml-2 p-2">
            <MaterialIcons name="arrow-back" size={24} color="#e3e2e6" />
          </Pressable>
          <Text className="font-jakarta-semibold text-headline-lg-mobile text-on-surface">
            Ръчно въвеждане
          </Text>
          <Pressable onPress={onDone} hitSlop={8} className="px-2 py-1">
            <Text className="font-inter-medium text-label-md text-primary-container">ГОТОВО</Text>
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled">
          {/* Amount */}
          <View className="mb-16 mt-12 flex-row items-center justify-center px-6">
            <Text className="font-jakarta-semibold text-[64px] text-on-surface opacity-30">€</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              placeholder="0,00"
              placeholderTextColor="rgba(196,198,208,0.3)"
              keyboardType="decimal-pad"
              autoFocus
              className="min-w-[120px] text-center font-jakarta-semibold text-[64px] text-on-surface"
            />
          </View>

          {/* Form */}
          <FieldRow label="Търговец">
            <TextInput
              value={merchant}
              onChangeText={setMerchant}
              placeholder="напр. Starbucks"
              placeholderTextColor="rgba(196,198,208,0.3)"
              className="font-inter text-body-lg text-on-surface"
            />
          </FieldRow>

          <FieldRow label="Категория" chevron onPress={() => {}}>
            <Text className="font-inter text-body-lg text-on-surface-variant opacity-40">
              Избери категория
            </Text>
          </FieldRow>

          <FieldRow label="Дата" chevron onPress={() => {}}>
            <Text className="font-inter text-body-lg text-on-surface">Днес</Text>
          </FieldRow>

          <FieldRow label="Бележка">
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Незадължителна бележка"
              placeholderTextColor="rgba(196,198,208,0.3)"
              className="font-inter text-body-lg text-on-surface"
            />
          </FieldRow>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
