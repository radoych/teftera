import { resolveRedirect } from './resolveRedirect';

describe('resolveRedirect', () => {
  it('never redirects while loading', () => {
    expect(resolveRedirect('loading', ['(app)', 'index'])).toBeNull();
  });

  it('sends unauthenticated users out of the app to sign-in', () => {
    expect(resolveRedirect('unauthenticated', ['(app)', 'index'])).toBe('/(auth)/sign-in');
  });

  it('lets unauthenticated users stay on public auth screens', () => {
    expect(resolveRedirect('unauthenticated', ['(auth)', 'sign-in'])).toBeNull();
    expect(resolveRedirect('unauthenticated', ['(auth)', 'sign-up'])).toBeNull();
  });

  it('pushes unauthenticated users off household screens', () => {
    expect(resolveRedirect('unauthenticated', ['(auth)', 'household-setup'])).toBe('/(auth)/sign-in');
  });

  it('routes needs-household users to household setup', () => {
    expect(resolveRedirect('needs-household', ['(app)', 'index'])).toBe('/(auth)/household-setup');
    expect(resolveRedirect('needs-household', ['(auth)', 'sign-in'])).toBe('/(auth)/household-setup');
  });

  it('lets needs-household users stay on setup/join', () => {
    expect(resolveRedirect('needs-household', ['(auth)', 'household-setup'])).toBeNull();
    expect(resolveRedirect('needs-household', ['(auth)', 'join-household'])).toBeNull();
  });

  it('sends ready users in the auth group into the app', () => {
    expect(resolveRedirect('ready', ['(auth)', 'sign-in'])).toBe('/(app)');
  });

  it('leaves ready users in the app (and root modals) alone', () => {
    expect(resolveRedirect('ready', ['(app)', 'index'])).toBeNull();
    expect(resolveRedirect('ready', ['scanner'])).toBeNull();
  });
});
