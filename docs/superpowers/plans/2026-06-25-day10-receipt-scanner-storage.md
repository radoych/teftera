# Day 10 — Receipt Scanner Auto-Capture + Storage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stubbed receipt scanner with an on-device auto-capture document scanner that uploads the captured receipt to a private Supabase Storage bucket and opens the confirm screen showing the image.

**Architecture:** Swap `expo-camera` for the ML Kit document scanner (`react-native-document-scanner-plugin`) running on an `expo-dev-client` build. A new `features/receipts` module owns Storage uploads. The scanner screen becomes a thin launcher around the native scanner; the confirm screen renders the captured thumbnail. Gemini extraction and DB writes are Day 11.

**Tech Stack:** Expo (managed) + dev client, React Native, TypeScript (strict), Supabase Storage, `react-native-document-scanner-plugin`, `expo-image-manipulator`, `expo-file-system` (new `File` API), `expo-crypto`, Jest.

**Spec:** `docs/superpowers/specs/2026-06-25-day10-receipt-scanner-storage-design.md`

## Global Constraints

- **TypeScript strict; no `any`; no plain `.js` files.**
- **`household_id` on every storage object + RLS on the new bucket.** Object key layout `{household_id}/{uuid}.jpg`; bucket is **private**.
- **Storage/schema changes go through a migration file**, applied via the Supabase MCP `apply_migration` (it stamps its own version — rename the local file to match the stamped version).
- **RLS helper lives in `private` schema** (`private.is_household_member(uuid)`); the Storage policy uses the household-membership subquery form from the spec (no cast on untrusted path text).
- **No secrets in git.** New deps must be free / on-device.
- **UI copy is Bulgarian**, matching existing screens.
- **Conventional commits** (`feat:`, `chore:`, `docs:`).
- **Divergence from spec (intentional):** read upload bytes via `new File(uri).bytes()` (new `expo-file-system` API already used in `app/import-dsk.tsx`) instead of `base64-arraybuffer`. This drops the `base64-arraybuffer` dependency. `expo-crypto.randomUUID()` generates the object-key uuid.

---

### Task 1: Dependencies, native config, remove expo-camera

**Files:**
- Modify: `package.json` (deps via installers)
- Modify: `app.json:31-55` (add doc-scanner plugin + iOS camera permission)

**Interfaces:**
- Consumes: nothing.
- Produces: `react-native-document-scanner-plugin`, `expo-image-manipulator`, `expo-crypto`, `expo-dev-client` installed and configured. (`expo-camera` removal is deferred to Task 4, after `scanner.tsx` stops importing it, so every task stays green.) Later tasks import these.

- [ ] **Step 1: Install new dependencies**

Run:
```bash
npx expo install expo-dev-client react-native-document-scanner-plugin expo-image-manipulator expo-crypto
```
Expected: installs succeed; the four packages appear in `package.json` dependencies.

- [ ] **Step 2: Add the document-scanner plugin to `app.json`**

