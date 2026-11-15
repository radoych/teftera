import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { FlatInput } from '@/components/FlatInput';
import { signInWithPassword, signUpWithPassword } from '@/features/auth/api';

type Mode = 'login' | 'register';

function pillClassName(active: boolean): string {
  return active
    ? 'flex-1 items-center rounded-full bg-primary-container py-3 active:opacity-90'
    : 'flex-1 items-center py-3';
}

function labelClassName(active: boolean): string {
  return active
    ? 'font-inter-semibold text-body-md text-on-primary'
    : 'font-inter text-body-md text-on-surface-variant';
}

/**
 * Combined login / register screen. One pill toggle (Регистрация | Вход) does
 * double duty: tapping the INACTIVE side switches mode (shows/hides the
 * relevant fields, no navigation); tapping the ACTIVE (filled) side submits
 * that mode's form. Mounted from both `sign-in` and `sign-up` routes with a
 * different `initialMode`, mirroring `HouseholdSetupView`'s `defaultTab` pattern.
 */
export function AuthFormScreen({ initialMode }: { initialMode: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const switchTo = (next: Mode) => {
    if (next === mode || loading) return;
    setMode(next);
    setError(null);
  };

  const onLogin = async () => {
    setError(null);
    setLoading(true);
    const { error: err } = await signInWithPassword(email.trim(), password);
    setLoading(false);
    if (err) setError(err);
    // On success, useProtectedRoute redirects automatically.
  };

  const onRegister = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Въведи името си.');
      return;
    }
    if (password !== confirm) {
      setError('Паролите не съвпадат.');
      return;
    }
    setLoading(true);
    const { error: err } = await signUpWithPassword(email.trim(), password, name.trim());
    setLoading(false);
    if (err) setError(err);
    // On success, useProtectedRoute routes to household-setup (needs-household).
  };

  const onRegisterPress = () => (mode === 'register' ? void onRegister() : switchTo('register'));
  const onLoginPress = () => (mode === 'login' ? void onLogin() : switchTo('login'));

  return (
    <AuthShell>
      <View className="flex-[2] items-center justify-center">
        <Image
          source={require('../../assets/logo.png')}
          style={{ width: 140, height: 118 }}
          contentFit="contain"
        />
        <Text className="mt-md font-jakarta-bold text-headline-lg text-primary">Teftera</Text>
      </View>

      <View className="flex-[2] justify-center gap-lg">
        {mode === 'register' ? (
          <FlatInput value={name} onChangeText={setName} placeholder="Име" autoCapitalize="words" />
        ) : null}
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
        {mode === 'register' ? (
          <FlatInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Потвърди парола"
            secureTextEntry
          />
        ) : null}
        {error ? <Text className="font-inter text-body-md text-error">{error}</Text> : null}
      </View>

      <View className="flex-1 justify-end pb-lg">
        <View className="flex-row items-center justify-between rounded-full bg-surface-container-high p-2">
          <Pressable onPress={onRegisterPress} disabled={loading} className={pillClassName(mode === 'register')}>
            {mode === 'register' && loading ? (
              <ActivityIndicator color="#112f5e" />
            ) : (
              <Text className={labelClassName(mode === 'register')}>Регистрация</Text>
            )}
          </Pressable>
          <Pressable onPress={onLoginPress} disabled={loading} className={pillClassName(mode === 'login')}>
            {mode === 'login' && loading ? (
              <ActivityIndicator color="#112f5e" />
            ) : (
              <Text className={labelClassName(mode === 'login')}>Вход</Text>
            )}
          </Pressable>
        </View>
      </View>
    </AuthShell>
  );
}
