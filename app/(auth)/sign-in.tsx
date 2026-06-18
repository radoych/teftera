import { router } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { FlatInput } from '@/components/FlatInput';
import { GoogleGlyph } from '@/components/GoogleGlyph';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Auth is wired to Supabase in Step 4. For now, Login navigates into the app.
  const onLogin = () => router.replace('/(app)');

  return (
    <AuthShell>
      {/* Logo / brand */}
      <View className="flex-[2] items-center justify-center">
        <Image
          source={require('../../assets/1781690652688.png')}
          style={{ width: 140, height: 140 }}
          contentFit="contain"
        />
        <Text className="mt-md font-jakarta-bold text-headline-lg text-primary">Teftera</Text>
        <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
          тефтера
        </Text>
      </View>

      {/* Form */}
      <View className="flex-[2] justify-center gap-lg">
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
          autoComplete="password"
        />
        <Pressable className="self-end">
          <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
            Забравена парола?
          </Text>
        </Pressable>
      </View>

      {/* Bottom segmented action pill */}
      <View className="flex-1 justify-end pb-lg">
        <View className="flex-row items-center justify-between rounded-full bg-surface-container-high p-2">
          <Pressable
            onPress={() => router.push('/(auth)/sign-up')}
            className="flex-1 items-center py-3">
            <Text className="font-inter text-body-md text-on-surface-variant">Регистрация</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Вход с Google"
            className="mx-1 h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest active:opacity-80">
            <GoogleGlyph size={20} />
          </Pressable>
          <Pressable
            onPress={onLogin}
            className="flex-1 items-center rounded-full bg-primary-container py-3 active:opacity-90">
            <Text className="font-inter-semibold text-body-md text-on-primary">Вход</Text>
          </Pressable>
        </View>
      </View>
    </AuthShell>
  );
}
