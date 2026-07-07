# Day 18 — Final Polish & Portfolio Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demo-clean app and hiring-manager-ready repo: error boundaries, offline banner, branded icon/splash, Day 11.5 polish fixes, empty-state polish, full README + portfolio write-up, repo hygiene.

**Architecture:** Pure client-side polish — no schema or Edge Function changes. New shared components (`ScreenErrorFallback`, `OfflineBanner`) + a pure network-state helper follow the existing colocated-test pattern (`lib/*.test.ts`). Icons are generated reproducibly by a committed `sharp` script from `assets/logo.png`.

**Tech Stack:** Expo SDK 56 / expo-router, NativeWind, jest-expo (colocated `*.test.ts`, pure functions only), `expo-network` (new, free), `sharp` (new devDependency, free).

**Spec:** `docs/superpowers/specs/2026-07-07-day18-final-polish-portfolio-design.md`

## Global Constraints

- TypeScript strict; no `any`; no plain `.js` app code (the icon script is a build-time `.mjs`, exempt like other tooling).
- Money = integer cents; display via `formatCurrency`; EUR (€) only in UI.
- All UI copy in Bulgarian; design tokens from `tailwind.config.js` (colors/typography per CLAUDE.md).
- Pill buttons `rounded-full`; action rows via `FloatingActionBar` / `SheetActions` only.
- Free tiers only — `expo-network` and `sharp` are both free; no other new dependencies.
- Conventional commits.
- After every task: `npx tsc --noEmit` and `npm test` must pass before committing.
- **Spec deviation (approved rationale):** PDF export stays ENABLED offline — `expo-print` renders locally from already-loaded data and the share sheet needs no network. The spec's disable list assumed it was remote.

---

### Task 1: Repo hygiene

**Files:**
- Modify: `.gitignore`
- Delete (untracked, never committed): `problems/`, `services/user.ts`, `assets/1781690652688 - Copy.png`
- Leave alone: `assets/20260625_130254.jpg`, `assets/BG67STSA93000025529284 - *.csv`, `assets/illustrator files/` (become ignored)

**Interfaces:**
- Consumes: nothing.
- Produces: a clean `git status` so later tasks' diffs are readable.

- [ ] **Step 1: Append personal-data ignores to `.gitignore`**

Append at the end of `.gitignore`:

```gitignore
# personal data — bank statements (IBAN in filename), photos, design sources
assets/*.csv
assets/*.jpg
assets/illustrator files/
```

- [ ] **Step 2: Delete skills-exercise fixtures and the stray logo copy**

These are untracked leftovers from the skills-TDD work (commit `a77051e`); `services/user.ts` imports a `lib/http` module that does not exist in this app.

```bash
rm -rf problems "services/user.ts" "assets/1781690652688 - Copy.png"
```

- [ ] **Step 3: Verify clean status and green checks**

