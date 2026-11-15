# Vendors · Loyalty Cards · Shopping Lists — Implementation Spec

**Date:** 2026-09-09
**Branch:** `claude/vendor-loyalty-shopping-features-5pazrl`
**Builds on:** `main` @ `6eef5bc` (income model, server-side Gemini, keyboard stack).
**Audience:** the Claude Code session that implements this. Read `CLAUDE.md` first — every
rule there still applies. This document is the complete design; where it is silent, follow
the nearest existing pattern in the codebase (named below) rather than inventing a new one.

---

## 0. What we are building

Three features that stack on each other:

1. **Vendors & recognized names.** A household-level table of *normalized* merchant names
   ("Kaufland") plus every raw string that should resolve to each one ("KAUFLAND BULGARIA
   EOOD", "kaufland sf 12", "Кауфланд"). Merchant fields in manual entry and receipt confirm
   get **autocomplete** from this table. A settings screen manages it. A raw name can belong
   to **exactly one** vendor; a violation triggers a **conflict flow** that lets the user
   delete either vendor (name + its whole list) or both, or merge.
2. **Loyalty cards.** Cards belong to a vendor (autocompleted from feature 1). A vendor can
   have several cards, each with a **nickname** (whose card / which one). A full-screen
   presenter shows the barcode at max brightness for in-store scanning. Cards are added by
   scanning the physical card's barcode or typing the code.
3. **Shopping lists.** One list per store. The list's name *is* the vendor (autocomplete from
   feature 1). Creating a list attaches the vendor's loyalty card automatically (or asks which
   one when there are several). Items are quick-added, checked off with a **satisfying
   animation + haptic**, and shared live between both household members.

Everything is household-scoped, RLS-protected, realtime, free-tier only.

---

## 1. Scope decisions (locked — do not re-litigate)

| # | Decision | Why |
|---|---|---|
| 1 | **Vendor name is itself stored as an alias row** (`is_primary = true`). | One unique index `(household_id, alias_key)` then enforces *both* invariants: no raw name in two lists, and no alias equal to another vendor's name. |
| 2 | **Normalization key** = NFKC → lowercase → collapse whitespace → trim. Computed by a DB trigger (authority) and mirrored in TS (for local lookups). | Cyrillic-safe, predictable, no "smart" stripping that surprises the user. |
| 3 | Transactions keep storing the **normalized name as text** in `merchant`. No `vendor_id` FK on `transactions` this slice. | Zero blast radius on history/insights/reports. A FK is a later, separate migration. |
| 4 | **Vendors are created implicitly** when a transaction is saved with a merchant that resolves to nothing, and **backfilled** from existing transactions by the migration. | Autocomplete is useful on day one instead of empty. |
| 5 | **Aliases are learned only from user-confirmed edits**: receipt confirm (raw Gemini merchant → chosen vendor) and the settings screen. DSK/bank import *reads* aliases but never writes them. | Keeps the recognized-names list meaningful, not hundreds of bank strings. |
| 6 | Conflict flow offers **four** resolutions: *merge* (recommended, added by this spec), *delete other vendor*, *delete this vendor*, *delete both*. Rendered as a selectable list + one `SheetActions` row. | The user asked for the three delete options; merge is the non-destructive superset and is the right default. |
| 7 | Deleting a vendor **never deletes cards or lists**: `loyalty_cards.vendor_id` and `shopping_lists.vendor_id` are `on delete set null`; orphans show under "Без търговец" and can be re-linked. | Barcodes are the most valuable data in this slice. |
| 8 | **One active shopping list per vendor** (partial unique index). "New list" for a vendor that already has one opens the existing list. | Matches the mental model "the Kaufland list"; lists are reused, not archived. |
| 9 | Barcodes: **own encoders** for EAN-13 / EAN-8 / Code128 in `lib/barcode/` (pure, unit-tested, rendered with the already-installed `react-native-svg`); **QR via `react-native-qrcode-svg`**. | No unmaintained barcode wrapper dependency; encoders are ~200 lines of tested pure logic — portfolio-grade. |
| 10 | New free Expo modules: `expo-haptics`, `expo-brightness`, `expo-camera` (barcode scanning only). | All first-party, no cost. Camera scanning makes adding a card a 3-second task. |
| 11 | Animations use the installed **Reanimated 4** (layout transitions + springs). Lists are small, so rows are `Animated.View` inside the existing `Screen` scroll view, **not** `FlatList`. | Layout animations are reliable in a plain view tree; FlatList + layout animations have known edge cases. |
| 12 | Check-off writes to the DB **immediately**; only the *visual regrouping* to the "Взети" section is delayed ~450 ms. | Server truth is instant for the other phone; the row doesn't jump under the finger. |
| 13 | Realtime on all five new tables using the existing refetch-on-change + 400 ms debounce pattern. | Proven in this codebase; two-person household, tiny tables. |
| 14 | Shopping lists appear on the **dashboard** as a new per-user section key `lists` (existing show/hide + reorder system), plus a full screen. Cards get a header icon on the dashboard. | No fifth tab — the design system fixes the nav at 4 tabs. |

## 2. Out of scope (do not build)

- `vendor_id` on `transactions`; re-normalizing historical transactions when a vendor is renamed.
- Sharing lists outside the household; list templates; recurring lists; price tracking.
- Drag-to-reorder items inside a list (position is insertion order; checked go to the bottom).
- Card images / front-back photos; Apple Wallet / Google Wallet passes.
- Auto-learning aliases from bank/CSV imports.
- Fuzzy (Levenshtein) matching in autocomplete — prefix/substring on name + aliases only.
- Vendor logos / icons.

---

## 3. Dependencies to add (all free, MIT / Expo SDK)

```bash
npx expo install expo-haptics expo-brightness expo-camera
npm install react-native-qrcode-svg
```

`app.json` → `plugins`: add
```json
["expo-camera", { "cameraPermission": "Teftera използва камерата за сканиране на клиентски карти." }]
```
(`react-native-document-scanner-plugin` already declares the camera permission; both can coexist.)

`jest.setup.ts` → add module-level mocks so any screen-adjacent pure module that imports the wrappers stays testable:
```ts
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
```
Pure modules (`lib/barcode/*`, `features/*/key.ts`, `resolve.ts`, `conflict.ts`, `order.ts`, `quickAdd.ts`, `format.ts`) must **not** import Expo modules at all.

---

## 4. Data model — three migrations

