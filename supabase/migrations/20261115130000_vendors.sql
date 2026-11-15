-- Vendors + recognized names (aliases)
-- Source: docs/specs/2026-09-09-vendors-loyalty-shopping-lists.md §4. Deviations
-- from the spec text: every function pins search_path = '' (all references are
-- schema-qualified), and cross-row foreign keys are checked to stay inside one
-- household (FKs bypass RLS, so without this a member could point a row at
-- another household's vendor / card / list).

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
set search_path = ''
as $$
  select lower(normalize(regexp_replace(btrim(raw), '\s+', ' ', 'g'), NFKC));
$$;
revoke all on function private.merchant_key(text) from public;
grant execute on function private.merchant_key(text) to authenticated;

-- Generic updated_at bump, reused by loyalty_cards and shopping_lists.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
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
set search_path = ''
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
set search_path = ''
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
set search_path = ''
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
set search_path = ''
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