Run: `git status --porcelain` — expected: only `.gitignore` modified (plus the pre-existing `.mcp.json` / `.claude/settings.json` changes, which are NOT part of this plan — leave them unstaged). Run: `npx tsc --noEmit && npm test` — expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: gitignore personal data assets, drop skills-exercise fixtures"
```

---

### Task 2: Auto-decimal amount inputs (manual entry + confirm receipt)

**Files:**
- Modify: `components/AmountInput.test.ts` (add characterization tests)
- Modify: `app/manual-entry.tsx:80,211-219`
- Modify: `app/confirm-receipt.tsx:74-77,235-242,293-302`

**Interfaces:**
- Consumes: `formatDigitsAsAmount(digits: string): string` from `components/AmountInput.tsx` (already exported; treats input as a digit stream: `"1234"` → `"12,34"`). `parseAmountToCents` already accepts the `"12,34"` output (it's what `centsToInput` produces for edit seeds).
- Produces: nothing new — screens keep their `string` amount state and the `parseManualEntry` Zod flow untouched. This is an input-UX layer only.

- [ ] **Step 1: Add live-formatter characterization tests**

Append to the existing `describe` block's file `components/AmountInput.test.ts`:

```ts
// The screens pipe raw TextInput text through formatDigitsAsAmount on every
// keystroke; these pin the live-typing contract (digits shift through cents).
describe('formatDigitsAsAmount as a live text formatter', () => {
  it('is idempotent on its own output: "12,34" -> "12,34"', () => {
    expect(formatDigitsAsAmount('12,34')).toBe('12,34');
  });
  it('normalizes dot input: "12.34" -> "12,34"', () => {
    expect(formatDigitsAsAmount('12.34')).toBe('12,34');
  });
  it('appending a digit shifts cents left: "12,345" -> "123,45"', () => {
    expect(formatDigitsAsAmount('12,345')).toBe('123,45');
  });
  it('backspacing the last digit shifts right: "12,3" -> "1,23"', () => {
    expect(formatDigitsAsAmount('12,3')).toBe('1,23');
  });
});
```

- [ ] **Step 2: Run the tests**

Run: `npm test -- AmountInput`
Expected: PASS (the existing pure function already satisfies the contract — these are pinning tests, not red-first TDD; the behavior change lives in the screens).

- [ ] **Step 3: Wire manual-entry**

In `app/manual-entry.tsx`:

Add to imports:
```ts
import { formatDigitsAsAmount } from '@/components/AmountInput';
```

Line 80 — normalize the edit seed (it arrives as `"12,34"` from `centsToInput`, already idempotent):
```ts
const [amount, setAmount] = useState(seed?.amount ? formatDigitsAsAmount(seed.amount) : '');
```

Lines 211–219 — the hero amount `TextInput`: change `onChangeText` and `keyboardType`:
```tsx
<TextInput
  value={amount}
  onChangeText={(t) => setAmount(formatDigitsAsAmount(t))}
  placeholder="0,00"
  placeholderTextColor="rgba(196,198,208,0.3)"
  keyboardType="number-pad"
  autoFocus={!isEdit}
  className="min-w-[120px] text-center font-jakarta-semibold text-[64px] text-on-surface"
/>
```

- [ ] **Step 4: Wire confirm-receipt (total + line items)**

In `app/confirm-receipt.tsx`:

Add to imports:
```ts
import { formatDigitsAsAmount } from '@/components/AmountInput';
```

Lines 74–77 — normalize Gemini seeds (extraction may emit `"12.34"`):
```ts
setMerchant(seed.merchant);
setTotal(formatDigitsAsAmount(seed.total));
setDate(seed.date);
setItems(seed.items.map((i) => ({ ...i, amount: formatDigitsAsAmount(i.amount) })));
```

Lines 235–242 — total input:
```tsx
<TextInput
  value={total}
  onChangeText={(t) => setTotal(formatDigitsAsAmount(t))}
  placeholder="0,00"
  placeholderTextColor="rgba(142,144,154,0.5)"
  keyboardType="number-pad"
  className="flex-1 font-jakarta-semibold text-headline-xl text-on-surface"
/>
```

Lines 293–302 — item amount input: keep the `setItems` mapper but format the text, and switch keyboard:
```tsx
<TextInput
  value={item.amount}
  onChangeText={(t) =>
    setItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, amount: formatDigitsAsAmount(t) } : i)),
    )
  }
  keyboardType="number-pad"
  className="w-16 text-right font-inter-semibold text-data-mono text-on-surface"
