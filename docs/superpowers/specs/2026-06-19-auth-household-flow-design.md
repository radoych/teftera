# Auth + Household Flow — Design

**Date:** 2026-06-19
**Scope:** Build-plan Day 4 (Auth + Household), excluding Google OAuth (deferred — see below).
**Status:** Approved, ready for implementation plan.

## Goal

Wire the existing UI-only auth, household-setup, and profile screens to Supabase
Auth and the database, so a user can sign up / sign in with email+password, land in
a real household (created or joined), and have the app route them correctly on every
launch. Days 1–3 (scaffold, screens, schema + RLS) are complete; this is the Day 3 →
Day 4 step.

## Decisions (locked)

1. **Email/password only this slice.** Google OAuth is deferred (button stays visible
   but inert). Recorded as a follow-up below.
2. **Email confirmation OFF** in Supabase Auth for now — sign-up returns a session
   immediately. Re-enable before any public launch (see memory
   `email-confirmation-disabled`).
3. **Invite codes**: 8 chars from an unambiguous alphabet `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
   (no O/0/I/1). Stored raw; displayed grouped as `XXXX-XXXX`. The mock's `TEFT-` prefix
   was demo branding only.
4. **Routing architecture**: Zustand auth store + a redirect guard in the root layout
   (approach A). No React Context, no `Stack.Protected`.

## Architecture

```
features/auth/
  store.ts          Zustand: { session, householdId, displayName, status }
  bootstrap.ts      useAuthBootstrap() — getSession + onAuthStateChange, loads household
  api.ts            signUpWithPassword, signInWithPassword, signOut
features/household/
  api.ts            createHousehold(name), joinHouseholdByCode(code), getMyHousehold(), getMembers()
  inviteCode.ts     formatInviteCode() / normalizeInviteCode()  ← pure, unit-tested
```

`status: 'loading' | 'unauthenticated' | 'needs-household' | 'ready'` is the single
source of routing truth. Screens and the root layout read `status`; nothing else makes
routing decisions. All Supabase auth calls live in `features/auth/api.ts`; all household
DB access in `features/household/api.ts`. Screens never import `supabase` directly.

### Why a service boundary

Consistent with the project rule that external integrations are isolated (see
`services/gemini.ts`, `services/dsk-import.ts`). Auth/household access modules can move
behind a server later in one place.

## Database — Migration #4 (`auth_household_rpcs`)

Under the current RLS model a non-member **cannot** read a household by its code
(SELECT requires `private.is_household_member(id)`), and a two-step client insert of
household-then-membership can orphan a household the user can't read back. Both join and
create therefore go through `SECURITY DEFINER` RPCs.

- **`private.gen_invite_code()`** → 8 chars from the unambiguous alphabet. Set as the
  `households.invite_code` column default (replaces the old `md5` default).
- **`household_members.display_name` (text)** — lets the members list render names
  without exposing `auth.users`. Populated at create/join time.
- **`public.create_household(p_name text, p_display_name text)`** `SECURITY DEFINER`:
  inserts the household + the creator's membership atomically; returns `(id, invite_code)`.
  The existing seed-categories trigger still fires.
- **`public.join_household_by_code(p_code text, p_display_name text)`** `SECURITY DEFINER`:
  normalizes the code, finds the household (bypassing RLS), inserts membership for
  `auth.uid()` (`on conflict do nothing`), returns `household_id`; raises if the code is
  invalid. `EXECUTE` granted to `authenticated` only.

Both functions live in schemas consistent with the hardening done in earlier migrations
(helper logic in `private`; the two RPCs are intentionally in `public` because the client
must call them, and they are scoped to `auth.uid()` internally).

## Data flow

- **Boot** — `useAuthBootstrap`: `getSession()`; if a session exists, query the user's
  `household_members` row → set `householdId` + `displayName` → `status = ready` or
  `needs-household`. `onAuthStateChange` keeps the store live. Root layout `<Redirect>`s
  on `status`:
  - `loading` → splash / null
  - `unauthenticated` → `(auth)/sign-in`
  - `needs-household` → `(auth)/household-setup`
  - `ready` → `(app)`
- **Sign-up** — name + email + password → `signUpWithPassword` (name into `user_metadata`)
  → session returned immediately → `needs-household` → household-setup.
- **Sign-in** — email + password → `signInWithPassword` → bootstrap resolves household →
  `ready` or `needs-household`.
- **Create household** — name → `create_household` RPC → store gets `householdId` → the
  create tab reveals the **real** invite code with share actions → "Към таблото" → `(app)`.
- **Join** — code → `normalizeInviteCode` → `join_household_by_code` RPC → `householdId`
  set → `(app)`. Invalid code → inline error.
- **Skip for now** — `create_household` with an auto name („Моето домакинство") → straight
  to `(app)`. A household always exists (per build plan).
- **Sign-out** (profile) — `signOut` → store clears → `unauthenticated` → sign-in.

## Screen wiring (existing files)

- `app/(auth)/sign-in.tsx`, `sign-up.tsx` — replace `router.replace` stubs with real auth
  calls; add loading + error states; Google button stays visible but inert.
- `features/household/HouseholdSetupView.tsx` — wire create / join / skip; two-phase create
  tab (form → real code reveal → continue); validation (name required to create, code
  required to join). Remove `DEMO_CODE`.
- `app/(app)/profile.tsx` — real user (name/email from session + membership), real members
  from `getMembers()`, working sign-out, invite-member surfaces the real code. Remove the
  hard-coded `MEMBERS` array.
- `app/_layout.tsx` — mount `useAuthBootstrap` + the redirect guard; hold the splash until
  `status !== 'loading'`.

## Error handling

Every auth/RPC call is wrapped; failures surface as inline Bulgarian messages
(„Невалиден код", „Грешен имейл или парола", and a generic „Нещо се обърка, опитай пак"
for network/unknown). Never crash. RPCs are atomic, so no orphaned households.

## Testing

- `features/household/inviteCode.test.ts` — format/normalize round-trips, ambiguous-char
  exclusion, dash handling (pure unit tests).
- Auth + RPC flow is integration-level; verified manually against the live project per the
  build-plan checkpoint: sign up → create household → dashboard; sign out → sign in →
  dashboard. No brittle mocked-Supabase unit tests.

## Out of scope / follow-ups

- **Google OAuth (deferred).** The Day 4 plan lists Google OAuth (Supabase provider +
  Google Cloud Console OAuth client + `expo-auth-session` deep-linking). Deferred to its
  own follow-up slice after email/password + household are working end-to-end. The Google
  button remains in the UI, inert, until then.
- **Email confirmation** re-enable + "check your email" pending state + deep-link handler —
  only if Teftera goes public.
- **Edit-profile / manage-categories / forgot-password** — not part of Day 4.

## Done criteria

`npx tsc --noEmit` clean, `npm test` green (incl. new inviteCode tests), and the manual
checkpoint passes: a fresh sign-up creates a household and lands on the dashboard; signing
out and back in returns to the dashboard; a second account can join via the invite code and
see the same household; profile shows real name, email, and both members.
