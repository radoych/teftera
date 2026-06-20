import { router } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { FlatInput } from '@/components/FlatInput';
import { GoogleGlyph } from '@/components/GoogleGlyph';
import { signInWithPassword } from '@/features/auth/api';

export default function SignInScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    const { error: err } = await signInWithPassword(email.trim(), password);
    setLoading(false);
    if (err) setError(err);
    // On success, useProtectedRoute redirects automatically.
  };

  return (
    <AuthShell>
      <View className="flex-[2] items-center justify-center">
        <Image
          source={require('../../assets/1781690652688.png')}
          style={{ width: 140, height: 140 }}
          contentFit="contain"
        />
        <Text className="mt-md font-jakarta-bold text-headline-lg text-primary">Teftera</Text>
        <Text className="font-inter text-label-md text-on-surface-variant opacity-60">тефтера</Text>
      </View>

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
        {error ? (
          <Text className="font-inter text-body-md text-error">{error}</Text>
        ) : null}
        <Pressable className="self-end">
          <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
            Забравена парола?
          </Text>
        </Pressable>
      </View>

      <View className="flex-1 justify-end pb-lg">
        <View className="flex-row items-center justify-between rounded-full bg-surface-container-high p-2">
          <Pressable
            onPress={() => router.push('/(auth)/sign-up')}
            className="flex-1 items-center py-3">
            <Text className="font-inter text-body-md text-on-surface-variant">Регистрация</Text>
          </Pressable>
          <Pressable
            disabled
            accessibilityLabel="Вход с Google"
            className="mx-1 h-12 w-12 items-center justify-center rounded-full bg-surface-container-highest opacity-40">
            <GoogleGlyph size={20} />
          </Pressable>
          <Pressable
            onPress={onLogin}
            disabled={loading}
            className="flex-1 items-center rounded-full bg-primary-container py-3 active:opacity-90">
            {loading ? (
              <ActivityIndicator color="#112f5e" />
            ) : (
              <Text className="font-inter-semibold text-body-md text-on-primary">Вход</Text>
            )}
          </Pressable>
        </View>
      </View>
    </AuthShell>
  );
}