/>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/AmountInput.test.ts app/manual-entry.tsx app/confirm-receipt.tsx
git commit -m "feat(entry): cents-based auto-decimal typing in manual entry and confirm receipt"
```

---

### Task 3: Auth screens — real logo, drop the dead Google button

**Files:**
- Modify: `app/(auth)/sign-in.tsx:3-7,28-32,63-86`
- Modify: `app/(auth)/sign-up.tsx:6,67-75`
- Delete: `components/GoogleGlyph.tsx`, `assets/1781690652688.png`
- Add to git: `assets/logo.png` (currently untracked; white anthemion, transparent, 2146×1808)

**Interfaces:**
- Consumes: `assets/logo.png`.
- Produces: nothing consumed later (Task 7's icon script also reads `assets/logo.png`, committed here).

- [ ] **Step 1: Swap the sign-in logo**

In `app/(auth)/sign-in.tsx` line 29, replace the opaque cream-background render with the transparent logo:

```tsx
<Image
  source={require('../../assets/logo.png')}
  style={{ width: 140, height: 118 }}
  contentFit="contain"
/>
```

(118 ≈ 140 × 1808/2146 keeps the anthemion's aspect ratio instead of forcing a square.)

- [ ] **Step 2: Remove the Google control from sign-in**

Delete the import `import { GoogleGlyph } from '@/components/GoogleGlyph';` and the middle `Pressable` (lines 70–75, the disabled `mx-1 h-12 w-12 …` circle with `accessibilityLabel="Вход с Google"`). The bottom segmented pill keeps exactly two children: Регистрация and Вход.

- [ ] **Step 3: Remove the Google control from sign-up**

In `app/(auth)/sign-up.tsx` delete the import `import { GoogleGlyph } from '@/components/GoogleGlyph';` and the disabled `Pressable` block (lines 69–74, "Продължи с Google"). The `<View className="gap-md">` wrapper now holds only the `PillButton` — collapse it: replace the wrapper + button with just

```tsx
<PillButton label="Регистрация" onPress={onRegister} loading={loading} block />
```

- [ ] **Step 4: Delete the dead files and verify no references remain**

```bash
rm components/GoogleGlyph.tsx assets/1781690652688.png
```

Run: `grep -rn "GoogleGlyph\|1781690652688" app components features lib services` — expected: no matches.
Run: `npx tsc --noEmit && npm test` — expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/(auth)/sign-in.tsx app/(auth)/sign-up.tsx assets/logo.png
git rm --cached components/GoogleGlyph.tsx assets/1781690652688.png 2>/dev/null; git add -A components assets/1781690652688.png
git commit -m "fix(auth): transparent logo on sign-in, remove dead Google sign-in control"
```

(If the `git rm` incantation fights back, `git add -A app components assets` after the deletions achieves the same staging.)

---

### Task 4: Error boundaries on every route

**Files:**
- Create: `components/ScreenErrorFallback.tsx`
- Modify (one added export line each): `app/_layout.tsx`, `app/(app)/_layout.tsx`, `app/(auth)/_layout.tsx`, `app/scanner.tsx`, `app/confirm-receipt.tsx`, `app/manual-entry.tsx`, `app/import-dsk.tsx`, `app/transaction/[id].tsx`, `app/budgets.tsx`

**Interfaces:**
- Consumes: expo-router's route-level error boundary contract — a route file exporting `ErrorBoundary(props: ErrorBoundaryProps)` where `ErrorBoundaryProps = { error: Error; retry: () => Promise<void> }` (type exported by `expo-router`).
- Produces: `ScreenErrorFallback` component (same props), re-exported as `ErrorBoundary` from each route.

- [ ] **Step 1: Create the shared fallback**

`components/ScreenErrorFallback.tsx`:

```tsx
import { MaterialIcons } from '@expo/vector-icons';
import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';

/**
 * Route-level error fallback (expo-router ErrorBoundary contract). Exported as
 * `ErrorBoundary` from layouts and standalone screens so a render crash keeps
 * the rest of the navigation tree alive.
 */
export function ScreenErrorFallback({ error, retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1 items-center justify-center px-8" edges={['top', 'bottom']}>
        <View className="mb-md h-16 w-16 items-center justify-center rounded-full bg-surface-container">
          <MaterialIcons name="error-outline" size={28} color="#ffb4ab" />
        </View>
        <Text className="text-center font-jakarta-semibold text-headline-md text-on-surface">
          Нещо се обърка
        </Text>
        {__DEV__ ? (
          <Text className="mt-2 text-center font-inter text-body-md text-error">
            {error.message}
          </Text>
        ) : null}
        <Pressable
          onPress={() => retry()}
          className="mt-lg rounded-full bg-primary-container px-6 py-3 active:opacity-90">
          <Text className="font-inter-semibold text-label-md uppercase text-on-primary">
            Опитай отново
          </Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}
```

