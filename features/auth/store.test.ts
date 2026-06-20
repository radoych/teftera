import { useAuthStore } from './store';

beforeEach(() => {
  useAuthStore.setState({
    status: 'loading',
    session: null,
    householdId: null,
    displayName: null,
  });
});

describe('useAuthStore', () => {
  it('enterHousehold sets household and marks ready', () => {
    useAuthStore.getState().enterHousehold('h1', 'Радо');
    const s = useAuthStore.getState();
    expect(s.householdId).toBe('h1');
    expect(s.displayName).toBe('Радо');
    expect(s.status).toBe('ready');
  });

  it('reset clears household and marks unauthenticated', () => {
    useAuthStore.getState().enterHousehold('h1', 'Радо');
    useAuthStore.getState().reset();
    const s = useAuthStore.getState();
    expect(s.householdId).toBeNull();
    expect(s.session).toBeNull();
    expect(s.status).toBe('unauthenticated');
  });
});
