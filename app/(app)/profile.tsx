import { MaterialIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { HairlineDivider } from '@/components/HairlineDivider';
import { Screen } from '@/components/Screen';
import { SectionLabel } from '@/components/SectionLabel';

const MEMBERS = [
  { initials: 'РД', name: 'Ти', role: 'Собственик' },
  { initials: 'СД', name: 'Сара', role: 'Член' },
];

function Pill({ label }: { label: string }) {
  return (
    <Pressable className="flex-row items-center gap-2 rounded-full bg-surface-container px-4 py-1 active:bg-white/5">
      <Text className="font-inter text-label-md text-primary-container">{label}</Text>
      <MaterialIcons name="expand-more" size={20} color="#adc7ff" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const [anomalyAlerts, setAnomalyAlerts] = useState(false);

  return (
    <Screen withTabBar>
      <Text className="mb-xl mt-md font-jakarta-semibold text-headline-xl text-on-surface">
        Профил
      </Text>

      {/* User header */}
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-md">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-primary-container">
            <Text className="font-jakarta-semibold text-headline-md text-on-primary">РД</Text>
          </View>
          <View>
            <Text className="font-jakarta-semibold text-headline-md text-on-surface">
              Радо Джечев
            </Text>
            <Text className="font-inter text-body-md text-on-surface-variant opacity-70">
              rado.jechev@gmail.com
            </Text>
          </View>
        </View>
        <Pressable className="rounded-full border border-primary-container px-6 py-2 active:bg-primary-container/10">
          <Text className="font-inter text-label-md text-primary-container">Редакция</Text>
        </Pressable>
      </View>

      {/* Household */}
      <View className="mt-xl">
        <SectionLabel className="mb-md">Домакинство</SectionLabel>
        {MEMBERS.map((m) => (
          <View key={m.name}>
            <View className="flex-row items-center gap-md py-md">
              <View className="h-10 w-10 items-center justify-center rounded-full bg-surface-container">
                <Text className="font-inter-semibold text-body-md text-on-surface-variant">
                  {m.initials}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="font-inter text-body-lg text-on-surface">{m.name}</Text>
                <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
                  {m.role}
                </Text>
              </View>
            </View>
            <HairlineDivider />
          </View>
        ))}
        <Pressable className="flex-row items-center gap-3 py-5 active:opacity-70">
          <MaterialIcons name="person-add" size={20} color="#adc7ff" />
          <Text className="font-inter text-body-md text-primary-container">Покани член</Text>
        </Pressable>
      </View>

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
            <Pressable className="flex-row items-center gap-1 active:opacity-70">
              <MaterialIcons name="sync" size={16} color="#adc7ff" />
              <Text className="font-inter text-label-md text-primary-container">
                Синхронизирай
              </Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* Notifications */}
      <View className="mt-lg">
        <SectionLabel className="mb-md">Известия</SectionLabel>
        <View className="flex-row items-center justify-between py-3">
          <Text className="font-inter text-body-lg text-on-surface">Бюджетни сигнали</Text>
          <Switch
            value={budgetAlerts}
            onValueChange={setBudgetAlerts}
            trackColor={{ false: '#44474f', true: '#adc7ff' }}
            thumbColor={budgetAlerts ? '#112f5e' : '#e3e2e6'}
          />
        </View>
        <HairlineDivider />
        <View className="flex-row items-center justify-between py-3">
          <Text className="font-inter text-body-lg text-on-surface">Сигнали за аномалии</Text>
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
          <Text className="font-inter text-body-lg text-on-surface">Управление на категории</Text>
          <MaterialIcons name="chevron-right" size={22} color="#c4c6d0" />
        </Pressable>
        <Pressable
          onPress={() => router.replace('/(auth)/sign-in')}
          className="flex-row items-center gap-3 py-5 active:opacity-70">
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