- [ ] **Step 2: Export it from every route listed above**

Add this single line near the top (after imports) of each of the nine files:

```ts
export { ScreenErrorFallback as ErrorBoundary } from '@/components/ScreenErrorFallback';
```

- [ ] **Step 3: Verify with a deliberate crash**

Run: `npx tsc --noEmit && npm run lint` — expected: PASS.
Then temporarily add `throw new Error('boom');` at the top of the `HistoryScreen` component body, run `npx expo start`, open History: expected — the fallback renders (icon, "Нещо се обърка", message, "Опитай отново"), tabs still switch. Remove the throw. (If no device/emulator is available in this session, note it for the human walkthrough instead — the `tsc` gate still holds.)

- [ ] **Step 4: Commit**

```bash
git add components/ScreenErrorFallback.tsx app
git commit -m "feat: route-level error boundaries with shared fallback screen"
```

---

### Task 5: Offline detection, banner, disabled network actions

**Files:**
- Create: `lib/networkState.ts`, `lib/networkState.test.ts`, `lib/useIsOnline.ts`, `components/OfflineBanner.tsx`
- Modify: `package.json` (expo-network), `app/_layout.tsx:50-74`, `app/(app)/index.tsx:191-207`, `app/manual-entry.tsx:262-273`, `app/confirm-receipt.tsx:334-343`, `app/import-dsk.tsx:276-287,323-341`

**Interfaces:**
- Consumes: `useNetworkState()` from `expo-network` (returns `{ isConnected?: boolean | null; isInternetReachable?: boolean | null; … }`, live-updating hook).
- Produces:
  - `deriveIsOnline(state: NetworkStateLike): boolean` (pure, `lib/networkState.ts`)
  - `useIsOnline(): boolean` (`lib/useIsOnline.ts`) — used by every disable site
  - `OfflineBanner` — rendered once in the root layout

- [ ] **Step 1: Install expo-network**

Run: `npx expo install expo-network`
Expected: adds `"expo-network": "~8.x"` (SDK-56-matched version) to dependencies.

- [ ] **Step 2: Write the failing test**

`lib/networkState.test.ts`:

```ts
import { deriveIsOnline } from './networkState';

describe('deriveIsOnline', () => {
  it('is optimistic while state is unknown (startup)', () => {
    expect(deriveIsOnline({})).toBe(true);
    expect(deriveIsOnline({ isConnected: undefined, isInternetReachable: undefined })).toBe(true);
  });
  it('offline when the OS reports no connection', () => {
    expect(deriveIsOnline({ isConnected: false, isInternetReachable: null })).toBe(false);
  });
  it('offline when connected but internet is unreachable (captive wifi)', () => {
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: false })).toBe(false);
  });
  it('online when connected and reachability is unknown-or-good', () => {
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: null })).toBe(true);
    expect(deriveIsOnline({ isConnected: true, isInternetReachable: true })).toBe(true);
  });
});
```

- [ ] **Step 3: Run it — expect failure**

Run: `npm test -- networkState`
Expected: FAIL — `Cannot find module './networkState'`.

- [ ] **Step 4: Implement**

`lib/networkState.ts`:

```ts
export interface NetworkStateLike {
  isConnected?: boolean | null;
  isInternetReachable?: boolean | null;
}

/**
 * Offline only on positive evidence — unknown state (app startup, simulator
 * quirks) must not flash the banner or disable actions.
 */
export function deriveIsOnline(state: NetworkStateLike): boolean {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}
```

