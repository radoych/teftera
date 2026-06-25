import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { BottomSheet } from '@/components/BottomSheet';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';
import { signOut } from '@/features/auth/api';
import { useAuthStore } from '@/features/auth/store';
import {
  getMembers,
  getMyHousehold,
  type HouseholdMember,
} from '@/features/household/api';
import { formatInviteCode } from '@/features/household/inviteCode';
import { SectionLayoutEditor } from '@/features/preferences/components/SectionLayoutEditor';
import { usePreferencesStore } from '@/features/preferences/store';
import { upsertMyPreferences } from '@/features/preferences/api';
import type { UserPreferences } from '@/features/preferences/types';

function Pill({ label }: { label: string }) {
  return (
    <Pressable className="flex-row items-center gap-2 rounded-full bg-surface-container px-4 py-1 active:bg-white/5">
      <Text className="font-inter text-label-md text-primary-container">{label}</Text>
      <MaterialIcons name="expand-more" size={20} color="#adc7ff" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const session = useAuthStore((s) => s.session);
  const householdId = useAuthStore((s) => s.householdId);
  const displayName = useAuthStore((s) => s.displayName) ?? '';
  const preferences = usePreferencesStore((s) => s.preferences);
  const setPreferences = usePreferencesStore((s) => s.setPreferences);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [inviteCode, setInviteCode] = useState('');

  const email = session?.user.email ?? '';
  const initials =
    displayName
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || '?';

  useEffect(() => {
    if (!householdId) return;
    getMembers(householdId).then(setMembers);
    getMyHousehold().then((h) => setInviteCode(h?.inviteCode ?? ''));
  }, [householdId]);

  const onSignOut = async () => {
    await signOut();
    // useProtectedRoute redirects to sign-in once the session clears.
  };

  const onLayoutChange = async (next: UserPreferences['dashboardSections']) => {
    const prev = preferences;
    const updated: UserPreferences = { version: 1, dashboardSections: next };
    setPreferences(updated); // optimistic
    const userId = session?.user.id;
    if (!userId || !householdId) return;
    try {
      await upsertMyPreferences({ userId, householdId, settings: updated });
    } catch {
      setPreferences(prev); // revert on failure
    }
  };

  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [anomalyAlerts, setAnomalyAlerts] = useState(false);
  const [layoutSheetOpen, setLayoutSheetOpen] = useState(false);

  return (
    <Screen withTabBar>
      <Text className="mb-xl mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        Профил
      </Text>

      {/* User header */}
      <View className="flex-row items-center justify-between gap-md">
        <View className="flex-1 flex-row items-center gap-md">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-container">
            <Text className="font-jakarta-semibold text-headline-md text-on-primary">
              {initials}
            </Text>
          </View>
          <View className="flex-1">
            <Text
              numberOfLines={1}
              className="font-jakarta-semibold text-headline-md text-on-surface"
            >
              {displayName}
            </Text>
            <Text
              numberOfLines={1}
              className="font-inter text-body-md text-on-surface-variant opacity-70"
            >
              {email}
            </Text>
          </View>
        </View>
        <Pressable className="shrink-0 rounded-full border border-primary-container px-6 py-2 active:bg-primary-container/10">
          <Text className="font-inter text-label-md text-primary-container">
            Редакция
          </Text>
        </Pressable>
      </View>

      {/* Household */}
      <View className="mt-xl">
        <SectionLabel className="mb-md">Домакинство</SectionLabel>
        {members.map((m) => {
          const memberInitials =
            m.displayName
              .split(' ')
              .map((p) => p[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              .toUpperCase() || '?';
          const memberName = m.displayName || 'Без име';
          const roleLabel = m.role === 'owner' ? 'Собственик' : 'Член';
          return (
            <View key={m.userId}>
              <View className="flex-row items-center gap-md py-md">
                <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container">
                  <Text className="font-inter-semibold text-body-md text-on-surface-variant">
                    {memberInitials}
                  </Text>
                </View>
                <View className="flex-1">
                  <Text className="font-inter text-body-lg text-on-surface">
                    {memberName}
                  </Text>
                  <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
                    {roleLabel}
                  </Text>
                </View>
              </View>
              <HairlineDivider />
            </View>
          );
        })}
        <Pressable className="flex-row items-center gap-3 py-5 active:opacity-70">
          <MaterialIcons name="person-add" size={20} color="#adc7ff" />
          <Text className="font-inter text-body-md text-primary-container">
            Покани член
          </Text>
        </Pressable>
        {inviteCode ? (
          <Text className="mt-2 font-inter-semibold text-body-lg tracking-widest text-primary">
            {formatInviteCode(inviteCode)}
          </Text>
        ) : null}
      </View>

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
          <MaterialIcons name="chevron-right" size={22} color="#c4c6d0" />
        </Pressable>
      </View>

      <BottomSheet visible={layoutSheetOpen} onClose={() => setLayoutSheetOpen(false)}>
        <Text className="px-6 pb-1 pt-1 font-jakarta-semibold text-headline-md text-on-surface">
          Подреждане на началния екран
        </Text>
        <Text className="px-6 pb-3 font-inter text-body-md text-on-surface-variant opacity-70">
          Влачи дръжката, за да подредиш. Превключи Вкл/Изкл, за да скриеш.
        </Text>
        {/* Extra bottom padding lifts the rows above the Android home-gesture
            zone so the last item can be dragged up without triggering it. */}
        <View className="px-6 pb-16">
          <SectionLayoutEditor
            sections={preferences.dashboardSections}
            onChange={onLayoutChange}
          />
        </View>
      </BottomSheet>

      {/* Preferences */}
      <View className="mt-lg">
        <SectionLabel className="mb-md">Предпочитания</SectionLabel>
        <View className="flex-row items-center justify-between py-md">
          <Text className="font-inter text-body-lg text-on-surface">Валута</Text>
          <Pill label="EUR" />
        </View>
        <HairlineDivider />
        <View className="flex-row items-center justify-between py-md">
          <Text className="font-inter text-body-lg text-on-surface">Език</Text>
          <Pill label="BG" />
        </View>
      </View>

      {/* Bank connection */}
      <View className="mt-lg">
        <SectionLabel className="mb-md">Банкова връзка</SectionLabel>
        <View className="flex-row items-start gap-md py-md">
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-surface-container">
            <MaterialIcons name="account-balance" size={20} color="#adc7ff" />
          </View>
          <View className="flex-1">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="font-inter text-body-lg text-on-surface">DSK Bank</Text>
              <View className="rounded-sm bg-secondary-fixed/10 px-2 py-0.5">
                <Text className="font-inter-semibold text-[10px] text-secondary-fixed">
                  СВЪРЗАНА
                </Text>
              </View>
            </View>
            <Text className="mb-3 font-inter text-label-md text-on-surface-variant opacity-60">
              Последна синхронизация: преди 2 часа
            </Text>
            <Pressable
              onPress={() => router.push('/import-dsk')}
              className="flex-row items-center gap-1 active:opacity-70">
              <MaterialIcons name="upload-file" size={16} color="#adc7ff" />
              <Text className="font-inter text-label-md text-primary-container">
                Импортирай от CSV
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Notifications */}
      <View className="mt-lg">
        <SectionLabel className="mb-md">Известия</SectionLabel>
        <View className="flex-row items-center justify-between py-3">
          <Text className="font-inter text-body-lg text-on-surface">
            Бюджетни сигнали
          </Text>
          <Switch
            value={budgetAlerts}
            onValueChange={setBudgetAlerts}
            trackColor={{ false: '#44474f', true: '#adc7ff' }}
            thumbColor={budgetAlerts ? '#112f5e' : '#e3e2e6'}
          />
        </View>
        <HairlineDivider />
        <View className="flex-row items-center justify-between py-3">
          <Text className="font-inter text-body-lg text-on-surface">
            Сигнали за аномалии
          </Text>
          <Switch
            value={anomalyAlerts}
            onValueChange={setAnomalyAlerts}
            trackColor={{ false: '#44474f', true: '#adc7ff' }}
            thumbColor={anomalyAlerts ? '#112f5e' : '#e3e2e6'}
          />
        </View>
      </View>

      {/* General */}
      <View className="mt-lg">
        <SectionLabel className="mb-md">Общи</SectionLabel>
        <Pressable className="flex-row items-center justify-between py-5 active:bg-white/5">
          <Text className="font-inter text-body-lg text-on-surface">
            Управление на категории
          </Text>
          <MaterialIcons name="chevron-right" size={22} color="#c4c6d0" />
        </Pressable>
        <Pressable
          onPress={onSignOut}
          className="flex-row items-center gap-3 py-5 active:opacity-70"
        >
          <MaterialIcons name="logout" size={22} color="#ffb4ab" />
          <Text className="font-inter text-body-lg text-error">Изход</Text>
        </Pressable>
      </View>

      <Text className="mt-lg text-center font-inter text-label-md text-on-surface-variant opacity-30">
        Teftera v1.0.0
      </Text>
    </Screen>
  );
}
