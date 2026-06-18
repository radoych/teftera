import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { FlatInput } from '@/components/FlatInput';
import { GoogleGlyph } from '@/components/GoogleGlyph';
import { PillButton } from '@/components/PillButton';

export default function SignUpScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  // Auth wired in Step 4. For now, registering goes to household setup.
  const onRegister = () => router.replace('/(auth)/household-setup');

  return (
    <AuthShell>
      <View className="flex-1 justify-center gap-xl">
        <View className="gap-xs">
          <Text className="font-jakarta-semibold text-headline-xl text-on-surface">
            Създай акаунт
          </Text>
          <Text className="font-inter text-body-md text-on-surface-variant">
            Започни да следиш разходите на домакинството.
          </Text>
        </View>

        <View className="gap-lg">
          <FlatInput
            value={email}
            onChangeText={setEmail}
            placeholder="Имейл адрес"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <FlatInput
            value={password}
            onChangeText={setPassword}
            placeholder="Парола"
            secureTextEntry
          />
          <FlatInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Потвърди парола"
            secureTextEntry
          />
        </View>

        <View className="gap-md">
          <PillButton label="Регистрация" onPress={onRegister} block />
          <Pressable className="h-12 flex-row items-center justify-center gap-3 rounded-full border border-white/10 active:opacity-80">
            <GoogleGlyph size={20} />
            <Text className="font-jakarta-semibold text-headline-md text-on-surface">
              Продължи с Google
            </Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.back()} className="items-center">
          <Text className="font-inter text-label-md text-on-surface-variant">
            Вече имаш акаунт? <Text className="text-primary-container">Вход</Text>
          </Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}
