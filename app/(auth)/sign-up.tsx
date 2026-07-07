import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { FlatInput } from '@/components/FlatInput';
import { PillButton } from '@/components/PillButton';
import { signUpWithPassword } from '@/features/auth/api';

export default function SignUpScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          <FlatInput value={name} onChangeText={setName} placeholder="Име" autoCapitalize="words" />
          <FlatInput
            value={email}
            onChangeText={setEmail}
            placeholder="Имейл адрес"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <FlatInput value={password} onChangeText={setPassword} placeholder="Парола" secureTextEntry />
          <FlatInput
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Потвърди парола"
            secureTextEntry
          />
          {error ? <Text className="font-inter text-body-md text-error">{error}</Text> : null}
        </View>

        <PillButton label="Регистрация" onPress={onRegister} loading={loading} block />

        <Pressable onPress={() => router.back()} className="items-center">
          <Text className="font-inter text-label-md text-on-surface-variant">
            Вече имаш акаунт? <Text className="text-primary-container">Вход</Text>
          </Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}
