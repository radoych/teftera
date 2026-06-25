# Day 10 — Receipt Scanner: Auto-Capture + Supabase Storage

**Date:** 2026-06-25
**Status:** Approved design, pending implementation plan
**Build plan reference:** `teftera-build-plan.md` → Day 10

---

## Goal

Replace the stubbed receipt scanner with a working capture-to-storage pipeline:
a user opens the scanner, the device **auto-captures** a deskewed receipt image,
the image is uploaded to a private Supabase Storage bucket, and the confirm-receipt
screen opens showing the captured image. Gemini extraction and the DB writes
(`receipts` row + linked `transactions` row) are **out of scope** — they are Day 11.

---

## Decisions (locked)

| Decision | Choice | Rationale |
|---|---|---|
| Capture mechanism | **ML Kit Document Scanner** (`react-native-document-scanner-plugin`) | True on-device auto-capture, edge-detection, auto-crop; least code; best Gemini input. Free. |
| Runtime | **Custom dev client** (`expo-dev-client`) | The scanner is a third-party native module not bundled in Expo Go. Needed eventually anyway (Day 15 push, Day 18 preview build). |
| Bucket access | **Private bucket + signed URLs** | Receipts are personal financial data. Household-scoped Storage RLS, matching the `household_id`-on-everything rule. |
| Compression | **Resize + compress before upload** (`expo-image-manipulator`, ~1600px, JPEG 0.7) | Smaller files for the free Storage tier and faster Gemini calls in Day 11. |
| `receipts` DB row | **Deferred to Day 11** | Day 10 only uploads the file and passes `storage_path`. Row + transaction created on Save in Day 11. Orphaned uploads from abandoned scans are acceptable for now. |
| Capture UI styling | **OS-native** (VisionKit on iOS, ML Kit on Android) | Accepted: the capture screen looks different per-platform. Teftera design system still owns confirm-receipt and every other screen. |
| `expo-camera` | **Uninstall** | Only used by the old `scanner.tsx` viewfinder, which is removed. |

---

## Scope

### In scope
- New dependencies + dev-client setup (config plugin, permissions).
- Remove `expo-camera` (package + `app.json` plugin entry); drop the hand-built
  viewfinder, torch, shutter, and gallery picker from `scanner.tsx`.
- Private `receipts` Storage bucket + RLS migration.
- `features/receipts/storage.ts` upload service + unit-tested key helper.
- `scanner.tsx` rewritten as a thin launcher around the native scanner.
- `confirm-receipt.tsx` reads scan params and renders the real thumbnail (fields stay static).
- Unit tests for the pure key helper.

### Out of scope (later days)
- Gemini extraction / pre-filled fields (Day 11).
- Creating `receipts` / `transactions` rows on Save (Day 11).
- Signed-URL generation for Gemini (Day 11 — Day 10 uses the local URI for the thumbnail).
- Multi-page receipts (`maxNumDocuments: 1`).
- Orphan-file cleanup.

---

## Components & changes

### 0. Dependencies & dev client (one-time setup)

Install:
```bash
npx expo install expo-dev-client react-native-document-scanner-plugin expo-image-manipulator
npm install base64-arraybuffer
npm uninstall expo-camera
```

`app.json`:
- Remove the `expo-camera` plugin block.
- Add the document-scanner config plugin per its docs.
- Add iOS `NSCameraUsageDescription` (Bulgarian copy, e.g. "Teftera използва камерата за сканиране на бележки.").
- Android: GMS document scanner runs in Google Play Services and requires **no** declared `CAMERA` permission.

Dev-client build (human/on-device step, run once and after any native dep change):
```bash
eas build --profile development --platform android   # and/or ios
```
Then `npx expo start` → scan QR opens the custom dev client (workflow otherwise unchanged).

**New deps are all free / on-device.** Nothing leaves the device except the final upload to Supabase.

### 1. Storage bucket + RLS migration

New migration `supabase/migrations/<ts>_receipts_storage_bucket.sql`:

- Create a **private** bucket `receipts` (`storage.buckets` insert, `public = false`),
  idempotent (`on conflict do nothing`).
- Four RLS policies on `storage.objects` for `bucket_id = 'receipts'`
  (SELECT / INSERT / UPDATE / DELETE), each scoped so the **first path segment**
  is one of the user's household ids:

```sql
(storage.foldername(name))[1] IN (
  SELECT household_id::text
  FROM public.household_members
  WHERE user_id = auth.uid()
)
```

