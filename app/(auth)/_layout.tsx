import { Stack } from 'expo-router';

/** Auth flow stack: sign-in, sign-up, and household setup/join. */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#121316' },
      }}
    />
  );
}
