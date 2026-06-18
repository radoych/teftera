import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { HairlineDivider } from '@/components/HairlineDivider';
import { PillButton } from '@/components/PillButton';
import { SectionLabel } from '@/components/SectionLabel';

type Tab = 'create' | 'join';

// Demo invite code — generated server-side (households.invite_code) in Step 4.
const DEMO_CODE = 'TEFT-7K2X';

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
  const [tab, setTab] = useState<Tab>(defaultTab);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Creating/joining is wired to Supabase in Step 4. For now, finish → app.
  const finish = () => router.replace('/(app)');

  const copyCode = async () => {
    await Clipboard.setStringAsync(DEMO_CODE);
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

        {/* Segmented control */}
        <View className="mb-xl flex-row rounded-full border border-white/5 bg-surface-container-low p-1">
          <SegmentButton label="Създай" active={tab === 'create'} onPress={() => setTab('create')} />
          <SegmentButton label="Присъедини се" active={tab === 'join'} onPress={() => setTab('join')} />
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

            <PillButton label="Създай домакинство" variant="filled" onPress={finish} block />

            <View className="gap-md">
              <HairlineDivider />
              <SectionLabel>Покани партньора си</SectionLabel>
              <View className="flex-row items-end justify-between">
                <Text className="font-inter-semibold text-[32px] tracking-widest text-primary">
                  {DEMO_CODE}
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
                Сподели този код или линка по-долу.
              </Text>
              <View className="flex-row items-center justify-between border-b border-white/5 px-2 py-4">
                <Text className="font-inter text-body-md text-on-surface opacity-80">
                  teftera.app/join/teft-7k2x
                </Text>
                <MaterialIcons name="open-in-new" size={18} color="#c4c6d0" />
              </View>
              <PillButton label="Сподели поканата" variant="ghost" icon="share" block />
            </View>
          </View>
        ) : (
          <View className="gap-xl">
            <View>
              <SectionLabel className="mb-2 opacity-60">Код за покана</SectionLabel>
              <TextInput
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="напр. TEFT-7K2X"
                placeholderTextColor="rgba(196,198,208,0.3)"
                autoCapitalize="characters"
                maxLength={9}
                className="border-b border-white/10 py-4 font-inter-semibold text-[32px] uppercase tracking-widest text-on-surface"
              />
            </View>
            <PillButton label="Присъедини се" variant="filled" onPress={finish} block />
            <Text className="px-4 text-center font-inter text-body-md text-on-surface-variant opacity-60">
              Въведи 8-символния код, споделен от партньора ти, за да синхронизирате
              финансите си.
            </Text>
          </View>
        )}

        <View className="flex-1" />

        <Pressable onPress={finish} className="mt-xxl items-center">
          <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
            Пропусни засега — ще поканя по-късно
          </Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}
