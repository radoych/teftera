import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { signOut } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/store';
import { BankConnectionSection } from '@/features/transactions/components/BankConnectionSection';
import { updateMyDisplayName } from '@/features/household/api';
import { useHouseholdStore } from '@/features/household/store';
import { refreshMembers } from '@/features/household/sync';
import { formatInviteCode } from '@/features/household/inviteCode';
import { MembersSection } from '@/features/household/components/MembersSection';
import { ProfileHeader } from '@/features/household/components/ProfileHeader';
import { LayoutSheet } from '@/features/preferences/components/LayoutSheet';
import { PreferenceToggles } from '@/features/preferences/components/PreferenceToggles';
import { lastDskSyncAt, formatLastSync } from '@/features/transactions/lastSync';
import { useTransactionsStore } from '@/features/transactions/store';
import { usePreferencesStore } from '@/features/preferences/store';
import { colors } from '@/lib/theme';
import { upsertMyPreferences } from '@/features/preferences/api';
import type { UserPreferences } from '@/features/preferences/types';

export default function ProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const householdId = useAuthStore((s) => s.householdId);
  const setHousehold = useAuthStore((s) => s.setHousehold);
  const displayName = useAuthStore((s) => s.displayName) ?? '';
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreferences = usePreferencesStore((s) => s.setPreferences);
  const transactions = useTransactionsStore((s) => s.transactions);
  const members = useHouseholdStore((s) => s.members);
  const inviteCode = useHouseholdStore((s) => s.inviteCode);

  const email = session?.user.email ?? '';

  const onSignOut = async () => {
    await signOut();
    // useProtectedRoute redirects to sign-in once the session clears.
  };

  const updatePreferences = async (updated: UserPreferences) => {
    const prev = preferences;
    setPreferences(updated); // optimistic
    const userId = session?.user.id;
    if (!userId || !householdId) return;
    try {
      await upsertMyPreferences({ userId, householdId, settings: updated });
    } catch {
      setPreferences(prev); // revert on failure
    }
  };

  const onLayoutChange = async (next: UserPreferences['dashboardSections']) => {
    await updatePreferences({ ...preferences, dashboardSections: next });
  };

  const budgetAlerts = preferences.budgetAlertsEnabled ?? true;
  const onBudgetAlertsChange = (value: boolean) => {
    void updatePreferences({ ...preferences, budgetAlertsEnabled: value });
  };

  const anomalyAlerts = preferences.anomalyAlertsEnabled ?? true;
  const onAnomalyAlertsChange = (value: boolean) => {
    void updatePreferences({ ...preferences, anomalyAlertsEnabled: value });
  };
  const [layoutSheetOpen, setLayoutSheetOpen] = useState(false);

  const onInvite = async () => {
    if (!inviteCode) return;
    try {
      await Share.share({
        message: `Присъедини се към домакинството ми в Teftera с код: ${formatInviteCode(inviteCode)}`,
      });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  const onSaveName = async (name: string) => {
    await updateMyDisplayName(name);
    setHousehold(householdId, name);
    if (householdId) void refreshMembers(householdId);
  };

  const lastSyncLabel = useMemo(() => {
    const iso = lastDskSyncAt(transactions);
    return iso === null ? null : formatLastSync(iso);
  }, [transactions]);

  return (
    <Screen withTabBar>
      <Text className="mb-xl mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        Профил
      </Text>

      <ProfileHeader displayName={displayName} email={email} onSaveName={onSaveName} />

      <MembersSection members={members} inviteCode={inviteCode} onInvite={onInvite} />

      {/* Home layout */}
      <View className="mt-lg">
        <SectionLabel className="mb-md">Начало</SectionLabel>
        <Pressable
          onPress={() => setLayoutSheetOpen(true)}
          className="flex-row items-center justify-between py-md active:bg-white/5"
        >
          <Text className="font-inter text-body-lg text-on-surface">
            Подреди секциите
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
      </View>

      <LayoutSheet
        visible={layoutSheetOpen}
        sections={preferences.dashboardSections}
        onChange={onLayoutChange}
        onClose={() => setLayoutSheetOpen(false)}
      />

      <BankConnectionSection lastSyncLabel={lastSyncLabel} />

      <PreferenceToggles
        budgetAlerts={budgetAlerts}
        anomalyAlerts={anomalyAlerts}
        onBudgetAlertsChange={onBudgetAlertsChange}
        onAnomalyAlertsChange={onAnomalyAlertsChange}
      />

      {/* General */}
      <View className="mt-lg">
        <SectionLabel className="mb-md">Общи</SectionLabel>
        <Pressable
          onPress={() => router.push('/vendors')}
          className="flex-row items-center justify-between py-5 active:bg-white/5">
          <Text className="font-inter text-body-lg text-on-surface">Търговци</Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
        {/* "Клиентски карти" / "Списъци за пазаруване" rows: added by the loyalty / shopping waves. */}
        <Pressable
          onPress={() => router.push('/lists')}
          className="flex-row items-center justify-between py-5 active:bg-white/5">
          <Text className="font-inter text-body-lg text-on-surface">Списъци за пазаруване</Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          onPress={() => router.push('/categories')}
          className="flex-row items-center justify-between py-5 active:bg-white/5">
          <Text className="font-inter text-body-lg text-on-surface">
            Управление на категории
          </Text>
          <MaterialIcons name="chevron-right" size={22} color={colors.onSurfaceVariant} />
        </Pressable>
        <Pressable
          onPress={onSignOut}
          className="flex-row items-center gap-3 py-5 active:opacity-70"
        >
          <MaterialIcons name="logout" size={22} color={colors.error} />
          <Text className="font-inter text-body-lg text-error">Изход</Text>
        </Pressable>
      </View>

      <Text className="mt-lg text-center font-inter text-label-md text-on-surface-variant opacity-30">
        {`Teftera v${Constants.expoConfig?.version ?? '—'}`}
      </Text>
    </Screen>
  );
}
