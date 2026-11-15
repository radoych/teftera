import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SectionLabel } from '@/components/SectionLabel';
import { colors } from '@/lib/theme';

interface BankConnectionSectionProps {
  lastSyncLabel: string | null;
}

export function BankConnectionSection({ lastSyncLabel }: BankConnectionSectionProps) {
  return (
    <View className="mt-lg">
      <SectionLabel className="mb-md">Банкова връзка</SectionLabel>
      <View className="flex-row items-start gap-md py-md">
        <View className="h-10 w-10 items-center justify-center rounded-lg bg-surface-container">
          <MaterialIcons name="account-balance" size={20} color={colors.primaryContainer} />
        </View>
        <View className="flex-1">
          <View className="mb-1 flex-row items-center justify-between">
            <Text className="font-inter text-body-lg text-on-surface">DSK Bank</Text>
          </View>
          <Text className="mb-3 font-inter text-label-md text-on-surface-variant opacity-60">
            {lastSyncLabel !== null
              ? `Последна синхронизация: ${lastSyncLabel}`
              : 'Няма синхронизация досега'}
          </Text>
          <Pressable
            onPress={() => router.push('/import-dsk')}
            className="flex-row items-center gap-1 active:opacity-70">
            <MaterialIcons name="sync" size={16} color={colors.primaryContainer} />
            <Text className="font-inter text-label-md text-primary-container">
              Синхронизирай
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