`lib/useIsOnline.ts` (separate file so the pure test never imports `expo-network`):

```ts
import { useNetworkState } from 'expo-network';
import { deriveIsOnline } from './networkState';

/** Live connectivity flag; true unless the device is positively offline. */
export function useIsOnline(): boolean {
  return deriveIsOnline(useNetworkState());
}
```

- [ ] **Step 5: Run tests — expect pass**

Run: `npm test -- networkState`
Expected: PASS (4 tests).

- [ ] **Step 6: Banner component + root-layout mount**

`components/OfflineBanner.tsx`:

```tsx
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '@/lib/useIsOnline';

/** Slim top overlay shown while the device has no usable connection. */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: 0, paddingTop: insets.top }}
      className="items-center bg-error-container pb-1">
      <Text className="pt-1 font-inter-medium text-label-md uppercase text-error">
        Няма връзка с интернет
      </Text>
    </View>
  );
}
```

In `app/_layout.tsx`: add `import { OfflineBanner } from '@/components/OfflineBanner';` and render `<OfflineBanner />` as the last child of `GestureHandlerRootView`, directly after `</Stack>`.

- [ ] **Step 7: Disable network-dependent actions**

Each file gets `import { useIsOnline } from '@/lib/useIsOnline';` and `const online = useIsOnline();` at the top of the component.

`app/(app)/index.tsx` (Сканирай uploads to Storage before extraction):
```ts
{
  label: 'Сканирай',
  icon: 'photo-camera',
  variant: 'filled',
  disabled: !online,
  onPress: () => router.navigate('/scanner'),
},
```

`app/manual-entry.tsx` FloatingActionBar save action: add `disabled: !online,` alongside `loading: saving`.

`app/confirm-receipt.tsx` Запази `PillButton`: add `disabled={!online}`.

`app/import-dsk.tsx`:
- Initial-state bar: `Синхронизирай с ДСК` action gets `disabled: !online,`. The `Избери CSV файл` action stays enabled (file pick + parse are local; the network gate is the import button).
- Preview bar: `Синхронизирай пак`/`Друг файл` action → `disabled: status === 'importing' || (source === 'bank' && !online),`; the `Импортирай N` action → `disabled: nothing || status === 'syncing' || !online,`.

PDF export on Insights: **left enabled** (see Global Constraints deviation note).

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: PASS. On-device airplane-mode check happens in the Task 10 walkthrough.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json lib/networkState.ts lib/networkState.test.ts lib/useIsOnline.ts components/OfflineBanner.tsx app
git commit -m "feat: offline banner and disabled network actions via expo-network"
```

---

### Task 6: Empty-state polish

**Files:**
- Modify: `components/EmptyState.tsx`, `app/(app)/index.tsx:167`, `app/(app)/history.tsx:60-65`, `app/(app)/insights.tsx:237-241`

**Interfaces:**
- Consumes: existing `EmptyState` props `{ icon, title, message?, cta? }` — API unchanged.
- Produces: same component, upgraded visuals; three updated call sites. (`app/import-dsk.tsx:299` keeps its current copy — it's an action hub, not an empty list.)

- [ ] **Step 1: Upgrade the component visuals**

Replace the icon block in `components/EmptyState.tsx` (lines 15–18) with a glow-ringed, larger treatment; body and CTA stay as-is:

```tsx
<View className="items-center px-8 py-xxl">
  <View className="mb-md h-28 w-28 items-center justify-center rounded-full bg-primary-container/5">
    <View className="h-20 w-20 items-center justify-center rounded-full bg-surface-container">
      <MaterialIcons name={icon} size={32} color="#8e909a" />
    </View>
  </View>
  …existing title / message / cta unchanged…
</View>
```

- [ ] **Step 2: Dashboard call site**

`app/(app)/index.tsx` line 167:

```tsx
<EmptyState
  icon="receipt-long"
  title="Все още няма транзакции"
  message="Последните движения на домакинството ще се показват тук."
  cta={{ label: 'Добави транзакция', onPress: () => router.navigate('/manual-entry') }}