In `app.json`, **add** the document-scanner plugin to the `plugins` array (e.g. after the `expo-image-picker` entry). Leave the existing `expo-camera` plugin block in place for now — it is removed in Task 4:
```json
      [
        "react-native-document-scanner-plugin",
        {
          "cameraPermission": "Teftera използва камерата за сканиране на бележки."
        }
      ]
```
(The plugin's config plugin wires the iOS `NSCameraUsageDescription` from `cameraPermission`. Android's ML Kit document scanner runs in Google Play Services and needs no declared `CAMERA` permission.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (`scanner.tsx` still imports `expo-camera`, which remains installed — nothing is broken yet.)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.json
git commit -m "chore(day10): add doc-scanner + dev-client deps"
```

- [ ] **Step 5: MANUAL — build & install the dev client (human, on-device)**

This is a human step; the agent cannot build on a device. Run once now and again only when native deps change:
```bash
eas build --profile development --platform android   # and/or --platform ios
```
Install the resulting build on the phone. Afterwards `npx expo start` → scan QR opens the custom dev client. Day 10's on-device checkpoint requires this build.

---

### Task 2: Private receipts Storage bucket + RLS migration

**Files:**
- Create: `supabase/migrations/<stamped-version>_receipts_storage_bucket.sql`

**Interfaces:**
- Consumes: existing `public.household_members(household_id, user_id)`.
- Produces: a private `receipts` Storage bucket with household-scoped RLS. Task 3's `uploadReceipt` writes into it.

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260625_receipts_storage_bucket.sql` (temporary name — renamed in Step 3):
```sql
-- Day 10: private Storage bucket for receipt images, household-scoped RLS.
-- Object key layout: {household_id}/{uuid}.jpg — the first path segment is the
-- household id, which the policies authorize against. Idempotent.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "receipts: household read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  );

create policy "receipts: household insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  );

create policy "receipts: household update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  );

create policy "receipts: household delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply via Supabase MCP**

Apply the migration through the Supabase MCP `apply_migration` tool with name `receipts_storage_bucket` and the SQL above. It applies to the remote project and records its own version timestamp.

Expected: success, no error. (RLS is already enabled on `storage.objects` by Supabase — these are additive policies.)

- [ ] **Step 3: Rename the local file to the stamped version**

Rename `supabase/migrations/20260625_receipts_storage_bucket.sql` to match the version stamped by `apply_migration` (e.g. `20260625HHMMSS_receipts_storage_bucket.sql`), so local migrations stay in sync with remote. Confirm with `mcp list_migrations` if unsure of the exact stamp.

- [ ] **Step 4: Verify the bucket exists and is private**

Run a read-only check via the Supabase MCP `execute_sql`:
```sql
select id, public from storage.buckets where id = 'receipts';
```
Expected: one row, `public = false`. Also confirm 4 policies:
```sql
select policyname from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname like 'receipts:%';
```
Expected: 4 rows (read, insert, update, delete).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/
git commit -m "feat(day10): private receipts storage bucket with household RLS"
```

---

### Task 3: Receipt upload service

**Files:**
- Create: `features/receipts/objectKey.ts`
- Create: `features/receipts/objectKey.test.ts`
- Create: `features/receipts/storage.ts`

**Interfaces:**
- Consumes: `supabase` from `@/services/supabase`; `private` bucket `receipts` from Task 2; `expo-crypto`, `expo-file-system` from Task 1.
- Produces:
  - `buildReceiptObjectKey(householdId: string, uuid: string): string` → `"{householdId}/{uuid}.jpg"`; throws on empty input.
  - `RECEIPT_BUCKET = 'receipts'`, `RECEIPT_CONTENT_TYPE = 'image/jpeg'`.
  - `uploadReceipt(localUri: string, householdId: string): Promise<{ storagePath: string }>`.

- [ ] **Step 1: Write the failing test for the key helper**

Create `features/receipts/objectKey.test.ts`:
```ts
import { buildReceiptObjectKey } from './objectKey';

describe('buildReceiptObjectKey', () => {
  it('builds {householdId}/{uuid}.jpg', () => {
    expect(buildReceiptObjectKey('house-1', 'uuid-9')).toBe('house-1/uuid-9.jpg');
  });

  it('throws when householdId is empty', () => {
    expect(() => buildReceiptObjectKey('', 'uuid-9')).toThrow();
  });

  it('throws when uuid is empty', () => {
    expect(() => buildReceiptObjectKey('house-1', '')).toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest features/receipts/objectKey.test.ts`
Expected: FAIL — cannot find module `./objectKey`.

- [ ] **Step 3: Implement the key helper**

Create `features/receipts/objectKey.ts`:
```ts
/**
 * Storage object key for a receipt image: `{householdId}/{uuid}.jpg`.
 * The first path segment is the household id, which Storage RLS authorizes
 * against. Pure and import-free so it stays unit-testable.
 */
export function buildReceiptObjectKey(householdId: string, uuid: string): string {
  if (!householdId) throw new Error('householdId is required to build a receipt key');
  if (!uuid) throw new Error('uuid is required to build a receipt key');
  return `${householdId}/${uuid}.jpg`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest features/receipts/objectKey.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement the upload service**

Create `features/receipts/storage.ts`:
```ts
// features/receipts/storage.ts — the ONLY module that uploads receipt images.
import { File } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { supabase } from '@/services/supabase';
import { buildReceiptObjectKey } from './objectKey';

export const RECEIPT_BUCKET = 'receipts';
export const RECEIPT_CONTENT_TYPE = 'image/jpeg';

/**
 * Upload a local JPEG to the private `receipts` bucket under
 * `{householdId}/{uuid}.jpg`. Returns the object key (storage path) for later
 * signed-URL access in Day 11. Throws on read or upload failure.
 */
export async function uploadReceipt(
  localUri: string,
  householdId: string,
): Promise<{ storagePath: string }> {
  const key = buildReceiptObjectKey(householdId, Crypto.randomUUID());
  const bytes = await new File(localUri).bytes();
  const { error } = await supabase.storage
    .from(RECEIPT_BUCKET)
    .upload(key, bytes, { contentType: RECEIPT_CONTENT_TYPE, upsert: false });
  if (error) throw error;
  return { storagePath: key };
}
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add features/receipts/objectKey.ts features/receipts/objectKey.test.ts features/receipts/storage.ts
git commit -m "feat(day10): receipt storage upload service + object-key helper"
```

---

### Task 4: Scanner screen — auto-capture launcher

**Files:**
- Modify (full rewrite): `app/scanner.tsx`
- Modify: `package.json`, `app.json` (remove `expo-camera`)

**Interfaces:**
- Consumes: `DocumentScanner.scanDocument` (Task 1), `manipulateAsync`/`SaveFormat` (Task 1), `uploadReceipt` (Task 3), `useAuthStore` (existing).
- Produces: navigation to `/confirm-receipt` with `{ storagePath, previewUri }` params; `expo-camera` fully removed from the repo.

- [ ] **Step 1: Replace `app/scanner.tsx` with the launcher**

Replace the entire file with:
```tsx
import { MaterialIcons } from '@expo/vector-icons';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import DocumentScanner from 'react-native-document-scanner-plugin';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackgroundGlow } from '@/components/BackgroundGlow';
import { PillButton } from '@/components/PillButton';
import { useAuthStore } from '@/features/auth/store';
import { uploadReceipt } from '@/features/receipts/storage';

