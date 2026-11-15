import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { PillButton } from '@/components/PillButton';
import { SectionLabel } from '@/components/SectionLabel';
import { mapAuthError } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/store';
import { createHousehold, joinHouseholdByCode } from '@/features/household/api';
import { formatInviteCode, normalizeInviteCode } from '@/features/household/inviteCode';
import { useHouseholdStore } from '@/features/household/store';

type Tab = 'create' | 'join';

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-full py-3 ${active ? 'bg-primary-container' : ''}`}>
      <Text
        className={`font-inter-medium text-label-md ${active ? 'text-on-primary' : 'text-on-surface-variant'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function HouseholdSetupView({ defaultTab = 'create' }: { defaultTab?: Tab }) {
  const displayName = useAuthStore((s) => s.displayName) ?? '';
  const enterHousehold = useAuthStore((s) => s.enterHousehold);

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCreate = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Въведи име на домакинството.');
      return;
    }
    setLoading(true);
    try {
      const { householdId, inviteCode } = await createHousehold(name.trim(), displayName);
      setCreatedId(householdId);
      setCreatedCode(inviteCode);
      useHouseholdStore.getState().setInviteCode(householdId, inviteCode);
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const onJoin = async () => {
    setError(null);
    const normalized = normalizeInviteCode(code);
    if (!normalized) {
      setError('Въведи код за покана.');
      return;
    }
    setLoading(true);
    try {
      const { householdId } = await joinHouseholdByCode(normalized, displayName);
      enterHousehold(householdId, displayName);
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const onSkip = async () => {
    setError(null);
    setLoading(true);
    try {
      const { householdId, inviteCode } = await createHousehold('Моето домакинство', displayName);
      useHouseholdStore.getState().setInviteCode(householdId, inviteCode);
      enterHousehold(householdId, displayName);
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!createdCode) return;
    await Clipboard.setStringAsync(formatInviteCode(createdCode));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AuthShell>
      <View className="flex-1 pt-xxl">
        <View className="mb-xl">
          <Text className="mb-sm font-jakarta-semibold text-headline-xl text-on-surface">
            Настрой домакинството
          </Text>
          <Text className="font-inter text-body-lg text-on-surface-variant opacity-70">
            Teftera работи най-добре споделено с някого, на когото вярваш.
          </Text>
        </View>

        {createdCode ? (
          // Phase 2 — household created, show the real invite code.
          <View className="gap-lg">
            <SectionLabel>Покани партньора си</SectionLabel>
            <View className="flex-row items-end justify-between">
              <Text className="font-inter-semibold text-[32px] tracking-widest text-primary">
                {formatInviteCode(createdCode)}
              </Text>
              <Pressable onPress={copyCode} hitSlop={8}>
                <MaterialIcons
                  name={copied ? 'check' : 'content-copy'}
                  size={22}
                  color={copied ? '#c3f400' : '#adc7ff'}
                />
              </Pressable>
            </View>
            <Text className="font-inter text-body-md text-on-surface-variant opacity-60">
              Сподели този код с партньора си, за да синхронизирате финансите си.
            </Text>
            <View className="flex-1" />
            <PillButton
              label="Към таблото"
              variant="filled"
              block
              onPress={() => createdId && enterHousehold(createdId, displayName)}
            />
          </View>
        ) : (
          <>
            <View className="mb-xl flex-row rounded-full border border-white/5 bg-surface-container-low p-1">
              <SegmentButton
                label="Създай"
                active={tab === 'create'}
                onPress={() => setTab('create')}
              />
              <SegmentButton
                label="Присъедини се"
                active={tab === 'join'}
                onPress={() => setTab('join')}
              />
            </View>

            {tab === 'create' ? (
              <View className="gap-xl">
                <View>
                  <SectionLabel className="mb-2">Име на домакинството</SectionLabel>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="напр. Дом Джечеви"
                    placeholderTextColor="rgba(196,198,208,0.3)"
                    className="border-b border-white/10 py-4 font-jakarta-medium text-headline-md text-on-surface"
                  />
                </View>
                <PillButton
                  label="Създай домакинство"
                  variant="filled"
                  block
                  loading={loading}
                  onPress={onCreate}
                />
              </View>
            ) : (
              <View className="gap-xl">
                <View>
                  <SectionLabel className="mb-2 opacity-60">Код за покана</SectionLabel>
                  <TextInput
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    placeholder="9F4K-7X2B"
                    placeholderTextColor="rgba(196,198,208,0.3)"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={9}
                    className="border-b border-white/10 font-inter-semibold text-on-surface"
                    style={{
                      height: 56,
                      fontSize: 22,
                      letterSpacing: 4,
                      textAlign: 'center',
                      textAlignVertical: 'center',
                      textTransform: 'uppercase',
                    }}
                  />
                </View>
                <PillButton
                  label="Присъедини се"
                  variant="filled"
                  block
                  loading={loading}
                  onPress={onJoin}
                />
                <Text className="px-4 text-center font-inter text-body-md text-on-surface-variant opacity-60">
                  Въведи 8-символния код, споделен от партньора ти.
                </Text>
              </View>
            )}

            {error ? (
              <Text className="mt-lg font-inter text-body-md text-error">{error}</Text>
            ) : null}

            <View className="flex-1" />

            <Pressable onPress={onSkip} disabled={loading} className="mb-xl mt-xxl items-center">
              {loading ? (
                <ActivityIndicator color="#c4c6d0" />
              ) : (
                <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
                  Пропусни засега — ще поканя по-късно
                </Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </AuthShell>
  );
}
