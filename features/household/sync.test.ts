import { useAuthStore } from '@/features/auth/store';
import type { HouseholdMember } from './api';
import { useHouseholdStore } from './store';
import { loadHousehold, refreshMembers, type HouseholdSyncDeps } from './sync';

jest.mock('./api', () => ({ getMembers: jest.fn(), getInviteCode: jest.fn() }));

const alice: HouseholdMember = { userId: 'u1', displayName: 'Алиса', role: 'owner' };
const bob: HouseholdMember = { userId: 'u2', displayName: 'Боб', role: 'member' };

function deps(over: Partial<HouseholdSyncDeps> = {}): HouseholdSyncDeps {
  return {
    getMembers: jest.fn().mockResolvedValue([alice, bob]),
    getInviteCode: jest.fn().mockResolvedValue('ABC123'),
    ...over,
  };
}

beforeEach(() => {
  useHouseholdStore.getState().reset();
  useAuthStore.setState({ householdId: 'h1' });
});

describe('household store', () => {
  it('writing for another household drops the previous cache', () => {
    useHouseholdStore.getState().setMembers('h1', [alice]);
    useHouseholdStore.getState().setInviteCode('h1', 'AAA');
    useHouseholdStore.getState().setInviteCode('h2', 'BBB');
    const s = useHouseholdStore.getState();
    expect(s).toMatchObject({ householdId: 'h2', inviteCode: 'BBB', members: [] });
  });

  it('reset clears everything', () => {
    useHouseholdStore.getState().setMembers('h1', [alice]);
    useHouseholdStore.getState().reset();
    expect(useHouseholdStore.getState()).toMatchObject({ householdId: null, members: [], inviteCode: '' });
  });
});

describe('refreshMembers', () => {
  it('stores the loaded members', async () => {
    await refreshMembers('h1', deps());
    expect(useHouseholdStore.getState().members).toEqual([alice, bob]);
  });

  it('keeps the cached list when the load fails', async () => {
    useHouseholdStore.getState().setMembers('h1', [alice]);
    await refreshMembers('h1', deps({ getMembers: jest.fn().mockRejectedValue(new Error('offline')) }));
    expect(useHouseholdStore.getState().members).toEqual([alice]);
  });

  it('drops a response for a household the user has left', async () => {
    useAuthStore.setState({ householdId: 'h2' });
    await refreshMembers('h1', deps());
    expect(useHouseholdStore.getState().members).toEqual([]);
  });
});

describe('loadHousehold', () => {
  it('skips the invite-code query when bootstrap already cached it', async () => {
    useHouseholdStore.getState().setInviteCode('h1', 'CACHED');
    const d = deps();
    await loadHousehold('h1', d);
    expect(d.getInviteCode).not.toHaveBeenCalled();
    expect(useHouseholdStore.getState()).toMatchObject({ inviteCode: 'CACHED', members: [alice, bob] });
  });

  it('fetches the invite code when missing (join path)', async () => {
    const d = deps();
    await loadHousehold('h1', d);
    expect(d.getInviteCode).toHaveBeenCalledWith('h1');
    expect(useHouseholdStore.getState().inviteCode).toBe('ABC123');
  });

  it('an invite-code failure does not lose the members', async () => {
    await loadHousehold('h1', deps({ getInviteCode: jest.fn().mockRejectedValue(new Error('x')) }));
    expect(useHouseholdStore.getState()).toMatchObject({ inviteCode: '', members: [alice, bob] });
  });
});