Create each with `npx supabase migration new <name>` so the timestamp prefix is real. Apply to
the project with `npx supabase db push` (or the Supabase MCP `apply_migration`, which is how
earlier migrations were applied — either is fine; the SQL file in the repo is the source of
truth per CLAUDE.md rule #4).

Conventions carried over from `20260619103503_harden_security_and_indexes.sql`:
RLS helper is `private.is_household_member(household_id)`; `auth.uid()` is wrapped as
`(select auth.uid())`; trigger functions get `revoke all … from public`; every table joins
the `supabase_realtime` publication idempotently and sets `replica identity full` (see
`20260623121635_restore_transactions_replica_identity_full.sql` for why).

### 4.1 `vendors` — `supabase/migrations/<ts>_vendors.sql`

```sql
-- Vendors: household-level normalized merchant names + every raw "as scanned /
-- as typed / as exported" name that should resolve to them.
--
-- Invariant (the whole point of the feature): within a household a raw name
-- resolves to AT MOST ONE vendor. The vendor's own display name is stored as
-- its primary alias, so one unique index enforces both "no alias in two
-- vendors" and "no alias equal to another vendor's name".

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Normalization key. Mirrored in TS by features/vendors/key.ts; the DB is the
-- authority (unique index), the TS copy only serves local lookups.
create or replace function private.merchant_key(raw text)
returns text
language sql
immutable
strict
as $$
  select lower(normalize(regexp_replace(btrim(raw), '\s+', ' ', 'g'), NFKC));
$$;
revoke all on function private.merchant_key(text) from public;
grant execute on function private.merchant_key(text) to authenticated;

-- Generic updated_at bump, reused by loyalty_cards and shopping_lists.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.set_updated_at() from public;
grant execute on function private.set_updated_at() to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.vendors (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  name_key     text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint vendors_name_not_blank check (btrim(name) <> ''),
  unique (household_id, name_key)
);

create table public.vendor_aliases (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  vendor_id    uuid not null references public.vendors (id) on delete cascade,
  alias        text not null,
  alias_key    text not null,
  is_primary   boolean not null default false,
  source       text not null default 'manual'
                 check (source in ('manual', 'receipt', 'seed')),
  created_at   timestamptz not null default now(),
  constraint vendor_aliases_alias_not_blank check (btrim(alias) <> ''),
  unique (household_id, alias_key)          -- THE invariant
);

create index vendors_house_idx          on public.vendors (household_id);
create index vendor_aliases_house_idx   on public.vendor_aliases (household_id);
create index vendor_aliases_vendor_idx  on public.vendor_aliases (vendor_id);
create unique index vendor_aliases_one_primary_idx
  on public.vendor_aliases (vendor_id) where is_primary;

-- ---------------------------------------------------------------------------
-- Triggers: keys are computed server-side so the invariant cannot be bypassed.
-- ---------------------------------------------------------------------------
create or replace function public.vendors_before_write()
returns trigger
language plpgsql
as $$
begin
  new.name     := regexp_replace(btrim(new.name), '\s+', ' ', 'g');
  new.name_key := private.merchant_key(new.name);
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.vendors_before_write() from public;

create trigger vendors_before_write
  before insert or update on public.vendors
  for each row execute function public.vendors_before_write();

-- Keep the primary alias in lock-step with the vendor name.
create or replace function public.vendors_sync_primary_alias()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.vendor_aliases (household_id, vendor_id, alias, alias_key, is_primary, source)
    values (new.household_id, new.id, new.name, new.name_key, true, 'manual');
  elsif new.name_key is distinct from old.name_key or new.name <> old.name then
    -- Renaming a vendor to one of its OWN non-primary aliases must not collide
    -- with itself: absorb that alias row first.
    delete from public.vendor_aliases
      where vendor_id = new.id and not is_primary and alias_key = new.name_key;
    update public.vendor_aliases
      set alias = new.name, alias_key = new.name_key
      where vendor_id = new.id and is_primary;
  end if;
  return new;
end;
$$;
revoke all on function public.vendors_sync_primary_alias() from public;

create trigger vendors_sync_primary_alias
  after insert or update on public.vendors
  for each row execute function public.vendors_sync_primary_alias();

create or replace function public.vendor_aliases_before_write()
returns trigger
language plpgsql
as $$
declare
  v_household uuid;
begin
  new.alias     := regexp_replace(btrim(new.alias), '\s+', ' ', 'g');
  new.alias_key := private.merchant_key(new.alias);
  select household_id into v_household from public.vendors where id = new.vendor_id;
  if v_household is null or v_household <> new.household_id then
    raise exception 'vendor_aliases.household_id must match the vendor''s household'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.vendor_aliases_before_write() from public;

create trigger vendor_aliases_before_write
  before insert or update on public.vendor_aliases
  for each row execute function public.vendor_aliases_before_write();

-- ---------------------------------------------------------------------------
-- Merge (conflict resolution). SECURITY INVOKER: RLS still applies to every
-- statement; the explicit membership check just gives a clear error.
-- Later migrations `create or replace` this to also re-point cards and lists.
-- ---------------------------------------------------------------------------
create or replace function public.merge_vendors(p_source uuid, p_target uuid)
returns void
language plpgsql
as $$
declare
  v_house uuid;
begin
  if p_source = p_target then
    raise exception 'cannot merge a vendor into itself' using errcode = '22023';
  end if;
  select household_id into v_house from public.vendors where id = p_source;
  if v_house is null or not private.is_household_member(v_house) then
    raise exception 'source vendor not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.vendors where id = p_target and household_id = v_house) then
    raise exception 'target vendor not found' using errcode = 'P0002';
  end if;

  -- The source's name becomes an ordinary recognized name of the target.
  update public.vendor_aliases
    set vendor_id = p_target, is_primary = false
    where vendor_id = p_source;

  delete from public.vendors where id = p_source;
end;
$$;
revoke all on function public.merge_vendors(uuid, uuid) from public;
grant execute on function public.merge_vendors(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS — standard household pattern.
-- ---------------------------------------------------------------------------
alter table public.vendors        enable row level security;
alter table public.vendor_aliases enable row level security;

create policy "vendors: household crud"
  on public.vendors for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy "vendor_aliases: household crud"
  on public.vendor_aliases for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vendors') then
    alter publication supabase_realtime add table public.vendors;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'vendor_aliases') then
    alter publication supabase_realtime add table public.vendor_aliases;
  end if;
end $$;
alter table public.vendors        replica identity full;
alter table public.vendor_aliases replica identity full;

-- ---------------------------------------------------------------------------
-- Backfill: seed vendors from the merchants a household already uses, so the
-- autocomplete is useful immediately. Keeps merchants that were entered by a
-- person (manual / receipt) or that recur (>= 2 imported rows) — one-off bank
-- strings are left out. Most recent spelling wins per key.
-- ---------------------------------------------------------------------------
insert into public.vendors (household_id, name)
select household_id, name
from (
  select distinct on (household_id, private.merchant_key(merchant))
         household_id,
         regexp_replace(btrim(merchant), '\s+', ' ', 'g') as name
  from public.transactions t
  where btrim(merchant) <> ''
    and (
      source in ('manual', 'receipt')
      or (select count(*) from public.transactions t2
          where t2.household_id = t.household_id
            and private.merchant_key(t2.merchant) = private.merchant_key(t.merchant)) >= 2
    )
  order by household_id, private.merchant_key(merchant), created_at desc
) s
on conflict do nothing;

update public.vendor_aliases set source = 'seed' where is_primary;
```

> `normalize(text, NFKC)` needs Postgres ≥ 13 with a UTF-8 database — true for every Supabase
> project. If `db push` ever reports it missing, drop the `normalize()` wrapper and keep
> `lower(regexp_replace(...))`; the TS mirror then must drop its `.normalize('NFKC')` too.

### 4.2 `loyalty_cards` — `supabase/migrations/<ts>_loyalty_cards.sql`

```sql
create table public.loyalty_cards (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  vendor_id    uuid references public.vendors (id) on delete set null,
  nickname     text not null,
  code         text not null,
  code_format  text not null check (code_format in ('ean13', 'ean8', 'code128', 'qr')),
  color        text not null default '#adc7ff',
  note         text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint loyalty_cards_nickname_not_blank check (btrim(nickname) <> ''),
  constraint loyalty_cards_code_not_blank     check (btrim(code) <> ''),
  unique (household_id, vendor_id, nickname)   -- nulls are distinct: orphans are exempt
);

create index loyalty_cards_house_idx  on public.loyalty_cards (household_id);
create index loyalty_cards_vendor_idx on public.loyalty_cards (vendor_id);

create trigger loyalty_cards_set_updated_at
  before update on public.loyalty_cards
  for each row execute function private.set_updated_at();

alter table public.loyalty_cards enable row level security;
create policy "loyalty_cards: household crud"
  on public.loyalty_cards for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'loyalty_cards') then
    alter publication supabase_realtime add table public.loyalty_cards;
  end if;
end $$;
alter table public.loyalty_cards replica identity full;

-- Merge now also carries cards across.
create or replace function public.merge_vendors(p_source uuid, p_target uuid)
returns void
language plpgsql
as $$
declare
  v_house uuid;
begin
  if p_source = p_target then
    raise exception 'cannot merge a vendor into itself' using errcode = '22023';
  end if;
  select household_id into v_house from public.vendors where id = p_source;
  if v_house is null or not private.is_household_member(v_house) then
    raise exception 'source vendor not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.vendors where id = p_target and household_id = v_house) then
    raise exception 'target vendor not found' using errcode = 'P0002';
  end if;

  update public.vendor_aliases
    set vendor_id = p_target, is_primary = false
    where vendor_id = p_source;

  -- A nickname clash on the target keeps the card but disambiguates it.
  update public.loyalty_cards c
    set vendor_id = p_target,
        nickname = case
          when exists (select 1 from public.loyalty_cards t
                       where t.vendor_id = p_target and t.nickname = c.nickname)
          then c.nickname || ' (2)' else c.nickname end
    where c.vendor_id = p_source;

  delete from public.vendors where id = p_source;
end;
$$;
```

### 4.3 `shopping_lists` — `supabase/migrations/<ts>_shopping_lists.sql`

```sql
create table public.shopping_lists (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  vendor_id       uuid references public.vendors (id) on delete set null,
  name            text not null,                       -- snapshot of the vendor name
  loyalty_card_id uuid references public.loyalty_cards (id) on delete set null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint shopping_lists_name_not_blank check (btrim(name) <> '')
);
-- One active list per vendor (decision #8).
create unique index shopping_lists_one_per_vendor_idx
  on public.shopping_lists (household_id, vendor_id) where vendor_id is not null;
create index shopping_lists_house_idx on public.shopping_lists (household_id, updated_at desc);
create index shopping_lists_card_idx  on public.shopping_lists (loyalty_card_id);

create table public.shopping_list_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  list_id      uuid not null references public.shopping_lists (id) on delete cascade,
  name         text not null,
  quantity     text,                                   -- free text: "2", "1 кг", "x3"
  position     integer not null default 0,
  checked_at   timestamptz,
  checked_by   uuid references auth.users (id) on delete set null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  constraint shopping_list_items_name_not_blank check (btrim(name) <> '')
);
create index shopping_list_items_list_idx  on public.shopping_list_items (list_id, position);
create index shopping_list_items_house_idx on public.shopping_list_items (household_id);

create trigger shopping_lists_set_updated_at
  before update on public.shopping_lists
  for each row execute function private.set_updated_at();

-- Any item change bumps the parent list so "recently used" ordering works.
create or replace function public.shopping_list_items_touch_list()
returns trigger
language plpgsql
as $$
begin
  update public.shopping_lists set updated_at = now()
    where id = coalesce(new.list_id, old.list_id);
  return coalesce(new, old);
end;
$$;
revoke all on function public.shopping_list_items_touch_list() from public;
create trigger shopping_list_items_touch_list
  after insert or update or delete on public.shopping_list_items
  for each row execute function public.shopping_list_items_touch_list();

alter table public.shopping_lists      enable row level security;
alter table public.shopping_list_items enable row level security;
create policy "shopping_lists: household crud"
  on public.shopping_lists for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));
create policy "shopping_list_items: household crud"
  on public.shopping_list_items for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_lists') then
    alter publication supabase_realtime add table public.shopping_lists;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shopping_list_items') then
    alter publication supabase_realtime add table public.shopping_list_items;
  end if;
end $$;
alter table public.shopping_lists      replica identity full;
alter table public.shopping_list_items replica identity full;

-- Merge now also carries lists across. If both vendors have a list, the
-- source list's items are appended to the target list and the source list is
-- deleted (the partial unique index forbids two lists on one vendor).
create or replace function public.merge_vendors(p_source uuid, p_target uuid)
returns void
language plpgsql
as $$
declare
  v_house      uuid;
  v_src_list   uuid;
  v_dst_list   uuid;
  v_next_pos   integer;
begin
  if p_source = p_target then
    raise exception 'cannot merge a vendor into itself' using errcode = '22023';
  end if;
  select household_id into v_house from public.vendors where id = p_source;
  if v_house is null or not private.is_household_member(v_house) then
    raise exception 'source vendor not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.vendors where id = p_target and household_id = v_house) then
    raise exception 'target vendor not found' using errcode = 'P0002';
  end if;

  update public.vendor_aliases
    set vendor_id = p_target, is_primary = false
    where vendor_id = p_source;

  update public.loyalty_cards c
    set vendor_id = p_target,
        nickname = case
          when exists (select 1 from public.loyalty_cards t
                       where t.vendor_id = p_target and t.nickname = c.nickname)
          then c.nickname || ' (2)' else c.nickname end
    where c.vendor_id = p_source;

  select id into v_src_list from public.shopping_lists where vendor_id = p_source;
  select id into v_dst_list from public.shopping_lists where vendor_id = p_target;
  if v_src_list is not null and v_dst_list is null then
    update public.shopping_lists
      set vendor_id = p_target, name = (select name from public.vendors where id = p_target)
      where id = v_src_list;
  elsif v_src_list is not null and v_dst_list is not null then
    select coalesce(max(position), -1) + 1 into v_next_pos
      from public.shopping_list_items where list_id = v_dst_list;
    update public.shopping_list_items
      set list_id = v_dst_list, position = position + v_next_pos
      where list_id = v_src_list;
    delete from public.shopping_lists where id = v_src_list;
  end if;

  delete from public.vendors where id = p_source;
end;
$$;
```

### 4.4 CLAUDE.md "Database — Core Tables" additions (do this in the docs phase)

```
vendors             id, household_id, name, name_key, created_at, updated_at
vendor_aliases      id, household_id, vendor_id, alias, alias_key, is_primary, source, created_at
loyalty_cards       id, household_id, vendor_id (nullable), nickname, code, code_format, color, note, created_by, …
shopping_lists      id, household_id, vendor_id (nullable), name, loyalty_card_id (nullable), created_by, …
shopping_list_items id, household_id, list_id, name, quantity, position, checked_at, checked_by, created_by, created_at
```

---

## 5. Shared infrastructure (Phase 0)

### 5.1 Generic realtime subscription

`features/transactions/realtimeChannel.ts` already solves the unique-topic problem. Generalize
without changing behaviour:

```ts
export function subscribeToHouseholdTable(
  client: SupabaseClient,
  table: 'transactions' | 'vendors' | 'vendor_aliases' | 'loyalty_cards' | 'shopping_lists' | 'shopping_list_items',
  householdId: string,
  onChange: () => void,
): () => void;                       // same body as today, `table` parameterised

/** Kept for existing callers. */
export const subscribeToTransactions = (client, householdId, onChange) =>
  subscribeToHouseholdTable(client, 'transactions', householdId, onChange);
```

Each new feature gets a `sync.ts` shaped exactly like `features/transactions/sync.ts`:
load on mount, `trailingDebounce(load, 400)` on change, `reset()` when `householdId` is null,
`active` flag to drop late responses. A feature that watches two tables opens two channels and
funnels both into the same debounced reload. Mount the three hooks in `app/(app)/_layout.tsx`
next to `useTransactionsSync()`.

### 5.2 `lib/haptics.ts`

Thin wrapper so screens never import `expo-haptics` directly and tests need no mock:

```ts
export const haptics = {
  tap:     () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  select:  () => void Haptics.selectionAsync().catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error:   () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};
```
No-ops on web (`Platform.OS === 'web'`).

### 5.3 `lib/animation.ts`

One place for the motion vocabulary so every list in the app moves the same way:

```ts
import { Easing, FadeInDown, FadeOutLeft, FadeOutUp, LinearTransition } from 'react-native-reanimated';

export const SPRING_SNAPPY = { damping: 18, stiffness: 220, mass: 0.8 } as const;   // rows settling
export const SPRING_POP    = { damping: 12, stiffness: 320, mass: 0.6 } as const;   // checkbox
export const TIMING_FAST   = { duration: 160, easing: Easing.out(Easing.cubic) } as const;

export const rowLayout   = LinearTransition.springify().damping(18).stiffness(220).mass(0.8);
export const rowEntering = FadeInDown.duration(180).springify().damping(20);
export const rowExiting  = FadeOutLeft.duration(140);
export const listExiting = FadeOutUp.duration(120);
```

### 5.4 Routes

Add to the root `Stack` in `app/_layout.tsx`:

| Route file | Options |
|---|---|
| `app/vendors.tsx` | `animation: 'slide_from_right'` |
| `app/vendor/[id].tsx` | `animation: 'slide_from_right'` |
| `app/loyalty-cards.tsx` | `animation: 'slide_from_right'` |
| `app/card/[id].tsx` | `presentation: 'modal', animation: 'fade'` |
| `app/lists.tsx` | `animation: 'slide_from_right'` |
| `app/list/[id].tsx` | `animation: 'slide_from_right'` |

Every route exports `ErrorBoundary` from `ScreenErrorFallback` like the existing ones. Typed
routes: `.expo/types/router.d.ts` regenerates on `npx expo start`; if `tsc` rejects a new
route string before that, start the dev server once.

### 5.5 Profile entry points

In `app/(app)/profile.tsx` → "Общи" section, above "Управление на категории":
"Търговци" → `/vendors`, "Клиентски карти" → `/loyalty-cards`, "Списъци за пазаруване" → `/lists`.
Same row markup as the categories row.

---

## 6. Feature 1 — Vendors & recognized names

### 6.1 Files

| File | Responsibility |
|---|---|
| `features/vendors/types.ts` | `Vendor`, `VendorAlias`, `VendorIndex`, `VendorSuggestion`, `AliasConflict`. |
| `features/vendors/key.ts` (+test) | `merchantKey(raw)` — TS mirror of `private.merchant_key`. |
| `features/vendors/resolve.ts` (+test) | `buildVendorIndex`, `resolveVendor`, `suggestVendors`. |
| `features/vendors/conflict.ts` (+test) | `parseUniqueViolation(err)`, `describeConflict(...)`. |
| `features/vendors/api.ts` | The ONLY module touching `vendors` / `vendor_aliases`. |
| `features/vendors/store.ts` | Zustand: `vendors`, `aliases`, `loaded`; derived `index` memo. |
| `features/vendors/sync.ts` | `useVendorsSync()`, `refreshVendors(householdId)`. |
| `features/vendors/ensure.ts` (+test) | `ensureVendorForMerchant(...)` — the save-time hook used by both entry screens. |
| `features/vendors/learn.ts` (+test) | `shouldLearnAlias(rawExtracted, finalName, index)`. |
| `features/vendors/components/VendorAutocomplete.tsx` | Input + animated suggestion list. |
| `features/vendors/components/VendorConflictSheet.tsx` | The four-way resolution sheet. |
| `features/vendors/components/AliasRow.tsx` | One recognized-name row with delete. |
| `app/vendors.tsx` | Vendors list + search + "Нов търговец". |
| `app/vendor/[id].tsx` | Rename · recognized names · linked cards/lists · delete. |
| **Modified** `app/manual-entry.tsx` | Merchant `TextInput` → `VendorAutocomplete`; save resolves/creates vendor. |
| **Modified** `app/confirm-receipt.tsx` | Same, plus alias learning from the raw extracted merchant. |
| **Modified** `services/dsk-import.ts` | `normalizeMerchant(raw, lookup?)` consults household aliases first. |
| **Modified** `app/import-dsk.tsx` | Passes the store's lookup into the normalizer. |
| **Modified** `features/transactions/realtimeChannel.ts` | §5.1. |

### 6.2 Types

```ts
export interface Vendor { id: string; household_id: string; name: string; name_key: string; created_at: string; updated_at: string; }
export interface VendorAlias { id: string; household_id: string; vendor_id: string; alias: string; alias_key: string; is_primary: boolean; source: 'manual' | 'receipt' | 'seed'; created_at: string; }

/** Pre-computed lookup structures; rebuilt when the store changes (useMemo). */
export interface VendorIndex {
  byId: Map<string, Vendor>;
  byKey: Map<string, { vendor: Vendor; alias: VendorAlias }>;   // every alias incl. primary
  aliasesByVendor: Map<string, VendorAlias[]>;                  // non-primary only, alias asc
}
export interface VendorSuggestion { vendor: Vendor; matchedAlias: VendorAlias | null; /* null = matched on the name */ score: number; }
export interface AliasConflict { attemptedAlias: string; aliasKey: string; owner: Vendor; ownerAlias: VendorAlias; /* the row that already holds the key */ }
```

### 6.3 Pure logic (write tests first)

**`merchantKey(raw: string): string`** — `raw.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()`.
Tests: `'  KAUFLAND   Bulgaria '` → `'kaufland bulgaria'`; `'Кауфланд'` → `'кауфланд'`; `'ＫＡＵＦ'` (full-width) → `'kauf'`; `''` → `''`.

**`buildVendorIndex(vendors, aliases): VendorIndex`** — straightforward; aliases whose vendor is missing are ignored.

**`resolveVendor(raw: string, index: VendorIndex): Vendor | null`** — exact key match (name or alias) or null.
Tests: matches on name, on alias, case/whitespace-insensitive, returns null for unknown or blank.

**`suggestVendors(query: string, index: VendorIndex, limit = 6): VendorSuggestion[]`**
- Blank query → `[]`. Exact key match on a **name** → `[]` (nothing left to suggest; the input already holds it).
- Score (lower is better): name starts with query `0`; a *word* of the name starts with query `1`; name contains `2`; alias starts with `3`; alias word starts `4`; alias contains `5`. One entry per vendor (best score); tie-break by `name.localeCompare(other, 'bg')`.
- Tests: `'ka'` ranks `Kaufland` (0) above `Billa` with alias `'kaufland stara'`… (3); `'land'` → Kaufland via contains (2); `'кауф'` → Kaufland via Cyrillic alias with `matchedAlias` set; limit respected; exact name match yields `[]`; query `'Kaufland '` (trailing space) still yields `[]`.

**`parseUniqueViolation(err: unknown): { constraint: string | null; aliasKey: string | null } | null`**
Supabase surfaces Postgres `23505` as `{ code: '23505', details: 'Key (household_id, alias_key)=(…uuid…, kaufland) already exists.', message: 'duplicate key value violates unique constraint "vendor_aliases_household_id_alias_key_key"' }`. Return `null` unless `code === '23505'`; extract the constraint name from `message` and the last value in the `details` tuple. Tests use exactly that fixture plus a non-23505 error and a malformed `details`.

**`describeConflict(attemptedAlias, aliasKey, index): AliasConflict | null`** — looks the key up in `index.byKey`.

**`ensureVendorForMerchant(input: { householdId; merchant: string; index: VendorIndex }, deps = { createVendor, refreshVendors }): Promise<{ name: string; vendorId: string; created: boolean }>`**
1. `resolveVendor` → return its `name` (this is what gets written to `transactions.merchant`).
2. Else `createVendor({ householdId, name: merchant.trim() })`. On `23505` (race: the other phone just created it, or the name equals an existing alias) → `refreshVendors` and resolve again; if still null, fall back to `{ name: merchant.trim(), vendorId: '', created: false }` — **saving the transaction must never be blocked by vendor bookkeeping.**
Tests with injected deps: hit, create, race-then-hit, race-then-fallback.

**`shouldLearnAlias(rawExtracted: string, finalName: string, index: VendorIndex): boolean`**
`true` only when `rawExtracted` is non-blank, `merchantKey(rawExtracted) !== merchantKey(finalName)`, and `index.byKey` has no entry for it. Tests for each branch.

### 6.4 API (`features/vendors/api.ts`)

Explicit column lists (never `select('*')`), `{ error } → throw`, exactly like `features/transactions/api.ts`.

```ts
listVendors(householdId): Promise<Vendor[]>                        // name asc
listAliases(householdId): Promise<VendorAlias[]>                   // alias asc
createVendor({ householdId, name }): Promise<{ id: string }>       // returns id via .select('id').single()
renameVendor(id, name): Promise<void>
deleteVendor(id): Promise<void>
addAlias({ householdId, vendorId, alias, source }): Promise<void>
removeAlias(id): Promise<void>                                     // caller must refuse is_primary rows
moveAlias(id, toVendorId): Promise<void>                           // update vendor_id (non-primary only)
mergeVendors(sourceId, targetId): Promise<void>                    // supabase.rpc('merge_vendors', { p_source, p_target })
```

### 6.5 Store & sync

`useVendorsStore`: `{ vendors, aliases, loaded, setData(vendors, aliases), reset() }`.
Export a hook `useVendorIndex()` = `useMemo(() => buildVendorIndex(vendors, aliases), [vendors, aliases])`.
`sync.ts`: two channels (`vendors`, `vendor_aliases`) → one debounced `refreshVendors`.

### 6.6 `VendorAutocomplete` component

```ts
interface VendorAutocompleteProps {
  value: string;
  onChangeText: (text: string) => void;
  onSelect?: (vendor: Vendor) => void;          // fires after the text is replaced by vendor.name
  placeholder?: string;
  autoFocus?: boolean;
  excludeVendorId?: string;                     // settings: don't suggest the vendor being edited
  variant?: 'field' | 'headline';               // manual-entry body-lg vs confirm-receipt headline-lg-mobile
  error?: string;
}
```

Behaviour:
- Plain `TextInput` styled per `variant` (copy the existing class names from the two screens so
  nothing visually shifts). Suggestions come from `suggestVendors(value, index)` — synchronous,
  no debounce needed (in-memory).
- The list renders **in flow below the input** (not absolutely positioned) so it pushes content
  down and never fights the scroll view's z-order. Wrapper: `Animated.View layout={rowLayout}`;
  the list itself `entering={FadeInDown.duration(120)} exiting={listExiting}`; each row
  `entering={rowEntering}`. Show only while focused **and** there is ≥ 1 suggestion.
- Row: `h-11`, `px-2`, vendor name in `font-inter text-body-lg text-on-surface` with the matched
  substring in `text-primary-container`; when `matchedAlias` is set, a second line
  `font-inter text-label-md text-on-surface-variant opacity-60` → `чрез „{alias}"`. If the
  vendor has loyalty cards (`useLoyaltyStore`, feature 2 — leave a `cardCount` prop hook in
  place, 0 until phase 2) show a `card-membership` 16 px icon on the right.
- Tap → `onChangeText(vendor.name)`, `onSelect?.(vendor)`, `haptics.select()`, list hides;
  the keyboard stays open. Parent scroll views already use `keyboardShouldPersistTaps="handled"`
  — required, keep it.
- Max 6 rows, hairline dividers, `active:bg-white/5`.

### 6.7 Entry-screen integration

**`app/manual-entry.tsx`**
- Replace the merchant `TextInput` inside `FieldRow` with `<VendorAutocomplete variant="field" …/>`.
- In `onSave`, after `parseManualEntry` succeeds and before the insert/update:
  `const { name } = await ensureVendorForMerchant({ householdId, merchant: parsed.data.merchant, index })`
  and write `name` as the merchant. Wrap in try/catch → on failure use the typed text (non-fatal).
- Category guessing keeps using the final name.

**`app/confirm-receipt.tsx`**
- Keep the raw Gemini merchant in a new `extractedMerchant` state, set once in `runExtraction`.
- Merchant input → `<VendorAutocomplete variant="headline" …/>`.
- In `onSave`: `ensureVendorForMerchant` as above; after the transaction is saved (inside the
  existing non-fatal block) `if (shouldLearnAlias(extractedMerchant, name, index)) await addAlias({ householdId, vendorId, alias: extractedMerchant, source: 'receipt' }).catch(() => {})`.
  A `23505` here means the other phone learned it first, or the raw string already maps
  elsewhere — silently skip, never surface the conflict sheet mid-save.

**`services/dsk-import.ts`**
```ts
export type MerchantLookup = (key: string) => string | undefined;   // key → vendor name
export function normalizeMerchant(raw: string, lookup?: MerchantLookup): string {
  const cleaned = cleanMerchant(raw);
  const hit = lookup?.(merchantKey(cleaned));          // household knowledge beats static rules
  if (hit) return hit;
  …existing BRAND_RULES / stripCardAcceptor path unchanged…
}
```
Thread the optional `lookup` through `normalizeDskRow` / `normalizeEbTransaction` (defaulted to
`undefined` so every existing test passes unchanged); `app/import-dsk.tsx` passes
`(key) => index.byKey.get(key)?.vendor.name`. Add two tests: lookup hit wins over a brand rule;
no lookup → identical to before. Also try the lookup on the *stripped* result
(`stripCardAcceptor(cleaned)`) as a second chance before returning it. This partially resolves
code-review finding #9 (merchant knowledge split across lists) — note that in the docs phase.

### 6.8 Settings screens

**`app/vendors.tsx`** (pattern: `app/categories.tsx`)
- Top bar "Търговци", `FlatInput` search (filters by `suggestVendors`-style contains on name and
  aliases; empty query → all vendors alphabetically).
- Row: name (`body-lg`), meta line `N разпознати имена · M карти · списък` (omit zero parts),
  chevron. Tap → `/vendor/[id]`. Rows are `Animated.View layout={rowLayout}` so search
  filtering animates.
- Bottom: "Нов търговец" link row (same as "Нова категория") → `BottomSheet` with a
  `FlatInput` and `SheetActions` [Запази][Отказ]. A `23505` on create → open
  `VendorConflictSheet` with the conflict (the typed name is someone's alias).
- Empty state via `EmptyState` (`storefront` icon): "Няма търговци още" / "Появяват се
  автоматично при записване на транзакции."

**`app/vendor/[id].tsx`**
- Header: back arrow + vendor name; tapping the name (or an `edit` icon) opens a rename sheet
  (`FlatInput` prefilled, [Запази][Отказ]). `23505` → conflict sheet.
- Section "Разпознати имена" — `SectionLabel`; one `AliasRow` per non-primary alias
  (`alias` text, small `source` tag "от бележка" when `receipt`, delete icon in `error`).
  Delete → `ConfirmSheet` ("Премахване на „x"?", message "Това име вече няма да се
  разпознава автоматично."). Rows animate in/out with `rowEntering` / `rowExiting` / `rowLayout`.
- Inline add: a `FlatInput` "Добави име…" + `add` icon; submitting calls `addAlias`; on
  `23505` → `VendorConflictSheet`. If the key equals the vendor's own name or an existing own
  alias → tiny inline hint "Вече е добавено" (no request).
- Section "Клиентски карти" — the vendor's cards as `CardTile`s (phase 2; render nothing until
  then) + "Добави карта". Section "Списък за пазаруване" — link to the list if one exists.
- `FloatingActionBar` single destructive action "Изтрий" → `ConfirmSheet` with a message
  computed from the counts: "Разпознатите имена (N) се изтриват. Картите и списъкът
  остават без търговец." → `deleteVendor` → `router.back()`.

### 6.9 `VendorConflictSheet` — the conflict flow

Opened whenever adding a recognized name (or creating/renaming a vendor) hits `23505`.

Props: `{ visible, conflict: AliasConflict | null, editingVendor: Vendor /* the one the user was working on */, onResolved: () => void, onClose }`.

Layout inside `BottomSheet`:
1. Title `headline-md`: "Името вече се използва".
2. Message `body-md`: „{attemptedAlias}" вече принадлежи на **{owner.name}**. Избери как да продължиш:
3. Two summary blocks side by side (flat, hairline-separated): each vendor's name, `N имена`,
   `M карти`, `списък ✓/–`. Left = **{owner}**, right = **{editingVendor}**.
4. A selectable option list (radio behaviour: tap selects, `check` icon in `primary-container`
   on the active row, `haptics.select()`):

   | key | label | description | availability |
   |---|---|---|---|
   | `merge` | Обедини „{owner}" в „{editing}" *(препоръчано, default-selected)* | Всички имена, карти и списъкът на „{owner}" минават към „{editing}". | always |
   | `move` | Премести само това име | Само „{attemptedAlias}" минава към „{editing}". | only when `ownerAlias.is_primary === false` |
   | `deleteOwner` | Изтрий „{owner}" | Търговецът и всичките му разпознати имена се изтриват. Картите и списъкът остават без търговец. | always |
   | `deleteEditing` | Изтрий „{editing}" | same wording for the other side | always |
   | `deleteBoth` | Изтрий и двата | Двата търговеца и всичките им имена се изтриват. | always |

   The three delete options are exactly what the user asked for; `merge` and `move` are the
   non-destructive additions. Keep all five; the first is pre-selected.
5. `SheetActions` [Потвърди (filled; `destructive` variant when a delete option is selected)][Отказ].

Confirm handlers (all `await`, `loading` on the pill, `refreshVendors` after, then `onResolved`):
- `merge` → `mergeVendors(owner.id, editing.id)`, then retry the original `addAlias`
  (it now succeeds because the key moved with the merge; if it was the owner's *primary* the
  key already belongs to `editing`, so skip the retry when `index.byKey.get(key)?.vendor.id === editing.id`).
- `move` → `moveAlias(ownerAlias.id, editing.id)`.
- `deleteOwner` → `deleteVendor(owner.id)` then retry the original `addAlias`.
- `deleteEditing` → `deleteVendor(editing.id)`, `router.back()` if we are on its detail screen.
- `deleteBoth` → both deletes; `router.back()` likewise.

Errors → `haptics.error()` + inline `text-error` line under the options; the sheet stays open.

---

## 7. Feature 2 — Loyalty cards

### 7.1 Files

| File | Responsibility |
|---|---|
| `lib/barcode/types.ts` | `BarcodeFormat = 'ean13' \| 'ean8' \| 'code128' \| 'qr'`; `Modules = boolean[]` (true = bar). |
| `lib/barcode/ean.ts` (+test) | `eanCheckDigit`, `isValidEan13`, `isValidEan8`, `upcAToEan13`, `encodeEan13`, `encodeEan8`. |
| `lib/barcode/code128.ts` (+test) | `encodeCode128`. |
| `lib/barcode/index.ts` | `encodeBarcode(value, format): Modules \| null` dispatcher (qr → null). |
| `components/Barcode.tsx` | SVG renderer (EAN/Code128 → `Rect` runs; QR → `react-native-qrcode-svg`); text fallback. |
| `features/loyalty/types.ts` | `LoyaltyCard`. |
| `features/loyalty/format.ts` (+test) | `detectCodeFormat(raw)`, `normalizeCode(raw, format)`, `displayCode(code, format)`. |
| `features/loyalty/api.ts` | The ONLY module touching `loyalty_cards`. |
| `features/loyalty/store.ts` / `sync.ts` | `useLoyaltyStore { cards, loaded }`, `useLoyaltySync()`, selectors `cardsForVendor(vendorId)`. |
| `features/loyalty/useBrightnessBoost.ts` | Max brightness while a presenter is focused; restore on blur/background. |
| `features/loyalty/components/CardTile.tsx` | Tile in grids/lists: color block, vendor, nickname, masked code. |
| `features/loyalty/components/CardChip.tsx` | Compact pill for list headers: `card-membership` icon + nickname. |
| `features/loyalty/components/CardFormSheet.tsx` | Add/edit sheet: vendor autocomplete, nickname, code + format, color, note, scan button. |
| `features/loyalty/components/BarcodeScannerModal.tsx` | Full-screen `expo-camera` scanner returning `{ code, format }`. |
| `features/loyalty/components/CardPickerSheet.tsx` | Choose one of several cards (used by lists). |
| `app/loyalty-cards.tsx` | All cards grouped by vendor + "Без търговец". |
| `app/card/[id].tsx` | Full-screen presenter. |
| **Modified** `app/(app)/index.tsx` | Dashboard top bar: `card-membership` icon button → `/loyalty-cards`. |
| **Modified** `app/vendor/[id].tsx` | Cards section from §6.8 now renders. |

### 7.2 Barcode encoders (pure, tested)

**EAN** (`lib/barcode/ean.ts`)
- `eanCheckDigit(payload: string): number` — payload of 12 (EAN-13) or 7 (EAN-8) digits;
  weights 1/3 from the **right**; `(10 - sum % 10) % 10`.
- `isValidEan13(code)`: 13 digits and check matches. `isValidEan8(code)`: 8 digits likewise.
- `upcAToEan13(code)`: 12 valid UPC-A digits → `'0' + code`.
- `encodeEan13(code): Modules | null` — 95 modules: guard `101`, six left digits (L/G parity
  chosen by the first digit), center `01010`, six right digits (R), guard `101`.
- `encodeEan8(code): Modules | null` — 67 modules: `101`, 4×L, `01010`, 4×R, `101`.
- Tests (known-good public examples): `isValidEan13('5901234123457') === true`,
  `'5901234123458'` false, `'4006381333931'` true; `eanCheckDigit('590123412345') === 7`;
  `encodeEan13('5901234123457')` has length 95, starts `[1,0,1]`, ends `[1,0,1]`, and has
  every 7-module digit block contains exactly two bar runs (sanity); `upcAToEan13('036000291452') === '0036000291452'` and is valid; `encodeEan8('96385074')` length 67 and valid check.

**Code128** (`lib/barcode/code128.ts`)
- Input: printable ASCII 32–126 (else return `null`). Subset **C** when the whole value is an
  even count of digits, otherwise subset **B** with a mid-stream switch to C for any run of
  ≥ 4 digits (even-length portion). Checksum `(start + Σ value_i × i) mod 103`. Stop pattern
  `2331112` (13 modules). The 107-entry width table is data; transcribe it carefully from the
  standard and cover it with the tests below rather than trusting eyeballing.
- Tests: `encodeCode128('ABC')` — checksum value 1 (`(104 + 33·1 + 34·2 + 35·3) mod 103`),
  total length `5 × 11 + 13 = 68`, first 11 modules equal Start B (`11010010000`), last 13
  equal Stop; `encodeCode128('1234')` uses Start C → length `(1 + 2 + 1) × 11 + 13 = 57`;
  `encodeCode128('AB1234CD')` switches to C in the middle and back; `encodeCode128('é')` →
  `null`; every symbol in the table sums to 11 modules (table self-check test); an empty
  string → `null`.

`encodeBarcode(value, format)` dispatches; `'qr'` returns `null` (handled by the renderer).

### 7.3 `components/Barcode.tsx`

```ts
interface BarcodeProps { value: string; format: BarcodeFormat; height?: number /* 96 */; width?: number /* container width, from onLayout */; }
```
- EAN/Code128: `moduleWidth = Math.floor(width / modules.length)` (min 2, so it stays
  scannable); merge consecutive bars into one `Rect` each; `Svg` centered on a **white**
  `rounded-xl` surface with 16 px quiet zone on both sides. Black bars. This white surface is
  a deliberate, documented exception to the dark design — scanners need it.
- QR: `<QRCode value size={Math.min(width, height * 2)} />` on the same white surface.
- Encoder returns `null` → render the code as `font-inter-semibold text-headline-md` on the
  white surface plus `Невалиден код` in `label-md` under it. **Never throw.**

### 7.4 Code formats (`features/loyalty/format.ts`)

- `detectCodeFormat(raw): { code: string; format: BarcodeFormat }` — strip spaces; 13 digits +
  valid → `ean13`; 12 digits valid UPC-A → `ean13` with the leading `0`; 8 digits valid →
  `ean8`; all printable ASCII → `code128`; anything else → `qr`.
- `normalizeCode(raw, format)`: digits-only for EAN, trimmed otherwise.
- `displayCode(code, format)`: EAN-13 → `5 901234 123457`; others unchanged.
- Camera scanner type mapping: expo `ean13`→`ean13`, `ean8`→`ean8`, `upc_a`→`ean13` via
  `upcAToEan13`, `code128`→`code128`, `qr`→`qr`; anything else → treat the raw data with
  `detectCodeFormat`.
- Tests for each branch, including a 13-digit string with a bad checksum → `code128`.

### 7.5 API / store / sync

```ts
listCards(householdId): Promise<LoyaltyCard[]>                   // vendor_id, nickname asc
createCard(input: { householdId; vendorId: string | null; nickname; code; codeFormat; color; note: string | null; createdBy }): Promise<{ id }>
updateCard(id, patch: same minus householdId/createdBy): Promise<void>
deleteCard(id): Promise<void>
```
`unique (household_id, vendor_id, nickname)` violation → inline error "Вече има карта с този
прякор за този търговец." `useLoyaltySync()` on the single `loyalty_cards` channel.

### 7.6 Screens & components

**`CardFormSheet`** (`BottomSheet`, `KeyboardAwareScrollView` inside because it has 5 fields)
- Fields, in order: vendor (`VendorAutocomplete variant="field"`, may be blank → orphan card
  under "Без търговец"; typing a new name creates the vendor via `ensureVendorForMerchant`);
  nickname (`FlatInput`, **prefilled with the current member's display name** from
  `useAuthStore` on create); code row = `FlatInput` (`keyboardType` `number-pad` when format is
  EAN) + a ghost pill "Сканирай" (`qr-code-scanner` icon) → `BarcodeScannerModal`; format as
  `SegmentedToggle` [EAN][Code128][QR] auto-set by `detectCodeFormat` whenever the code changes
  and not yet touched manually; color swatches (reuse `COLOR_CHOICES` from `app/categories.tsx`
  — extract them to `lib/palette.ts` so both screens share; **never** the lime accent); note.
- Live preview: a `Barcode` of the current code/format above the actions so the user sees it
  render before saving.
- `SheetActions` [Запази][Отказ]; edit mode adds a third `destructive` "Изтрий" that opens
  `ConfirmSheet` ("Изтриване на картата „{nickname}"?", "Списъците, които я използват, остават
  без карта.").

**`BarcodeScannerModal`** — RN `Modal` (full screen, `animationType="fade"`) with
`CameraView` (`facing="back"`, `barcodeScannerSettings={{ barcodeTypes: ['ean13','ean8','upc_a','code128','qr'] }}`),
a dim overlay with a centered 280×160 clear window and a hairline frame, a close `X` top-right,
and "Насочи камерата към баркода на картата" at the bottom. First `onBarcodeScanned` →
`haptics.success()`, ignore further events (`scannedRef`), return `{ code, format }` and close.
Permission via `useCameraPermissions`; denied → in-modal message "Няма достъп до камерата" +
"Отвори настройките" (`Linking.openSettings()`) + close. Web/unsupported → the scan pill is
hidden.

**`CardTile`** — `rounded-2xl` tile, background = `color` at 15 % (`${color}26`), 1 px border
`rgba(255,255,255,0.05)`, no shadow (flat design): vendor name `headline-md` in `color`,
nickname `body-md on-surface`, masked code `label-md on-surface-variant` (`•••• 3457`), a
`card-membership` icon. Press → presenter. Long-press → edit sheet. `active:opacity-80`.

**`app/loyalty-cards.tsx`**
- Tiles in a 2-column wrap (`flex-row flex-wrap gap-md`), grouped under `SectionLabel`
  per vendor (alphabetical), "Без търговец" last. Tiles `entering={rowEntering}` `layout={rowLayout}`.
- `FloatingActionBar` single filled "Нова карта" (`add-card`) → `CardFormSheet`.
- `EmptyState` (`card-membership`): "Няма клиентски карти" / "Добави карта и я показвай на касата с едно докосване."

**`app/card/[id].tsx` — presenter**
- `useBrightnessBoost()`: on focus `getBrightnessAsync()` → remember → `setBrightnessAsync(1)`;
  restore on blur/unmount **and** on `AppState` `background` (re-apply on `active`). Android
  changes only the app window brightness (no permission); iOS changes the system value, hence
  the strict restore.
- Layout: dark screen, close `X`, vendor name `headline-lg-mobile`, nickname `body-md`
  `on-surface-variant`, then the `Barcode` (height 120, width = screen − 48) on its white
  surface, then `displayCode` in `font-inter-semibold text-headline-md` with a copy icon
  (`expo-clipboard` is installed) → `haptics.tap()` + "Копирано" toast-like fade text.
- If the card's vendor has other cards, a row of small pills below switches between them
  (nickname; active = `primary-container`), so the user can flip cards without leaving the
  screen. Entering `FadeIn`, barcode swaps with `FadeOut/FadeIn` (120 ms).
- Bottom ghost pill "Редактирай" → `CardFormSheet`.

**Dashboard** — add an icon button (40 px circle, `bg-surface-container`, `card-membership`
22 px `#c4c6d0`) at the right end of the dashboard's title row, `router.push('/loyalty-cards')`.

**`CardPickerSheet`** — `BottomSheet` titled "Коя карта?"; one row per card (`CardChip` style
+ masked code); `onSelect(cardId | null)` with a last row "Без карта".

---

## 8. Feature 3 — Shopping lists

### 8.1 Files

| File | Responsibility |
|---|---|
| `features/shopping/types.ts` | `ShoppingList`, `ShoppingListItem`, `ShoppingListView` (list + counts + vendor + card). |
| `features/shopping/api.ts` | The ONLY module touching `shopping_lists` / `shopping_list_items`. |
| `features/shopping/store.ts` / `sync.ts` | `useShoppingStore { lists, items, loaded }`; optimistic mutators; `useShoppingSync()` on two channels. |
| `features/shopping/order.ts` (+test) | `splitItems`, `nextPosition`, `listCounts`, `sortLists`. |
| `features/shopping/quickAdd.ts` (+test) | `parseQuickAdd(text)` → `{ name, quantity }`. |
| `features/shopping/components/ListRow.tsx` | Row for the index + dashboard: vendor, `N за вземане`, card chip. |
| `features/shopping/components/ItemRow.tsx` | The animated check row (§8.5). |
| `features/shopping/components/QuickAddBar.tsx` | Keyboard-sticky input at the bottom of a list. |
| `features/shopping/components/ListProgress.tsx` | `3 / 8` + animated hairline progress bar. |
| `features/shopping/components/NewListSheet.tsx` | Vendor autocomplete → card auto/pick → create or open. |
| `features/shopping/components/ListMenuSheet.tsx` | Смени картата · Изчисти взетите · Изтрий списъка. |
| `app/lists.tsx` | All lists. |
| `app/list/[id].tsx` | One list. |
| **Modified** `features/preferences/types.ts`, `layout.ts` (+test) | `DashboardSectionKey` gains `'lists'`. |
| **Modified** `app/(app)/index.tsx` | Renders the `lists` section. |
| **Modified** `features/preferences/components/SectionLayoutEditor.tsx` | `LABELS.lists = 'Списъци'`. |
| **Modified** `app/vendor/[id].tsx` | "Списък за пазаруване" link. |

### 8.2 Pure logic (tests first)

- `splitItems(items, settlingIds: ReadonlySet<string>): { open: Item[]; done: Item[] }` — an
  item is `done` iff `checked_at !== null` **and** its id is not in `settlingIds`; `open` keeps
  `position` order; `done` is ordered by `checked_at` desc (most recently taken on top).
- `nextPosition(items): number` — `max(position) + 1`, `0` for empty.
- `listCounts(items): { total; open; done }`.
- `sortLists(lists, items)`: lists with open items first (by `updated_at` desc), then fully
  done lists (by `updated_at` desc), then empty lists.
- `parseQuickAdd(text)`: trims; recognises a trailing quantity `x2` / `×2` / `* 2` / `2x` and
  a leading count `2 мляко` / `2x мляко` / `2бр мляко`; otherwise `quantity: null`. Tests:
  `'мляко x2'` → `{ name: 'мляко', quantity: '2' }`; `'2 кисело мляко'` → `{ 'кисело мляко', '2' }`;
  `'хляб'` → `{ 'хляб', null }`; `'  '` → `null`; `'1.5 кг картофи'` → `{ 'кг картофи', '1.5' }`.

### 8.3 API

```ts
listLists(householdId): Promise<ShoppingList[]>
listItems(householdId): Promise<ShoppingListItem[]>              // all items of the household (tiny)
createList({ householdId, vendorId, name, loyaltyCardId, createdBy }): Promise<{ id }>
updateListCard(id, loyaltyCardId: string | null): Promise<void>
deleteList(id): Promise<void>
addItem({ householdId, listId, name, quantity, position, createdBy }): Promise<{ id }>
setItemChecked(id, checked: boolean, userId: string | null): Promise<void>   // checked_at = now()/null, checked_by
updateItem(id, patch: { name; quantity }): Promise<void>
deleteItem(id): Promise<void>
clearChecked(listId): Promise<void>                              // delete where checked_at is not null
```
`createList` `23505` on the one-per-vendor index → the caller opens the existing list instead.

### 8.4 Store — optimistic mutators

The store holds server rows plus these mutators, each of which **updates local state first,
then calls the API, and reverts + `haptics.error()` on failure** (pattern: `updatePreferences`
in `profile.tsx`):

- `toggleItem(id, checked, userId)` — sets `checked_at` to `new Date().toISOString()` / `null`.
- `addItemOptimistic(draft)` — inserts a temp row with id `tmp-<Date.now()>`; on success the
  next refetch replaces it (match by `tmp` prefix removal is unnecessary: the debounced
  refetch returns the real row and `setData` replaces the array).
- `removeItemOptimistic(id)`.
- `clearCheckedOptimistic(listId)`.

The realtime refetch (400 ms debounce) never fights these: our own write lands before its
change event, so the refetch returns what we already show.

### 8.5 `ItemRow` — the satisfying check

Structure: `Animated.View layout={rowLayout} entering={rowEntering} exiting={rowExiting}` →
`ReanimatedSwipeable` (from `react-native-gesture-handler/ReanimatedSwipeable`; right action =
`error-container` area with a `delete` icon, `overshootRight={false}`, swipe past 96 px deletes)
→ `Pressable` row `h-14 px-2 flex-row items-center gap-md`.

**Checkbox** (`24 × 24`, `rounded-full`, `borderWidth 1.5`, `outline-variant`):
- Shared values `progress` (0→1 checked) and `pop`.
- On check: `pop.value = withSequence(withTiming(1.18, { duration: 90 }), withSpring(1, SPRING_POP))`,
  `progress.value = withSpring(1, SPRING_POP)`.
- Animated style: `transform: [{ scale: pop }]`, `backgroundColor: interpolateColor(progress, [0,1], ['transparent', '#adc7ff'])`,
  `borderColor: interpolateColor(progress, [0,1], ['#44474f', '#adc7ff'])`.
- Check glyph (`MaterialIcons check` 16 px `#112f5e`): `opacity: progress`,
  `transform: [{ scale: interpolate(progress, [0, 0.5, 1], [0.4, 1.15, 1]) }]`.
- On uncheck: `progress.value = withTiming(0, TIMING_FAST)`, no pop.
- The checkbox colour is **`primary-container`**, never the lime anomaly accent.

**Label**: name `font-inter text-body-lg`, quantity as a trailing `label-md on-surface-variant`
chip when present. Text `opacity` animates `1 → 0.45`. A strike-through is a 1.5 px
`on-surface-variant` `View` overlaid at the text's vertical centre whose `width` animates
`0 → measuredTextWidth` (`onLayout`) over 180 ms on check and back to 0 on uncheck.

**Haptics + sequencing** (in `app/list/[id].tsx`, not the row):
1. Tap → `haptics.tap()` → `toggleItem(id, true, userId)` (DB write immediately) → add id to
   `settling` (local `useState<Set<string>>`) and start a 450 ms timer; when it fires, remove
   the id from `settling` → `splitItems` regroups → the layout transition slides the row down
   into "Взети" while the row below springs up into its place.
2. Tap again while settling → clear the timer, `toggleItem(id, false)`, remove from `settling`.
3. When `listCounts(open) === 0` after a check (i.e. the last one) → `haptics.success()` and
   `ListProgress` shows "Всичко е взето" with a `FadeIn`; the progress bar fills to 100 %.
4. Tapping a row in "Взети" unchecks it: `haptics.select()`, row springs back up into the open
   group (no settle delay).
5. Timers live in a `useRef<Map<string, ReturnType<typeof setTimeout>>>`; clear all on unmount.

**Long-press** on the label → inline edit sheet (`FlatInput` name + quantity, [Запази][Отказ]).

### 8.6 `QuickAddBar`

`KeyboardStickyView` (from `react-native-keyboard-controller`, `offset={{ closed: 0, opened: 0 }}`)
pinned at the bottom, `bg-surface-container` with a top hairline, `SafeAreaView edges={['bottom']}`.
Inside: `add` icon, `TextInput` (`placeholder "Добави продукт…"`, `returnKeyType="done"`,
`submitBehavior="submit"` so the keyboard stays), a filled round `arrow-upward` button that
is disabled while blank. Submit → `parseQuickAdd` → `addItemOptimistic` → `haptics.tap()` →
clear the input, keep focus. The new row enters with `rowEntering` at the bottom of the open
group; the scroll view scrolls to end (`scrollToEnd({ animated: true })`).

### 8.7 `app/list/[id].tsx`

- Not `Screen` (it needs a custom bottom): `View bg-background` + `BackgroundGlow` +
  `SafeAreaView top` (pattern: `app/manual-entry.tsx`).
- Top bar: back arrow · vendor name (`headline-lg-mobile`) · `more-vert` → `ListMenuSheet`.
- Under the title: `ListProgress` (left "3 / 8" in `data-mono`, right a 2 px track
  `outline-variant` with an `Animated.View` fill in `primary-container` whose width springs to
  `done / total`), then the card row:
  - list has a card → `CardChip` (nickname + `•••• 3457`) → tap opens `/card/[id]`.
  - vendor has cards but the list has none → ghost chip "Избери карта" → `CardPickerSheet`.
  - vendor has no cards → ghost chip "Добави карта" → `CardFormSheet` prefilled with the vendor.
- Body: `KeyboardAwareScrollView` (`bottomOffset` = quick-add height + 16,
  `keyboardShouldPersistTaps="handled"`) → open rows → `SectionLabel` "Взети (N)" (only when N>0,
  `entering FadeIn`) → done rows. Empty list → `EmptyState` (`shopping-cart`): "Списъкът е
  празен" / "Добави първия продукт отдолу."
- `QuickAddBar` at the bottom.
- `ListMenuSheet` rows: "Смени картата" (→ `CardPickerSheet`), "Изчисти взетите"
  (`ConfirmSheet` when N>0; `clearCheckedOptimistic`; done rows exit with `rowExiting` staggered
  by 30 ms via `.delay(i * 30)`), "Изтрий списъка" (destructive, `ConfirmSheet` → `deleteList`
  → `router.back()`).
- Missing list (deleted on the other phone) → the same "not found" fallback markup as
  `app/transaction/[id].tsx`.

### 8.8 `app/lists.tsx` and `NewListSheet`

- `Screen` with `FloatingActionBar` single filled "Нов списък" (`playlist-add`).
- Rows via `ListRow`: vendor name `headline-md`, meta `N за вземане` / `Готово` / `Празен`,
  `CardChip` (compact, icon only) when a card is attached, chevron; `layout={rowLayout}`;
  sorted by `sortLists`. Empty state (`checklist`): "Няма списъци" / "Създай списък за магазин и
  го отмятай на място."
- `NewListSheet`: `BottomSheet` → `VendorAutocomplete` (autoFocus) → [Продължи][Отказ].
  On continue:
  1. `ensureVendorForMerchant` (creates the vendor when new).
  2. If a list exists for that vendor → close and `router.push('/list/[id]')` (decision #8).
  3. Cards for the vendor: 0 → `loyaltyCardId = null`; 1 → that card; ≥ 2 → swap the sheet
     content to the picker (same `BottomSheet`, content crossfades) and wait for a choice.
  4. `createList({ vendorId, name: vendor.name, loyaltyCardId, … })` → `haptics.success()` →
     `router.push('/list/[id]')`.

### 8.9 Dashboard section `lists`

- `features/preferences/types.ts`: `DashboardSectionKey = 'categories' | 'recent' | 'lists'`.
  `layout.ts`: add `'lists'` to `KNOWN_KEYS` and `DEFAULT_DASHBOARD_SECTIONS` (last, visible).
  Existing stored preferences get it appended automatically by `resolveDashboardSections` —
  add a test asserting a stored `[categories, recent]` resolves to three sections with `lists`
  last and visible.
- `app/(app)/index.tsx`: render the section in the configurable block: `SectionLabel`
  "Списъци за пазаруване" + up to 3 `ListRow`s (`sortLists`, only lists with open items first)
  + a "Виж всички" link row → `/lists`. When there are no lists, render a single quiet row
  "Създай списък за магазин" → `/lists` (opens the sheet via a `?new=1` param the screen reads once).
- `SectionLayoutEditor` label: `lists: 'Списъци'`.

---

## 9. Motion & feedback rules (apply everywhere in this slice)

- Every list of rows that can change membership uses `layout={rowLayout}` on each row, plus
  `rowEntering` / `rowExiting`. No `LayoutAnimation` from RN core.
- Springs, not linear easings, for anything that moves position; `TIMING_FAST` only for
  opacity/colour.
- Haptics: `tap` on check / add, `select` on picks and unchecks, `success` on "last item taken",
  card scanned, list created; `error` on any reverted optimistic write. Never more than one
  haptic per gesture.
- Reanimated worklet rules: never read `.value` in render; use `runOnJS` for JS callbacks
  inside worklets (see `BottomSheet.tsx` comments about keeping layout animations and
  `useAnimatedStyle` transforms on separate nodes — the checkbox `pop` transform lives on an
  inner view, the row's layout animation on the outer view).
- NativeWind `className` is not applied to third-party components (`Animated.View` from
  Reanimated **is** fine; `Svg`, `CameraView`, `BlurView`, `KeyboardStickyView` need `style`).

---

## 10. Copy (Bulgarian, matches the app's tone)

| Key | Text |
|---|---|
| vendors.title | Търговци |
| vendors.new | Нов търговец |
| vendors.search | Търси търговец… |
| vendors.empty.title / .message | Няма търговци още / Появяват се автоматично при записване на транзакции. |
| vendor.aliases | Разпознати имена |
| vendor.aliases.add | Добави име… |
| vendor.aliases.exists | Вече е добавено |
| vendor.aliases.remove.title | Премахване на „{alias}"? |
| vendor.aliases.remove.message | Това име вече няма да се разпознава автоматично. |
| vendor.aliases.source.receipt | от бележка |
| vendor.rename | Преименувай |
| vendor.delete | Изтрий |
| vendor.delete.message | Разпознатите имена ({n}) се изтриват. Картите и списъкът остават без търговец. |
| conflict.title | Името вече се използва |
| conflict.message | „{alias}" вече принадлежи на {owner}. Избери как да продължиш: |
| conflict.merge / .move / .deleteOwner / .deleteEditing / .deleteBoth | Обедини „{a}" в „{b}" / Премести само това име / Изтрий „{a}" / Изтрий „{b}" / Изтрий и двата |
| conflict.confirm | Потвърди |
| cards.title | Клиентски карти |
| cards.new | Нова карта |
| cards.empty.title / .message | Няма клиентски карти / Добави карта и я показвай на касата с едно докосване. |
| card.vendor / .nickname / .code / .format / .color / .note | Търговец / Прякор / Код / Формат / Цвят / Бележка |
| card.scan | Сканирай |
| card.nickname.taken | Вече има карта с този прякор за този търговец. |
| card.delete.title / .message | Изтриване на картата „{nickname}"? / Списъците, които я използват, остават без карта. |
| card.copied | Копирано |
| card.invalid | Невалиден код |
| scanner.hint | Насочи камерата към баркода на картата |
| scanner.denied / .openSettings | Няма достъп до камерата / Отвори настройките |
| noVendor | Без търговец |
| lists.title | Списъци за пазаруване |
| lists.new | Нов списък |
| lists.empty.title / .message | Няма списъци / Създай списък за магазин и го отмятай на място. |
| lists.meta.open / .done / .empty | {n} за вземане / Готово / Празен |
| list.quickAdd | Добави продукт… |
| list.done | Взети |
| list.allDone | Всичко е взето |
| list.empty.title / .message | Списъкът е празен / Добави първия продукт отдолу. |
| list.card.pick / .add / .change | Избери карта / Добави карта / Смени картата |
| list.card.none | Без карта |
| list.card.which | Коя карта? |
| list.clearDone | Изчисти взетите |
| list.clearDone.confirm | Премахване на {n} взети продукта? |
| list.delete / .delete.confirm | Изтрий списъка / Изтриване на списъка „{name}"? |
| list.new.continue | Продължи |
| dashboard.lists | Списъци за пазаруване |
| dashboard.lists.all / .create | Виж всички / Създай списък за магазин |

Existing strings that must not change: "Търговец" field label, "Ръчно"/"Скан" pills.

---

## 11. Implementation order & commits

Work phase by phase; each phase ends green on `npx tsc --noEmit`, `npm run lint`, `npm test`
and is one or a few conventional commits. Do not start phase N+1 with phase N red.

**Phase 0 — infra** (`chore:` / `refactor:`)
1. Add deps, `app.json` plugin, `jest.setup.ts` mocks.
2. `lib/haptics.ts`, `lib/animation.ts`, `lib/palette.ts` (extract `COLOR_CHOICES`).
3. `subscribeToHouseholdTable` refactor (existing tests still pass).

**Phase 1 — vendors** (`feat(vendors): …`)
4. Migration 4.1. Apply it.
5. `key.ts`, `resolve.ts`, `conflict.ts`, `ensure.ts`, `learn.ts` with tests (TDD).
6. `api.ts`, `store.ts`, `sync.ts`; mount `useVendorsSync`.
7. `VendorAutocomplete`; wire into manual-entry and confirm-receipt (+ alias learning).
8. `dsk-import` lookup + tests; wire in `import-dsk.tsx`.
9. `app/vendors.tsx`, `app/vendor/[id].tsx`, `VendorConflictSheet`; routes; profile link.

**Phase 2 — loyalty cards** (`feat(loyalty): …`)
10. `lib/barcode/*` with tests (TDD — table self-check test first).
11. Migration 4.2. Apply it.
12. `format.ts` + tests; `api/store/sync`; mount `useLoyaltySync`.
13. `Barcode`, `CardTile`, `CardChip`, `CardFormSheet`, `BarcodeScannerModal`, `CardPickerSheet`.
14. `app/loyalty-cards.tsx`, `app/card/[id].tsx` + `useBrightnessBoost`; dashboard icon;
    vendor detail cards section; autocomplete card indicator.

**Phase 3 — shopping lists** (`feat(shopping): …`)
15. Migration 4.3. Apply it.
16. `order.ts`, `quickAdd.ts` + tests; preferences `lists` key + test.
17. `api/store/sync` with optimistic mutators; mount `useShoppingSync`.
18. `ItemRow`, `QuickAddBar`, `ListProgress`, `ListRow`, `NewListSheet`, `ListMenuSheet`.
19. `app/list/[id].tsx`, `app/lists.tsx`; dashboard section; vendor detail link.

**Phase 4 — docs** (`docs:`)
20. `CLAUDE.md`: architecture tree (`features/vendors`, `features/loyalty`, `features/shopping`,
    `lib/barcode`, `lib/haptics.ts`, `lib/animation.ts`, new routes), core tables (§4.4), a
    new Non-Negotiable-adjacent note: "Barcode presenter is the one white surface in the app."
21. `README.md`: three feature bullets, screenshot placeholders (`assets/screenshots/cards.png`,
    `shopping-list.png`), dependency list.
22. `teftera-build-plan.md`: append "Day 19 — Vendors & recognized names", "Day 20 — Loyalty
    cards", "Day 21 — Shopping lists" with checked boxes and the checkpoints from §12.
23. `docs/code-review-2026-07-18.md` finding #9: add a note that household aliases now sit in
    front of the static table.

---

## 12. Verification

Automated (must be green before every commit):
```bash
npx tsc --noEmit && npm run lint && npm test
```
New test files expected: `key.test.ts`, `resolve.test.ts`, `conflict.test.ts`, `ensure.test.ts`,
`learn.test.ts`, `lib/barcode/ean.test.ts`, `lib/barcode/code128.test.ts`, `format.test.ts`,
`order.test.ts`, `quickAdd.test.ts`, plus updated `dsk-import.test.ts` and `layout.test.ts`.

On-device checkpoints (the owner runs these; list them in the build plan):

**Vendors**
- Type "ka" in manual entry → Kaufland suggested; pick it; save → transaction merchant is
  "Kaufland". Type a brand-new name → save → it appears under Профил → Търговци.
- Scan a receipt whose raw merchant differs from the vendor picked → the raw string shows under
  that vendor's "Разпознати имена" with the "от бележка" tag; scanning the same store again
  pre-fills the vendor name (type the raw string in manual entry → it resolves).
- Add a recognized name that already belongs to another vendor → conflict sheet; each of the
  five options does what its description says; the other phone sees the result without a refresh.
- Rename a vendor to one of its own recognized names → succeeds, that alias row disappears.

**Loyalty cards**
- Add a card by scanning a real EAN-13 store card → format auto-detected, preview renders.
  Open the presenter; a supermarket scanner reads it (test at the till).
- Screen brightness maxes while presenting and restores after closing / backgrounding.
- Two cards on one vendor with the same nickname are rejected inline.
- Delete the vendor → cards move to "Без търговец"; edit one and re-attach a vendor.

**Shopping lists**
- Create "Kaufland" → its single card attaches automatically; a vendor with two cards asks.
- Add 5 items rapidly via the quick-add bar (keyboard stays up); check three: pop + haptic, row
  slides into "Взети" after a beat, the rows below spring up; check the last → success haptic +
  "Всичко е взето". Uncheck from "Взети" → springs back.
- Second phone: items appear/check within ~1 s; airplane mode on phone A → check → revert +
  error haptic.
- Swipe-to-delete an item; "Изчисти взетите"; "Изтрий списъка" → back on the index.
- Dashboard shows the list with "2 за вземане"; hide it via Начало → Подреди секциите.

---

## 13. Gotchas already learned in this codebase (don't rediscover them)

- `BottomSheet` renders inside a `Modal`, which is outside the root `GestureHandlerRootView`;
  the sheet already nests its own root — anything gesture-based inside a sheet (swipeables,
  pickers) works only because of that. Do not add another root.
- Never put a layout animation and a `useAnimatedStyle` transform on the same node
  (see the comment in `BottomSheet.tsx`).
- Realtime channel topics must be unique per subscription (`realtimeChannel.ts` doc comment);
  keep the `channelSeq` suffix in the generalized helper.
- `KeyboardAwareScrollView` needs `keyboardShouldPersistTaps="handled"` or autocomplete rows
  eat the first tap.
- Pills: `borderRadius: 9999` via style, or `rounded-full` (overridden to 9999 in
  `tailwind.config.js`). Action rows only through `SheetActions` / `FloatingActionBar`.
- `select('*')` is banned; list explicit columns.
- No `Alert.alert` for confirmations — `ConfirmSheet`. `Alert` stays only for the existing
  save-failure messages.
- The lime `#c3f400` family is the anomaly accent and nothing else — checkboxes, progress bars,
  and card colours use `primary-container` / the palette.
- Money never appears in this slice; if a later idea adds prices to items, it is integer cents
  through `formatCurrency` — not free text.
