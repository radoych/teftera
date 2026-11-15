-- Shopping lists + items
-- Source: docs/specs/2026-09-09-vendors-loyalty-shopping-lists.md §4. Deviations
-- from the spec text: every function pins search_path = '' (all references are
-- schema-qualified), and cross-row foreign keys are checked to stay inside one
-- household (FKs bypass RLS, so without this a member could point a row at
-- another household's vendor / card / list).

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
set search_path = ''
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
set search_path = ''
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

-- ---------------------------------------------------------------------------
-- Household consistency for list -> vendor / card and item -> list.
-- ---------------------------------------------------------------------------
create or replace function public.shopping_lists_check_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.vendor_id is not null and not exists (
       select 1 from public.vendors v
       where v.id = new.vendor_id and v.household_id = new.household_id) then
    raise exception 'shopping_lists.vendor_id must belong to the same household'
      using errcode = '23514';
  end if;
  if new.loyalty_card_id is not null and not exists (
       select 1 from public.loyalty_cards c
       where c.id = new.loyalty_card_id and c.household_id = new.household_id) then
    raise exception 'shopping_lists.loyalty_card_id must belong to the same household'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.shopping_lists_check_household() from public;

create trigger shopping_lists_check_household
  before insert or update of vendor_id, loyalty_card_id, household_id on public.shopping_lists
  for each row execute function public.shopping_lists_check_household();

create or replace function public.shopping_list_items_check_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
       select 1 from public.shopping_lists l
       where l.id = new.list_id and l.household_id = new.household_id) then
    raise exception 'shopping_list_items.list_id must belong to the same household'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.shopping_list_items_check_household() from public;

create trigger shopping_list_items_check_household
  before insert or update of list_id, household_id on public.shopping_list_items
  for each row execute function public.shopping_list_items_check_household();
