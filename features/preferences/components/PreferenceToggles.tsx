import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, Switch, Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { SectionLabel } from '@/components/SectionLabel';
import { colors } from '@/lib/theme';

interface PreferenceTogglesProps {
  budgetAlerts: boolean;
  anomalyAlerts: boolean;
  onBudgetAlertsChange: (value: boolean) => void;
  onAnomalyAlertsChange: (value: boolean) => void;
}

export function PreferenceToggles({
  budgetAlerts,
  anomalyAlerts,
  onBudgetAlertsChange,
  onAnomalyAlertsChange,
}: PreferenceTogglesProps) {
  return (
    <View className="mt-lg">
      <SectionLabel className="mb-md">Известия</SectionLabel>
      <Pressable
        onPress={() => router.push('/budgets')}
        className="flex-row items-center justify-between py-md active:bg-white/5"
      >
        <Text className="font-inter text-body-lg text-on-surface">
          Управление на бюджети
        </Text>
        <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
      </Pressable>
      <HairlineDivider />
      <View className="flex-row items-center justify-between py-3">
        <Text className="font-inter text-body-lg text-on-surface">
          Бюджетни сигнали
        </Text>
        <Switch
          value={budgetAlerts}
          onValueChange={onBudgetAlertsChange}
          trackColor={{ false: colors.outlineVariant, true: colors.primaryContainer }}
          thumbColor={budgetAlerts ? colors.onPrimary : colors.onSurface}
        />
      </View>
      <HairlineDivider />
      <View className="flex-row items-center justify-between py-3">
        <Text className="font-inter text-body-lg text-on-surface">
          Сигнали за аномалии
        </Text>
        <Switch
          value={anomalyAlerts}
          onValueChange={onAnomalyAlertsChange}
          trackColor={{ false: colors.outlineVariant, true: colors.primaryContainer }}
          thumbColor={anomalyAlerts ? colors.onPrimary : colors.onSurface}
        />
      </View>
    </View>
  );
}
