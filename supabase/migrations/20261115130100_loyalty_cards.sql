-- Loyalty cards
-- Source: docs/specs/2026-09-09-vendors-loyalty-shopping-lists.md §4. Deviations
-- from the spec text: every function pins search_path = '' (all references are
-- schema-qualified), and cross-row foreign keys are checked to stay inside one
-- household (FKs bypass RLS, so without this a member could point a row at
-- another household's vendor / card / list).

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

-- ---------------------------------------------------------------------------
-- Household consistency: a card may only point at a vendor of its own
-- household. SECURITY INVOKER, so RLS hides other households' vendors and
-- the lookup simply finds nothing.
-- ---------------------------------------------------------------------------
create or replace function public.loyalty_cards_check_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.vendor_id is not null and not exists (
       select 1 from public.vendors v
       where v.id = new.vendor_id and v.household_id = new.household_id) then
    raise exception 'loyalty_cards.vendor_id must belong to the same household'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.loyalty_cards_check_household() from public;

create trigger loyalty_cards_check_household
  before insert or update of vendor_id, household_id on public.loyalty_cards
  for each row execute function public.loyalty_cards_check_household();
