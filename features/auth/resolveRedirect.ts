export type AuthStatus = 'loading' | 'unauthenticated' | 'needs-household' | 'ready';

const AUTH_GROUP = '(auth)';
const PUBLIC_SCREENS = ['sign-in', 'sign-up'];
const HOUSEHOLD_SCREENS = ['household-setup', 'join-household'];

/**
 * Given the auth status and the current expo-router segments, return the href to
 * redirect to, or null when the user is already in an allowed location.
 */
export function resolveRedirect(status: AuthStatus, segments: string[]): string | null {
  const inAuthGroup = segments[0] === AUTH_GROUP;
  const screen = segments[1] ?? '';

  switch (status) {
    case 'loading':
      return null;
    case 'unauthenticated':
      return inAuthGroup && PUBLIC_SCREENS.includes(screen) ? null : '/(auth)/sign-in';
    case 'needs-household':
      return inAuthGroup && HOUSEHOLD_SCREENS.includes(screen) ? null : '/(auth)/household-setup';
    case 'ready':
      return inAuthGroup ? '/(app)' : null;
  }
}
