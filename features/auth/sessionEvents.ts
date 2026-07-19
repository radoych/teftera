import type { AuthStatus } from './resolveRedirect';

/** True when an auth event is a routine token refresh for the already-applied user. */
export function shouldSkipAuthEvent(
  event: string,
  userId: string | undefined,
  lastAppliedUserId: string | null,
  status: AuthStatus,
): boolean {
  return (
    event === 'TOKEN_REFRESHED' &&
    userId !== undefined &&
    userId === lastAppliedUserId &&
    status === 'ready'
  );
}