/>
```

- [ ] **Step 3: History call site**

`app/(app)/history.tsx` lines 60–65:

```tsx
<EmptyState
  icon="receipt-long"
  title="Все още няма транзакции"
  message="Добави първата ръчно, сканирай бележка или импортирай извлечение от ДСК."
  cta={{ label: 'Добави транзакция', onPress: () => router.navigate('/manual-entry') }}
/>
```

- [ ] **Step 4: Insights call site (no CTA — it fills as data arrives)**

`app/(app)/insights.tsx` lines 237–241:

```tsx
<EmptyState
  icon="insights"
  title="Няма данни за анализ"
  message="Разбивките, тенденциите и AI обобщението се попълват с всяка добавена транзакция."
/>
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsc --noEmit && npm test` — expected: PASS.

```bash
git add components/EmptyState.tsx "app/(app)/index.tsx" "app/(app)/history.tsx" "app/(app)/insights.tsx"
git commit -m "feat(ui): glow-ringed empty states with per-screen copy and CTAs"
```

---

### Task 7: App icon & splash from the anthemion logo

**Files:**
- Create: `scripts/generate-app-icons.mjs`
- Modify: `package.json` (sharp devDependency), `app.json` (version bump)
- Regenerate: `assets/images/icon.png`, `assets/images/android-icon-foreground.png`, `assets/images/android-icon-monochrome.png`, `assets/images/splash-icon.png`, `assets/images/favicon.png`
- Delete: unreferenced Expo-template assets (verified by grep first)

**Interfaces:**
- Consumes: `assets/logo.png` (committed in Task 3).
- Produces: branded PNGs at the paths `app.json` already references — no config path changes needed.

- [ ] **Step 1: Install sharp**

Run: `npm install --save-dev sharp`

- [ ] **Step 2: Write the generator script**

`scripts/generate-app-icons.mjs`:

```js
// Regenerates all app icons from the master logo. Run on demand:
//   node scripts/generate-app-icons.mjs
import sharp from 'sharp';

const BG = '#121316';
const SRC = 'assets/logo.png'; // white anthemion, transparent, 2146x1808

async function compose(size, logoWidthRatio, background, out) {
  const logo = await sharp(SRC)
    .resize({ width: Math.round(size * logoWidthRatio) })
    .toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out);
  console.log('wrote', out);
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