- Object key layout: `{household_id}/{uuid}.jpg` (bucket implied; the path prefix is
  the household id — equivalent to the plan's `receipts/{household_id}/{uuid}.jpg`).
- Apply via the Supabase MCP `apply_migration`; rename the local file to the
  version it stamps (per project convention).

### 2. Upload service — `features/receipts/storage.ts`

Single module owning Storage interaction (mirrors `features/transactions/api.ts`).

Constants: `RECEIPT_BUCKET = 'receipts'`, `RECEIPT_CONTENT_TYPE = 'image/jpeg'`.

**Pure helper (unit-tested):**
```ts
buildReceiptObjectKey(householdId: string, uuid?: string): string
// → `${householdId}/${uuid ?? <generated>}.jpg`
// throws if householdId is empty
```

**Upload fn (thin, not unit-tested — touches the SDK):**
```ts
uploadReceipt(localUri: string, householdId: string): Promise<{ storagePath: string }>
```
- Read the local file as base64 via `expo-file-system`.
- Decode to `ArrayBuffer` via `base64-arraybuffer` (the reliable RN path;
  `fetch(uri).blob()` is unreliable under Hermes).
- `supabase.storage.from(RECEIPT_BUCKET).upload(key, arrayBuffer, { contentType: RECEIPT_CONTENT_TYPE, upsert: false })`.
- Throw on error; return `{ storagePath: key }`.

### 3. `scanner.tsx` — thin launcher (rewrite)

The `CameraView` viewfinder, torch, shutter, and gallery picker are **removed**.
New behavior:

1. On mount, read `householdId` from `useAuthStore.getState()`. If missing →
   branded inline error, do not scan.
2. Call `scanDocument({ maxNumDocuments: 1 })` (plugin) → native auto-capture UI.
3. **Cancelled / no image** → `router.back()`.
4. **Image returned** → resize/compress with `expo-image-manipulator`
   (~1600px wide, JPEG 0.7) → `uploadReceipt(uri, householdId)`.
5. **Uploading** → branded full-screen overlay, "Качване на бележка…" + spinner
   (this screen is Teftera-styled even though the capture UI is OS-native).
6. **Success** → `router.replace({ pathname: '/confirm-receipt', params: { storagePath, previewUri } })`
   where `previewUri` is the local (compressed) file URI.
7. **Failure** → branded inline error card with a **retry** pill (re-runs the scan,
   or re-uploads the already-captured image) + dismiss. Never crashes.

State machine: `idle → scanning → (cancelled→back | uploading → success→navigate | error→retry)`.

### 4. `confirm-receipt.tsx` — real thumbnail

- Read `storagePath` + `previewUri` via `useLocalSearchParams`.
- Render the thumbnail from `previewUri` (local URI = instant; no signed-URL round-trip
  needed in Day 10) in place of the placeholder icon.
- Fall back to the existing placeholder when params are absent (keeps the static/demo path working).
- **Fields remain static** — extraction and Save→DB are Day 11. "Отново" still routes to `/scanner`.

### 5. Testing

- `features/receipts/storage.test.ts`: `buildReceiptObjectKey` — correct shape,
  uuid substitution, empty-household guard.
- Camera + real upload are not unit-testable → on-device human checkpoint.

---

## Data flow

```
scanner.tsx (mount)
  → scanDocument()                    [native auto-capture, OS UI]
  → expo-image-manipulator.resize     [~1600px, JPEG 0.7] → previewUri
  → uploadReceipt(previewUri, householdId)
       → FileSystem.readAsStringAsync(base64)
       → base64-arraybuffer.decode → ArrayBuffer
       → supabase.storage.from('receipts').upload('{household_id}/{uuid}.jpg', ...)
  → router.replace('/confirm-receipt', { storagePath, previewUri })
confirm-receipt.tsx
  → renders previewUri thumbnail; fields static (Day 11 fills them)
```

---

## Error handling

| Failure | Behavior |
|---|---|
| No `householdId` in store | Branded inline error; no scan attempted. |
| User cancels native scanner | `router.back()`, silent. |
| Compression throws | Treated as upload failure → error card + retry. |
| Upload throws (network / RLS / quota) | Error card + retry pill; camera/scan re-triggerable; never crashes. |
| Missing params on confirm screen | Falls back to placeholder thumbnail. |

---

## Checkpoint (Definition of Done)

Open scanner → native auto-capture grabs a deskewed receipt → "Качване на бележка…"
overlay → lands on confirm-receipt showing the captured thumbnail → the file is present
in the Supabase `receipts` bucket under `{household_id}/`. Cancelling the scan and an
upload failure both return cleanly with no crash. `npm test` passes (key-helper tests).

---

## Non-negotiable rule compliance

- **Private bucket + household-scoped Storage RLS** → satisfies the
  `household_id`-on-everything / RLS rule for the new storage surface.
- **Schema/storage change via migration file** (not dashboard-only).
- **No secrets added.**
- **New deps are free / on-device** — within the zero-cost constraint.
- **Money/currency:** untouched in Day 10 (no amounts persisted yet).
