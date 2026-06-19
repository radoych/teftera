# Auth + Household Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing UI-only auth, household-setup, and profile screens to Supabase Auth and the database so a user can sign up / sign in with email+password, create or join a real household, and be routed correctly on every launch.

**Architecture:** A Zustand store (`features/auth/store.ts`) is the single source of routing truth via a `status` field. `useAuthBootstrap` hydrates it from Supabase and keeps it live; `useProtectedRoute` redirects based on `status`. Household create/join go through `SECURITY DEFINER` RPCs because RLS forbids a non-member from reading a household by its code. All Supabase access is isolated in `features/auth/api.ts` and `features/household/api.ts`; screens never import `supabase` directly.

**Tech Stack:** React Native 0.85, Expo ~56 + Expo Router ~56, TypeScript (strict), Zustand 5, `@supabase/supabase-js` 2.108, Supabase CLI (migrations), Jest + jest-expo.

## Global Constraints

- **TypeScript strict; no `any`; no plain `.js` files.** (CLAUDE.md)
- **UI copy is Bulgarian.** Match the tone of existing screens.
- **Currency is EUR (€); never `$` / USD.** (not exercised in this slice, but never violate)
- **`household_id` + RLS on every table** — already in place; do not weaken it.
- **Supabase calls live only in `services/*` or `features/*/api.ts`** (plus the auth store/bootstrap). Screens import the api/store, never `supabase`.
- **Invite codes:** 8 chars from alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no O/0/I/1); stored raw; displayed grouped `XXXX-XXXX`.
- **Email confirmation is OFF** in Supabase Auth for this slice (manual dashboard toggle, Task 1).
- **Conventional commits** (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Migrations applied with `npx supabase db push`; project linked to ref `kabevzkjocnrceqsdavw`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_auth_household_rpcs.sql` | invite-code generator + default, `display_name` column, `create_household` + `join_household_by_code` RPCs |
| `features/household/inviteCode.ts` | pure: `normalizeInviteCode`, `formatInviteCode` |
| `features/household/inviteCode.test.ts` | unit tests for the above |
| `features/auth/errors.ts` | pure: `mapAuthError` (Supabase error → Bulgarian) |
| `features/auth/errors.test.ts` | unit tests for the above |
| `features/auth/resolveRedirect.ts` | pure: `resolveRedirect(status, segments)` → href \| null |
| `features/auth/resolveRedirect.test.ts` | unit tests for the above |
| `features/auth/store.ts` | Zustand auth store (`status`, `session`, `householdId`, `displayName`) |
| `features/auth/store.test.ts` | unit tests for store actions |
| `features/auth/api.ts` | `signUpWithPassword`, `signInWithPassword`, `signOut` |
| `features/auth/bootstrap.ts` | `useAuthBootstrap`, `useProtectedRoute` |
| `features/household/api.ts` | `getMyHousehold`, `createHousehold`, `joinHouseholdByCode`, `getMembers` |
| `app/_layout.tsx` (modify) | mount bootstrap + protected route; splash gating |
| `app/(auth)/sign-in.tsx` (modify) | wire email/password sign-in |
| `app/(auth)/sign-up.tsx` (modify) | wire sign-up |
| `features/household/HouseholdSetupView.tsx` (modify) | wire create/join/skip, two-phase create |
| `app/(app)/profile.tsx` (modify) | real user/members, sign-out |

---

### Task 1: Database migration — invite codes, display_name, create/join RPCs

**Files:**
- Create: `supabase/migrations/<timestamp>_auth_household_rpcs.sql` (generated via CLI)

**Interfaces:**
- Produces (Postgres RPCs the client calls in Task 7):
  - `public.create_household(p_name text, p_display_name text) returns table(id uuid, invite_code text)`
  - `public.join_household_by_code(p_code text, p_display_name text) returns uuid`
  - new column `public.household_members.display_name text`
  - `households.invite_code` default now produces an 8-char code from the unambiguous alphabet

- [ ] **Step 1: Disable email confirmation in Supabase**

In the Supabase dashboard: **Authentication → Sign In / Providers → Email → turn OFF "Confirm email" → Save.** (Required so `signUp` returns a session immediately.)

- [ ] **Step 2: Generate the migration file**

Run: `npx supabase migration new auth_household_rpcs`
Expected: prints `Created new migration at supabase/migrations/<timestamp>_auth_household_rpcs.sql`

- [ ] **Step 3: Write the migration SQL**

Write this into the generated file:

```sql
-- Teftera — invite-code generator, member display_name, and the create/join RPCs.
--
-- create_household / join_household_by_code are SECURITY DEFINER and granted to
-- `authenticated` ON PURPOSE: the client must call them, and a joiner cannot read
-- a household by its code under RLS (SELECT requires membership). Both are scoped
-- to auth.uid() internally. The resulting advisor warnings 0029 for these two
-- functions are expected and intentional.

-- Invite-code generator: 8 chars, unambiguous alphabet (no O/0/I/1).
create or replace function private.gen_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

alter table public.households
  alter column invite_code set default private.gen_invite_code();

-- Member display name (avoids exposing auth.users to read other members).
alter table public.household_members
  add column display_name text;

-- Create a household + the creator's membership atomically.
create or replace function public.create_household(p_name text, p_display_name text)
returns table (id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.households (name)
  values (p_name)
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household.id, auth.uid(), 'owner', p_display_name);

  id := v_household.id;
  invite_code := v_household.invite_code;
  return next;
end;
$$;

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

-- Resolve an invite code (bypassing RLS) and join the caller to that household.
create or replace function public.join_household_by_code(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_household_id
  from public.households
  where invite_code = upper(p_code);

  if v_household_id is null then
    raise exception 'invalid invite code';
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, auth.uid(), 'member', p_display_name)
  on conflict (household_id, user_id) do nothing;

  return v_household_id;
end;
$$;

revoke all on function public.join_household_by_code(text, text) from public, anon;
grant execute on function public.join_household_by_code(text, text) to authenticated;
```

- [ ] **Step 4: Push the migration**

Run: `npx supabase db push` then confirm with `y`.
Expected: `Applying migration <timestamp>_auth_household_rpcs.sql...` then `Finished`. (Ignore the Docker catalog-cache warning.)

- [ ] **Step 5: Verify via MCP**

Ask Claude to run `mcp__supabase__list_migrations` (the new migration appears) and `mcp__supabase__get_advisors type=security`.
Expected: the only NEW warnings are two `authenticated_security_definer_function_executable` entries for `create_household` and `join_household_by_code` — these are **intentional**. No other new findings.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations
git commit -m "feat(db): invite-code generator, member display_name, create/join RPCs"
```

---

### Task 2: Invite-code helpers (pure, TDD)

**Files:**
- Create: `features/household/inviteCode.ts`
- Test: `features/household/inviteCode.test.ts`

**Interfaces:**
- Produces (used by Task 7 api and Tasks 9–11 screens):
  - `normalizeInviteCode(input: string): string` — uppercase, strip non-alphanumeric
  - `formatInviteCode(code: string): string` — group as `XXXX-XXXX`

- [ ] **Step 1: Write the failing test**

```ts
// features/household/inviteCode.test.ts
import { formatInviteCode, normalizeInviteCode } from './inviteCode';

describe('normalizeInviteCode', () => {
  it('uppercases and strips dashes/spaces', () => {
    expect(normalizeInviteCode('9f4k-7x2b')).toBe('9F4K7X2B');
    expect(normalizeInviteCode('  9f4k 7x2b ')).toBe('9F4K7X2B');
  });
});

describe('formatInviteCode', () => {
  it('groups 8 chars as XXXX-XXXX, uppercased', () => {
    expect(formatInviteCode('9f4k7x2b')).toBe('9F4K-7X2B');
    expect(formatInviteCode('9F4K7X2B')).toBe('9F4K-7X2B');
  });
  it('returns short codes unchanged (no trailing dash)', () => {
    expect(formatInviteCode('ABC')).toBe('ABC');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- inviteCode`
Expected: FAIL — `Cannot find module './inviteCode'`.

- [ ] **Step 3: Write the implementation**

```ts
// features/household/inviteCode.ts
/** Uppercase and strip everything that isn't a letter or digit (dashes, spaces). */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Display an invite code grouped as XXXX-XXXX. Codes of 4 chars or fewer are returned as-is. */
export function formatInviteCode(code: string): string {
  const c = normalizeInviteCode(code);
  if (c.length <= 4) return c;
  return `${c.slice(0, 4)}-${c.slice(4, 8)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- inviteCode`
Expected: PASS (4 assertions).

- [ ] **Step 5: Commit**

```bash
git add features/household/inviteCode.ts features/household/inviteCode.test.ts
git commit -m "feat(household): invite-code normalize/format helpers"
```

---

### Task 3: Auth error mapping (pure, TDD)

**Files:**
- Create: `features/auth/errors.ts`
- Test: `features/auth/errors.test.ts`

**Interfaces:**
- Produces (used by Tasks 6, 7, 10): `mapAuthError(error: unknown): string` — Bulgarian, user-facing.

- [ ] **Step 1: Write the failing test**

```ts
// features/auth/errors.test.ts
import { mapAuthError } from './errors';

describe('mapAuthError', () => {
  it('maps invalid credentials', () => {
    expect(mapAuthError(new Error('Invalid login credentials'))).toBe('Грешен имейл или парола.');
  });
  it('maps already-registered', () => {
    expect(mapAuthError(new Error('User already registered'))).toBe('Вече има акаунт с този имейл.');
  });
  it('maps invalid invite code', () => {
    expect(mapAuthError(new Error('invalid invite code'))).toBe('Невалиден код за покана.');
  });
  it('falls back to a generic message', () => {
    expect(mapAuthError(new Error('some unknown thing'))).toBe('Нещо се обърка. Опитай пак.');
    expect(mapAuthError(null)).toBe('Нещо се обърка. Опитай пак.');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- errors`
Expected: FAIL — `Cannot find module './errors'`.

- [ ] **Step 3: Write the implementation**

```ts
// features/auth/errors.ts
/** Map a Supabase auth/RPC error to a Bulgarian, user-facing message. */
export function mapAuthError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const m = raw.toLowerCase();

  if (m.includes('invalid login credentials')) return 'Грешен имейл или парола.';
  if (m.includes('already registered') || m.includes('already been registered'))
    return 'Вече има акаунт с този имейл.';
  if (m.includes('password should be at least')) return 'Паролата трябва да е поне 6 символа.';
  if (m.includes('invalid email') || m.includes('unable to validate email'))
    return 'Невалиден имейл адрес.';
  if (m.includes('invite') || m.includes('invalid invite code')) return 'Невалиден код за покана.';
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'Няма връзка. Провери интернета си.';
  return 'Нещо се обърка. Опитай пак.';
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- errors`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add features/auth/errors.ts features/auth/errors.test.ts
git commit -m "feat(auth): map Supabase errors to Bulgarian messages"
```

---

### Task 4: Redirect resolver (pure, TDD)

**Files:**
- Create: `features/auth/resolveRedirect.ts`
- Test: `features/auth/resolveRedirect.test.ts`

**Interfaces:**
- Consumes: `AuthStatus` type (defined here, re-exported from `store.ts` in Task 5).
- Produces (used by Task 8): `resolveRedirect(status: AuthStatus, segments: string[]): string | null`

Note: `AuthStatus` is defined in this file to avoid a circular dependency with the store; Task 5's store imports it from here.

- [ ] **Step 1: Write the failing test**

```ts
// features/auth/resolveRedirect.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- resolveRedirect`
Expected: FAIL — `Cannot find module './resolveRedirect'`.

- [ ] **Step 3: Write the implementation**

```ts
// features/auth/resolveRedirect.ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- resolveRedirect`
Expected: PASS (8 assertions).

- [ ] **Step 5: Commit**

```bash
git add features/auth/resolveRedirect.ts features/auth/resolveRedirect.test.ts
git commit -m "feat(auth): pure redirect resolver for route guarding"
```

---

### Task 5: Auth store (Zustand)

**Files:**
- Create: `features/auth/store.ts`
- Test: `features/auth/store.test.ts`

**Interfaces:**
- Consumes: `AuthStatus` from `resolveRedirect.ts`.
- Produces (used by Tasks 8–11):
  - `useAuthStore` with state `{ status, session, householdId, displayName }`
  - actions `setStatus(status)`, `setSession(session)`, `setHousehold(householdId, displayName)`, `enterHousehold(householdId, displayName)` (sets household + `status:'ready'`), `reset()` (clears + `status:'unauthenticated'`)

- [ ] **Step 1: Write the failing test**

```ts
// features/auth/store.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- store`
Expected: FAIL — `Cannot find module './store'`.

- [ ] **Step 3: Write the implementation**

```ts
// features/auth/store.ts
import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { AuthStatus } from './resolveRedirect';

export type { AuthStatus };

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  householdId: string | null;
  displayName: string | null;
  setStatus: (status: AuthStatus) => void;
  setSession: (session: Session | null) => void;
  setHousehold: (householdId: string | null, displayName: string | null) => void;
  enterHousehold: (householdId: string, displayName: string) => void;
  reset: () => void;
}

const cleared = { session: null, householdId: null, displayName: null };

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  ...cleared,
  setStatus: (status) => set({ status }),
  setSession: (session) => set({ session }),
  setHousehold: (householdId, displayName) => set({ householdId, displayName }),
  enterHousehold: (householdId, displayName) =>
    set({ householdId, displayName, status: 'ready' }),
  reset: () => set({ ...cleared, status: 'unauthenticated' }),
}));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- store`
Expected: PASS (2 assertions).

- [ ] **Step 5: Commit**

```bash
git add features/auth/store.ts features/auth/store.test.ts
git commit -m "feat(auth): Zustand auth store"
```

---

### Task 6: Auth API (sign-up / sign-in / sign-out)

**Files:**
- Create: `features/auth/api.ts`

**Interfaces:**
- Consumes: `supabase` from `@/services/supabase`, `mapAuthError` from `./errors`.
- Produces (used by Tasks 9, 11):
  - `signUpWithPassword(email: string, password: string, displayName: string): Promise<{ error: string | null }>`
  - `signInWithPassword(email: string, password: string): Promise<{ error: string | null }>`
  - `signOut(): Promise<void>`

This task is integration code (real Supabase calls). It is verified by typecheck + the end-to-end checkpoint in Task 12, not by mocked unit tests (per the spec's testing decision).

- [ ] **Step 1: Write the implementation**

```ts
// features/auth/api.ts
import { supabase } from '@/services/supabase';
import { mapAuthError } from './errors';

export interface AuthResult {
  error: string | null;
}

export async function signUpWithPassword(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthResult> {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  return { error: error ? mapAuthError(error) : null };
}

export async function signInWithPassword(email: string, password: string): Promise<AuthResult> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error ? mapAuthError(error) : null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no errors.

- [ ] **Step 3: Commit**

```bash
git add features/auth/api.ts
git commit -m "feat(auth): email/password sign-up, sign-in, sign-out api"
```

---

### Task 7: Household API

**Files:**
- Create: `features/household/api.ts`

**Interfaces:**
- Consumes: `supabase` from `@/services/supabase`; the RPCs from Task 1.
- Produces (used by Tasks 8, 10, 11):
  - `getMyHousehold(): Promise<{ householdId: string; inviteCode: string; displayName: string } | null>`
  - `createHousehold(name: string, displayName: string): Promise<{ householdId: string; inviteCode: string }>`
  - `joinHouseholdByCode(code: string, displayName: string): Promise<{ householdId: string }>` (throws on invalid code)
  - `getMembers(householdId: string): Promise<HouseholdMember[]>` where `HouseholdMember = { userId: string; displayName: string; role: string }`

Integration code — verified by typecheck + Task 12 checkpoint.

- [ ] **Step 1: Write the implementation**

```ts
// features/household/api.ts
import { supabase } from '@/services/supabase';

export interface MyHousehold {
  householdId: string;
  inviteCode: string;
  displayName: string;
}

export interface HouseholdMember {
  userId: string;
  displayName: string;
  role: string;
}

/** The current user's household, or null if they have none yet. */
export async function getMyHousehold(): Promise<MyHousehold | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, display_name')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!membership) return null;

  const { data: household } = await supabase
    .from('households')
    .select('invite_code')
    .eq('id', membership.household_id)
    .maybeSingle();

  return {
    householdId: membership.household_id,
    displayName: membership.display_name ?? '',
    inviteCode: household?.invite_code ?? '',
  };
}

/** Create a household + the creator's membership (atomic, via RPC). */
export async function createHousehold(
  name: string,
  displayName: string,
): Promise<{ householdId: string; inviteCode: string }> {
  const { data, error } = await supabase.rpc('create_household', {
    p_name: name,
    p_display_name: displayName,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { householdId: row.id, inviteCode: row.invite_code };
}

/** Join a household by invite code (via RPC). Throws if the code is invalid. */
export async function joinHouseholdByCode(
  code: string,
  displayName: string,
): Promise<{ householdId: string }> {
  const { data, error } = await supabase.rpc('join_household_by_code', {
    p_code: code,
    p_display_name: displayName,
  });
  if (error) throw error;
  const householdId = Array.isArray(data) ? data[0] : data;
  return { householdId: householdId as string };
}

/** All members of a household, oldest first. */
export async function getMembers(householdId: string): Promise<HouseholdMember[]> {
  const { data, error } = await supabase
    .from('household_members')
    .select('user_id, display_name, role')
    .eq('household_id', householdId)
    .order('joined_at', { ascending: true });
  if (error || !data) return [];
  return data.map((m) => ({
    userId: m.user_id,
    displayName: m.display_name ?? '',
    role: m.role,
  }));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0. (If the generated Supabase types are strict about `rpc` names, cast the call args; do not add `any`.)

- [ ] **Step 3: Commit**

```bash
git add features/household/api.ts
git commit -m "feat(household): create/join/get household + members api"
```

---

### Task 8: Bootstrap + protected route, wired into root layout

**Files:**
- Create: `features/auth/bootstrap.ts`
- Modify: `app/_layout.tsx`

**Interfaces:**
- Consumes: `useAuthStore`, `resolveRedirect`, `getMyHousehold`, `supabase`.
- Produces: `useAuthBootstrap(): void`, `useProtectedRoute(): void`.

- [ ] **Step 1: Write `features/auth/bootstrap.ts`**

```ts
// features/auth/bootstrap.ts
import { useEffect } from 'react';
import { useRouter, useSegments } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/services/supabase';
import { getMyHousehold } from '@/features/household/api';
import { resolveRedirect } from './resolveRedirect';
import { useAuthStore } from './store';

/** Hydrate the auth store from Supabase and keep it live. Call once, in the root layout. */
export function useAuthBootstrap(): void {
  const { setStatus, setSession, setHousehold, reset } = useAuthStore.getState();

  useEffect(() => {
    let active = true;

    async function applySession(session: Session | null) {
      if (!active) return;
      if (!session) {
        reset();
        return;
      }
      setSession(session);
      const household = await getMyHousehold();
      if (!active) return;
      if (household) {
        setHousehold(household.householdId, household.displayName);
        setStatus('ready');
      } else {
        setHousehold(null, null);
        setStatus('needs-household');
      }
    }

    supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [reset, setHousehold, setSession, setStatus]);
}

/** Redirect to the correct group based on auth status. Call once, in the root layout. */
export function useProtectedRoute(): void {
  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const target = resolveRedirect(status, segments as string[]);
    if (target) router.replace(target as never);
  }, [status, segments, router]);
}
```

- [ ] **Step 2: Modify `app/_layout.tsx`**

Add imports near the top:

```ts
import { useAuthStore } from '@/features/auth/store';
import { useAuthBootstrap, useProtectedRoute } from '@/features/auth/bootstrap';
```

Inside `RootLayout`, after the `useFonts` call, add:

```ts
  const status = useAuthStore((s) => s.status);
  useAuthBootstrap();
  useProtectedRoute();
```

Replace the existing splash-hide effect with one that also waits for auth status:

```ts
  useEffect(() => {
    if ((fontsLoaded || fontError) && status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, status]);
```

Leave the `if (!fontsLoaded && !fontError) return null;` guard and the returned `<Stack>` as-is.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual verification**

Run: `npx expo start`, open the app on a device/emulator with a fresh (logged-out) state.
Expected: after the splash, the app lands on **sign-in** (not the dashboard). The previous `router.replace('/(app)')` stubs no longer let you in without a session.

- [ ] **Step 5: Commit**

```bash
git add features/auth/bootstrap.ts app/_layout.tsx
git commit -m "feat(auth): bootstrap session + protected-route guard"
```

---

### Task 9: Wire sign-in and sign-up screens

**Files:**
- Modify: `app/(auth)/sign-in.tsx`
- Modify: `app/(auth)/sign-up.tsx`

**Interfaces:**
- Consumes: `signInWithPassword`, `signUpWithPassword` from `@/features/auth/api`.

The redirect after success is handled by `useProtectedRoute` (status flips → guard moves the user). Screens only call the api, show loading, and surface errors.

- [ ] **Step 1: Rewrite `app/(auth)/sign-in.tsx`**

Replace the stub `onLogin` and the bottom action pill's login press handler with real auth. Full file:

```tsx
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
```

(The Google button is now dimmed (`opacity-40`) and inert — present but not wired.)

- [ ] **Step 2: Rewrite `app/(auth)/sign-up.tsx`**

Add a name field, password-match validation, real sign-up. Full file:

```tsx
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { FlatInput } from '@/components/FlatInput';
import { GoogleGlyph } from '@/components/GoogleGlyph';
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

        <View className="gap-md">
          <PillButton label="Регистрация" onPress={onRegister} loading={loading} block />
          <Pressable className="h-12 flex-row items-center justify-center gap-3 rounded-full border border-white/10 opacity-40">
            <GoogleGlyph size={20} />
            <Text className="font-jakarta-semibold text-headline-md text-on-surface">
              Продължи с Google
            </Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.back()} className="items-center">
          <Text className="font-inter text-label-md text-on-surface-variant">
            Вече имаш акаунт? <Text className="text-primary-container">Вход</Text>
          </Text>
        </Pressable>
      </View>
    </AuthShell>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual verification**

In the running app: tap Регистрация, fill name/email/password/confirm, submit.
Expected: account is created and the app routes to **household-setup** (because the new user has no household). A wrong-confirm shows „Паролите не съвпадат." A bad sign-in on the sign-in screen shows „Грешен имейл или парола."

- [ ] **Step 5: Commit**

```bash
git add "app/(auth)/sign-in.tsx" "app/(auth)/sign-up.tsx"
git commit -m "feat(auth): wire sign-in and sign-up to Supabase"
```

---

### Task 10: Wire the household-setup screen

**Files:**
- Modify: `features/household/HouseholdSetupView.tsx`

**Interfaces:**
- Consumes: `createHousehold`, `joinHouseholdByCode` from `@/features/household/api`; `formatInviteCode`, `normalizeInviteCode` from `@/features/household/inviteCode`; `mapAuthError` from `@/features/auth/errors`; `useAuthStore` (for `enterHousehold` and `displayName`).

Behavior: **create** is two-phase — submitting the name creates the household and reveals the real invite code with share actions and a "to dashboard" button. **join** resolves the code and enters the app. **skip** creates a solo household named „Моето домакинство". On any success, call `enterHousehold(householdId, displayName)` — the guard then routes to `(app)`.

- [ ] **Step 1: Rewrite `features/household/HouseholdSetupView.tsx`**

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { AuthShell } from '@/components/AuthShell';
import { HairlineDivider } from '@/components/HairlineDivider';
import { PillButton } from '@/components/PillButton';
import { SectionLabel } from '@/components/SectionLabel';
import { mapAuthError } from '@/features/auth/errors';
import { useAuthStore } from '@/features/auth/store';
import { createHousehold, joinHouseholdByCode } from '@/features/household/api';
import { formatInviteCode, normalizeInviteCode } from '@/features/household/inviteCode';

type Tab = 'create' | 'join';

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 items-center rounded-full py-3 ${active ? 'bg-primary-container' : ''}`}>
      <Text
        className={`font-inter-medium text-label-md ${active ? 'text-on-primary' : 'text-on-surface-variant'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export function HouseholdSetupView({ defaultTab = 'create' }: { defaultTab?: Tab }) {
  const displayName = useAuthStore((s) => s.displayName) ?? '';
  const enterHousehold = useAuthStore((s) => s.enterHousehold);

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCreate = async () => {
    setError(null);
    if (!name.trim()) {
      setError('Въведи име на домакинството.');
      return;
    }
    setLoading(true);
    try {
      const { householdId, inviteCode } = await createHousehold(name.trim(), displayName);
      setCreatedId(householdId);
      setCreatedCode(inviteCode);
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const onJoin = async () => {
    setError(null);
    const normalized = normalizeInviteCode(code);
    if (!normalized) {
      setError('Въведи код за покана.');
      return;
    }
    setLoading(true);
    try {
      const { householdId } = await joinHouseholdByCode(normalized, displayName);
      enterHousehold(householdId, displayName);
    } catch (e) {
      setError(mapAuthError(e));
    } finally {
      setLoading(false);
    }
  };

  const onSkip = async () => {
    setError(null);
    setLoading(true);
    try {
      const { householdId } = await createHousehold('Моето домакинство', displayName);
      enterHousehold(householdId, displayName);
    } catch (e) {
      setError(mapAuthError(e));
      setLoading(false);
    }
  };

  const copyCode = async () => {
    if (!createdCode) return;
    await Clipboard.setStringAsync(formatInviteCode(createdCode));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AuthShell>
      <View className="flex-1 pt-xxl">
        <View className="mb-xl">
          <Text className="mb-sm font-jakarta-semibold text-headline-xl text-on-surface">
            Настрой домакинството
          </Text>
          <Text className="font-inter text-body-lg text-on-surface-variant opacity-70">
            Teftera работи най-добре споделено с някого, на когото вярваш.
          </Text>
        </View>

        {createdCode ? (
          // Phase 2 — household created, show the real invite code.
          <View className="gap-lg">
            <SectionLabel>Покани партньора си</SectionLabel>
            <View className="flex-row items-end justify-between">
              <Text className="font-inter-semibold text-[32px] tracking-widest text-primary">
                {formatInviteCode(createdCode)}
              </Text>
              <Pressable onPress={copyCode} hitSlop={8}>
                <MaterialIcons
                  name={copied ? 'check' : 'content-copy'}
                  size={22}
                  color={copied ? '#c3f400' : '#adc7ff'}
                />
              </Pressable>
            </View>
            <Text className="font-inter text-body-md text-on-surface-variant opacity-60">
              Сподели този код с партньора си, за да синхронизирате финансите си.
            </Text>
            <View className="flex-1" />
            <PillButton
              label="Към таблото"
              variant="filled"
              block
              onPress={() => createdId && enterHousehold(createdId, displayName)}
            />
          </View>
        ) : (
          <>
            <View className="mb-xl flex-row rounded-full border border-white/5 bg-surface-container-low p-1">
              <SegmentButton
                label="Създай"
                active={tab === 'create'}
                onPress={() => setTab('create')}
              />
              <SegmentButton
                label="Присъедини се"
                active={tab === 'join'}
                onPress={() => setTab('join')}
              />
            </View>

            {tab === 'create' ? (
              <View className="gap-xl">
                <View>
                  <SectionLabel className="mb-2">Име на домакинството</SectionLabel>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="напр. Дом Джечеви"
                    placeholderTextColor="rgba(196,198,208,0.3)"
                    className="border-b border-white/10 py-4 font-jakarta-medium text-headline-md text-on-surface"
                  />
                </View>
                <PillButton
                  label="Създай домакинство"
                  variant="filled"
                  block
                  loading={loading}
                  onPress={onCreate}
                />
              </View>
            ) : (
              <View className="gap-xl">
                <View>
                  <SectionLabel className="mb-2 opacity-60">Код за покана</SectionLabel>
                  <TextInput
                    value={code}
                    onChangeText={(t) => setCode(t.toUpperCase())}
                    placeholder="напр. 9F4K-7X2B"
                    placeholderTextColor="rgba(196,198,208,0.3)"
                    autoCapitalize="characters"
                    maxLength={9}
                    className="border-b border-white/10 py-4 font-inter-semibold text-[32px] uppercase tracking-widest text-on-surface"
                  />
                </View>
                <PillButton
                  label="Присъедини се"
                  variant="filled"
                  block
                  loading={loading}
                  onPress={onJoin}
                />
                <Text className="px-4 text-center font-inter text-body-md text-on-surface-variant opacity-60">
                  Въведи 8-символния код, споделен от партньора ти.
                </Text>
              </View>
            )}

            {error ? (
              <Text className="mt-lg font-inter text-body-md text-error">{error}</Text>
            ) : null}

            <View className="flex-1" />

            <Pressable onPress={onSkip} disabled={loading} className="mt-xxl items-center">
              {loading ? (
                <ActivityIndicator color="#c4c6d0" />
              ) : (
                <Text className="font-inter text-label-md text-on-surface-variant opacity-60">
                  Пропусни засега — ще поканя по-късно
                </Text>
              )}
            </Pressable>
          </>
        )}
      </View>
    </AuthShell>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Manual verification**

As a freshly-registered user on household-setup:
- **Create:** type a name → "Създай домакинство" → the screen reveals a real 8-char code formatted `XXXX-XXXX` → "Към таблото" lands on the dashboard.
- **Join (second account):** enter the code from the first account → "Присъедини се" → lands on the dashboard; an invalid code shows „Невалиден код за покана."
- **Skip:** "Пропусни засега" → lands on the dashboard (a solo household was created).

- [ ] **Step 4: Commit**

```bash
git add features/household/HouseholdSetupView.tsx
git commit -m "feat(household): wire create/join/skip with real invite codes"
```

---

### Task 11: Wire the profile screen

**Files:**
- Modify: `app/(app)/profile.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (session, householdId, displayName), `getMembers`, `getMyHousehold` from `@/features/household/api`, `signOut` from `@/features/auth/api`, `formatInviteCode`.

- [ ] **Step 1: Replace the hard-coded header, members, and sign-out**

Add imports:

```ts
import { useEffect, useState } from 'react';
import { useAuthStore } from '@/features/auth/store';
import { signOut } from '@/features/auth/api';
import { getMembers, getMyHousehold, type HouseholdMember } from '@/features/household/api';
import { formatInviteCode } from '@/features/household/inviteCode';
```

Inside `ProfileScreen`, replace the `MEMBERS` constant usage with live state:

```ts
  const session = useAuthStore((s) => s.session);
  const householdId = useAuthStore((s) => s.householdId);
  const displayName = useAuthStore((s) => s.displayName) ?? '';
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [inviteCode, setInviteCode] = useState('');

  const email = session?.user.email ?? '';
  const initials = displayName
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    if (!householdId) return;
    getMembers(householdId).then(setMembers);
    getMyHousehold().then((h) => setInviteCode(h?.inviteCode ?? ''));
  }, [householdId]);

  const onSignOut = async () => {
    await signOut();
    // useProtectedRoute redirects to sign-in once the session clears.
  };
```

- [ ] **Step 2: Render real data**

- Replace the header avatar initials `РД` with `{initials}`, the name `Радо Джечев` with `{displayName}`, and the email line with `{email}`.
- Replace the `MEMBERS.map(...)` block with a map over `members`, deriving each member's initials from `m.displayName` the same way, showing `m.displayName` (or „Без име" if empty) and a role label: `m.role === 'owner' ? 'Собственик' : 'Член'`.
- Under the "Покани член" row, show the invite code when present:

```tsx
        {inviteCode ? (
          <Text className="mt-2 font-inter-semibold text-body-lg tracking-widest text-primary">
            {formatInviteCode(inviteCode)}
          </Text>
        ) : null}
```

- Change the sign-out `Pressable` from `onPress={() => router.replace('/(auth)/sign-in')}` to `onPress={onSignOut}`. (Leave the `logout` icon and „Изход" label.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Manual verification**

On the profile tab while signed in:
Expected: avatar initials, name, and email reflect the real account; the household section lists the real members with correct roles; the invite code shows formatted; tapping „Изход" signs out and returns to sign-in.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/profile.tsx"
git commit -m "feat(profile): real user, members, invite code, and sign-out"
```

---

### Task 12: End-to-end checkpoint + docs

**Files:**
- Modify: `CLAUDE.md` (Commands section), `teftera-build-plan.md` (Day 4 checkboxes)

- [ ] **Step 1: Full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all suites pass (including `inviteCode`, `errors`, `resolveRedirect`, `store`); tsc exit 0.

- [ ] **Step 2: Build-plan checkpoint (manual, two accounts)**

Verify the Day 4 checkpoint end-to-end:
1. Sign up account A → create household → land on dashboard.
2. Sign out → sign back in as A → land on dashboard (session persists, household resolved).
3. Sign up account B → join with A's invite code → land on dashboard.
4. On both accounts, profile shows both members with correct names/roles.
5. Kill and reopen the app while signed in → lands on dashboard without re-login (AsyncStorage session).

- [ ] **Step 3: Update docs**

- In `CLAUDE.md` Commands, confirm the `supabase migration new` / `supabase db push` lines reflect `npx supabase ...` (the CLI is a devDependency).
- In `teftera-build-plan.md`, tick the Day 4 boxes that are now done; leave **Google OAuth** unchecked with a note „(deferred — see spec 2026-06-19-auth-household-flow)".

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md teftera-build-plan.md
git commit -m "docs: mark Day 4 auth+household done (Google OAuth deferred)"
```

---

## Notes for the implementer

- **Advisor warnings:** after Task 1, two `authenticated_security_definer_function_executable` warnings (for `create_household`, `join_household_by_code`) are expected and intentional — those RPCs must be callable by `authenticated` and must be definer to bypass RLS for the code lookup. Do not try to "fix" them by switching to `SECURITY INVOKER` (it would break join).
- **Redirect after success:** create/join/sign-in/sign-out never call `router` directly for the happy path — they mutate the store and let `useProtectedRoute` move the user. This keeps one routing authority.
- **No mocked-Supabase tests:** integration tasks (6, 7, 8, 9, 10, 11) are validated by `npx tsc --noEmit` + the manual checkpoints, per the spec's testing decision. Do not add brittle mocks.
- **Google button:** stays visible but dimmed/inert until the deferred OAuth slice.