type Phase = 'scanning' | 'uploading' | 'error' | 'no-household';

/** Thin launcher around the native document scanner: auto-capture → compress →
 *  upload → confirm screen. The capture UI is OS-native; this screen only shows
 *  branded loading / error states. */
export default function ScannerScreen() {
  const [phase, setPhase] = useState<Phase>('scanning');
  const started = useRef(false);

  const run = useCallback(async () => {
    const householdId = useAuthStore.getState().householdId;
    if (!householdId) {
      setPhase('no-household');
      return;
    }
    setPhase('scanning');
    try {
      const { scannedImages, status } = await DocumentScanner.scanDocument({
        maxNumDocuments: 1,
      });
      if (status !== 'success' || !scannedImages?.length) {
        router.back();
        return;
      }
      setPhase('uploading');
      const shrunk = await manipulateAsync(scannedImages[0], [{ resize: { width: 1600 } }], {
        compress: 0.7,
        format: SaveFormat.JPEG,
      });
      const { storagePath } = await uploadReceipt(shrunk.uri, householdId);
      router.replace({
        pathname: '/confirm-receipt',
        params: { storagePath, previewUri: shrunk.uri },
      });
    } catch (err) {
      if (__DEV__) console.warn('[scanner] capture/upload failed', err);
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
  }, [run]);

  return (
    <View className="flex-1 bg-background">
      <BackgroundGlow />
      <SafeAreaView className="flex-1 items-center justify-center px-xl">
        {phase === 'uploading' && (
          <View className="items-center gap-lg">
            <ActivityIndicator size="large" color="#adc7ff" />
            <Text className="font-inter text-body-lg text-on-surface">Качване на бележка…</Text>
          </View>
        )}

        {phase === 'scanning' && <ActivityIndicator size="large" color="#adc7ff" />}

        {phase === 'no-household' && (
          <View className="items-center gap-lg">
            <MaterialIcons name="error-outline" size={48} color="#ffb4ab" />
            <Text className="text-center font-inter text-body-lg text-on-surface">
              Няма активно домакинство.
            </Text>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text className="font-inter text-label-md text-on-surface-variant">Назад</Text>
            </Pressable>
          </View>
        )}

        {phase === 'error' && (
          <View className="w-full items-center gap-lg">
            <MaterialIcons name="cloud-off" size={48} color="#ffb4ab" />
            <Text className="text-center font-inter text-body-lg text-on-surface">
              Качването не успя. Опитай отново.
            </Text>
            <View className="w-full max-w-xs flex-row gap-md">
              <View className="flex-1">
                <PillButton label="Назад" variant="ghost" uppercase block onPress={() => router.back()} />
              </View>
              <View className="flex-1">
                <PillButton label="Опитай пак" variant="filled" uppercase block onPress={run} />
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}
```

- [ ] **Step 2: Remove `expo-camera` (now unused)**

`scanner.tsx` was the only consumer of `expo-camera`; it no longer imports it. Remove the package and its `app.json` plugin block.

Run:
```bash
npm uninstall expo-camera
```
Then in `app.json`, delete the `expo-camera` plugin block:
```json
      [
        "expo-camera",
        {
          "cameraPermission": "Teftera uses the camera to scan receipts."
        }
      ],
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS, no unused-import or `any` errors. No remaining reference to `expo-camera` anywhere in the repo.

- [ ] **Step 4: Commit**

```bash
git add app/scanner.tsx package.json package-lock.json app.json
git commit -m "feat(day10): scanner auto-captures via ML Kit and uploads to storage"
```

---

### Task 5: Confirm-receipt thumbnail from scan params

**Files:**
- Modify: `app/confirm-receipt.tsx:1-56` (imports + thumbnail block)

**Interfaces:**
- Consumes: `{ storagePath, previewUri }` params from Task 4.
- Produces: nothing downstream in Day 10 (fields stay static — Day 11 fills them).

- [ ] **Step 1: Read the scan params**

In `app/confirm-receipt.tsx`, add `Image` to the `react-native` import and `useLocalSearchParams` to the `expo-router` import:
```tsx
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
```
Inside the component, near the top of `ConfirmReceiptScreen`:
```tsx
  const { previewUri } = useLocalSearchParams<{ storagePath?: string; previewUri?: string }>();
```

- [ ] **Step 2: Render the real thumbnail**

Replace the placeholder thumbnail block (currently the `View` wrapping the `receipt-long` icon) with a conditional:
```tsx
          {/* Thumbnail */}
          <View className="my-xl items-center">
            {previewUri ? (
              <Image
                source={{ uri: previewUri }}
                className="h-28 w-20 rounded-xl"
                resizeMode="cover"
              />
            ) : (
              <View className="h-28 w-20 items-center justify-center rounded-xl bg-surface-container-high">
                <MaterialIcons name="receipt-long" size={28} color="rgba(255,255,255,0.4)" />
              </View>
            )}
          </View>
```

- [ ] **Step 3: Typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/confirm-receipt.tsx
git commit -m "feat(day10): show captured receipt thumbnail on confirm screen"
```

---

### Task 6: Full test pass + checkpoint

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite**

Run: `npm test`
Expected: PASS, including `features/receipts/objectKey.test.ts` (3 tests).

- [ ] **Step 2: Typecheck the whole project**

Run: `npm run typecheck`
Expected: PASS, no `expo-camera` references remain.

- [ ] **Step 3: MANUAL on-device checkpoint (human, requires the Task 1 dev client)**

1. `npx expo start` → open in the dev client.
2. From the dashboard, tap **Scan** → native auto-capture grabs a deskewed receipt.
3. "Качване на бележка…" overlay shows briefly.
4. Lands on confirm-receipt showing the captured thumbnail.
5. In the Supabase dashboard, the file appears in the `receipts` bucket under `{household_id}/`.
6. Cancel the native scanner → returns to dashboard cleanly (no crash).
7. Force an upload failure (e.g. airplane mode after capture) → error card + "Опитай пак" works; no crash.

---

## Self-Review

**Spec coverage:**
- Dev client + deps + config → Task 1. ✅
- `expo-camera` removed (pkg + app.json + usage) → Task 4, after the scanner rewrite drops the import (keeps every task green). ✅
- Private bucket + 4 household-scoped Storage RLS policies, `{household_id}/{uuid}.jpg` → Task 2. ✅
- `features/receipts/storage.ts` upload service + unit-tested key helper → Task 3. ✅ (helper split into `objectKey.ts` for import-free testability.)
- Compress before upload (~1600px, JPEG 0.7) → Task 4 `manipulateAsync`. ✅
- Scanner thin launcher: no-household guard, auto-capture, cancel→back, uploading overlay, success→confirm w/ params, error+retry, never crash → Task 4. ✅
- Confirm renders thumbnail from `previewUri`, falls back to placeholder, fields static → Task 5. ✅
- `receipts` DB row deferred to Day 11 → not created here. ✅
- Unit tests + on-device checkpoint → Task 3, Task 6. ✅

**Placeholder scan:** No TBD/TODO; all code blocks complete; the one transient-red note (Task 1 Step 4) is explained, not a placeholder.

**Type consistency:** `buildReceiptObjectKey(householdId, uuid)` and `uploadReceipt(localUri, householdId): Promise<{ storagePath }>` are used identically in Tasks 3–4. `previewUri` param name matches between Task 4 (set) and Task 5 (read). `RECEIPT_BUCKET`/`RECEIPT_CONTENT_TYPE` defined and used in Task 3 only.

**Divergences from spec (intentional, noted in Global Constraints):** `new File(uri).bytes()` instead of `base64-arraybuffer` (drops a dep); `expo-crypto` added for the uuid; key helper in `objectKey.ts` rather than inside `storage.ts`.