await compose(1024, 0.62, BG, 'assets/images/icon.png');
// Android adaptive safe zone is the middle 66% — keep the mark inside it.
await compose(1024, 0.55, transparent, 'assets/images/android-icon-foreground.png');
await compose(1024, 0.55, transparent, 'assets/images/android-icon-monochrome.png');
await compose(1024, 0.8, transparent, 'assets/images/splash-icon.png');
await compose(48, 0.75, BG, 'assets/images/favicon.png');
```

- [ ] **Step 3: Run it and eyeball the output**

Run: `node scripts/generate-app-icons.mjs`
Expected: five `wrote assets/images/…` lines. Open `assets/images/icon.png` (Read tool renders images) — white anthemion centered on near-black, no clipping.

- [ ] **Step 4: Delete unreferenced template assets — grep first**

Run: `grep -rn "react-logo\|expo-badge\|expo-logo\|tutorial-web\|logo-glow\|android-icon-background" app components features lib services app.json`
For every name with **zero** matches, delete the file(s) from `assets/images/`; keep any that match. Also delete the template icon-composer bundle: `rm -rf assets/expo.icon`.

- [ ] **Step 5: Bump the version for the rebrand build**

In `app.json`: `"version": "1.0.0"` → `"version": "1.0.1"`.

- [ ] **Step 6: Verify and commit**

Run: `npx tsc --noEmit && npm test` — expected: PASS (assets don't affect either, this is the routine gate).

```bash
git add scripts/generate-app-icons.mjs package.json package-lock.json app.json assets/images
git rm -r --cached assets/expo.icon 2>/dev/null || true
git add -A assets
git commit -m "feat(branding): anthemion app icon, splash and favicon via sharp generator"
```

---

### Task 8: README rewrite

**Files:**
- Rewrite: `README.md`
- Create: `assets/screenshots/.gitkeep` (screenshot drop-zone for the human)

**Interfaces:**
- Consumes: facts from `teftera-build-plan.md`, `CLAUDE.md`, `supabase/migrations/`, `.env.example` if present (verify env var names against `services/supabase.ts` and `services/gemini.ts` — do not guess).
- Produces: the public face of the repo. Screenshot files land later (human step, Task 10).

- [ ] **Step 1: Verify env var names**

Run: `grep -rn "EXPO_PUBLIC_" services lib app features | grep -o "EXPO_PUBLIC_[A-Z_]*" | sort -u`
Use exactly these names in the env table.

- [ ] **Step 2: Write the README**

Structure (write real prose, Bulgarian product copy stays Bulgarian in screenshots but the README is English — it targets hiring managers):

1. **Hero** — logo (`assets/logo.png`), name, one-liner: *AI-powered shared-household expense tracker: receipt OCR, live bank sync, anomaly detection. Zero running cost.* Built with React Native + Expo + Supabase + Gemini.
2. **Screenshots** — 2×4 grid of `assets/screenshots/*.png` (dashboard, history, insights, receipt scan, confirm, manual entry, budgets, bank sync) with an HTML `<table>` of `<img width="200">`; files added by the owner.
3. **Features** — bullets with one line each: shared real-time household ledger (Supabase Realtime); receipt scanning → Gemini structured extraction with manual-edit fallback; DSK Bank CSV import ETL (BGN→EUR at the fixed 1.95583 rate, dedup, auto-categorization); live PSD2 bank sync via Enable Banking through Supabase Edge Functions; Z-score anomaly flagging; AI monthly summary; budget goals with local alerts; dark-only design system from Stitch mockups; PDF monthly report export.
4. **Architecture** — Mermaid diagram:
   ```mermaid
   graph TD
     A[Expo RN app] -->|Auth / RLS / Realtime| B[(Supabase Postgres)]
     A -->|receipt images| C[Supabase Storage]
     A -->|extraction + summaries| D[Gemini 2.5 Flash]
     A --> E[Edge Functions bank-sync-*]
     E -->|signed JWT| F[Enable Banking → DSK]
   ```
   Plus the `/app /features /services /lib /supabase` folder map from CLAUDE.md with one-line descriptions.
5. **Money handling** — integer euro-cents everywhere, `formatCurrency` single formatter, `original_amount`/`original_currency` retained on imports.
6. **Environment variables** — table from Step 1 + Edge Function secrets by name only (`EB_APP_ID`, `EB_PRIVATE_KEY` (base64), `EB_ASPSP_NAME`, `EB_ASPSP_COUNTRY`, `BANK_SYNC_STATE_SECRET` — verify names via `npx supabase secrets list` comments in `supabase/functions/` source, not by guessing).
7. **Getting started** — `npm install`; create `.env` (list vars); `npx supabase db push`; `npx expo start`; EAS preview build commands.
8. **Testing** — `npm test` (jest-expo, colocated `*.test.ts`, pure-function units: currency, ETL, Z-score, report data, network state).
9. **Portfolio notes** — link to `docs/portfolio-writeup.md`.

- [ ] **Step 3: Verify rendering and commit**

Run: `npx tsc --noEmit` (unchanged code — routine gate). Preview the Markdown (Read it once looking for broken tables/fences).

```bash
mkdir -p assets/screenshots && touch assets/screenshots/.gitkeep
git add README.md assets/screenshots/.gitkeep
git commit -m "docs: full README — architecture, features, env vars, setup, screenshot grid"
```

---

### Task 9: Portfolio write-up

**Files:**
- Create: `docs/portfolio-writeup.md`

**Interfaces:**
- Consumes: README facts (Task 8); build-plan history for the narrative.
- Produces: standalone document the owner adapts for LinkedIn/CV.

- [ ] **Step 1: Write the document**

~600–900 words, English, first person, structured as:

- **What it is** — two-person household finance app, personal daily-driver + portfolio piece; the Bulgarian EUR transition (Jan 2026) as the hook for the currency layer.
- **Five technical highlights**, each: problem → decision → outcome:
  1. *Receipt OCR pipeline* — camera → Supabase Storage → Gemini structured JSON with Zod-validated fallback to manual edit; graceful degradation as a hard rule (never crash on a bad model response).
  2. *Live PSD2 bank sync* — Enable Banking OAuth consent with signed-state handoff, JWT-signed requests from Supabase Edge Functions (first server-side code in the project; private key never in the client bundle); sandbox-verified, production behind a secrets swap.
  3. *ETL + dedup* — DSK CSV import and the bank API feed normalize into one pipeline; fixed-rate BGN→EUR with original amounts retained; idempotent re-imports.
  4. *Anomaly detection* — per-category Z-score over household history, flagging after every save, lime accent surfacing in UI; deliberately simple and explainable over an ML model.
  5. *Integer-cents money model* — no float arithmetic anywhere, single formatter, RLS on every table with household scoping.
- **Architecture & cost** — managed Expo + Supabase free tier + Gemini free tier = €0/month running cost; seams left for a Cloud Run FastAPI service (AI + anomaly server-side).
- **Process** — spec → plan → TDD on pure functions → small conventional commits; every feature has a written design doc in-repo.

- [ ] **Step 2: Commit**

```bash
git add docs/portfolio-writeup.md
git commit -m "docs: portfolio write-up for hiring-manager framing"
```

---

### Task 10: Build-plan bookkeeping + human runbook

**Files:**
- Modify: `teftera-build-plan.md` (Day 18 + Day 11.5 checkboxes)

**Interfaces:**
- Consumes: everything above being merged/committed.
- Produces: accurate build-plan state; explicit list of the human-only steps.

- [ ] **Step 1: Update checkboxes**

In `teftera-build-plan.md`:
- Day 18: check off error boundaries, offline state, empty states, app icon, splash, README (leave "EAS preview build — install on both phones" and "Portfolio write-up" — check write-up too, it exists — so only the EAS/device line stays open, plus add "(screenshots pending)" to the README line).
- Day 11.5 "Polish fixes found in the internal build": check all three (logo, Google control, auto-decimal).

- [ ] **Step 2: Commit**

```bash
git add teftera-build-plan.md
git commit -m "docs(day18): check off automated Day 18 items"
```

- [ ] **Step 3: Human runbook (not executable by the agent — hand to the owner)**

1. **Screenshots**: on the Android phone, capture dashboard / history / insights / scanner / confirm / manual entry / budgets / import screens → drop into `assets/screenshots/` with the names referenced by the README grid → commit.
2. **Android build**: `eas build --platform android --profile preview` → install from the QR link; verify new icon + splash.
3. **iOS build**: `eas build --platform ios --profile preview` (interactive Apple ID login + 2FA) → sideload via AltStore Classic + AltServer per Day 11.5 notes.
4. **Demo walkthrough** (the Day 18 checkpoint): sign in → dashboard → add manual entry (watch auto-decimal typing) → scan a receipt → history → insights (pull-to-refresh AI summary) → budgets (this doubles as the pending Day 15 80% notification check) → import screen → airplane mode: banner appears, save/sync buttons disable → error-free run end to end.
5. When done, check the last Day 18 boxes in `teftera-build-plan.md`.

---

## Execution order

Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10. Tasks 2/3/4 are independent of each other (any order); 5 touches files 2 and 3 also touch, so keep the sequence to avoid conflicts. 7 needs 3 (committed `logo.png`). 8–9 need nothing but are last so they document the finished state.
