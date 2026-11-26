-- Vendor default category
-- A vendor may carry a default category (e.g. Lidl -> Groceries). The client
-- applies it to NEW transactions whose merchant resolves to the vendor (an
-- explicit pick still wins; the default wins over the keyword rules). Existing
-- transactions are only touched on request, through vendor_recategorize().
--
-- Conventions as in 20261115130000_vendors.sql: search_path = '', every name
-- schema-qualified, SECURITY INVOKER (RLS applies to every statement), and the
-- new cross-row FK is checked to stay inside one household (FKs bypass RLS).

alter table public.vendors
  add column default_category_id uuid null
    references public.categories (id) on delete set null;

create index vendors_default_category_idx on public.vendors (default_category_id);

-- ---------------------------------------------------------------------------
-- Household consistency: the default category must belong to the vendor's own
-- household. SECURITY INVOKER, so RLS hides other households' categories and
-- the lookup simply finds nothing.
-- ---------------------------------------------------------------------------
create or replace function public.vendors_check_household()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.default_category_id is not null and not exists (
       select 1 from public.categories c
       where c.id = new.default_category_id and c.household_id = new.household_id) then
    raise exception 'vendors.default_category_id must belong to the same household'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.vendors_check_household() from public;

create trigger vendors_check_household
  before insert or update of default_category_id, household_id on public.vendors
  for each row execute function public.vendors_check_household();

-- ---------------------------------------------------------------------------
-- Recategorize existing transactions of a vendor to its default category.
-- Matches transactions whose merchant key is one of the vendor's recognized
-- names (incl. its own name, the primary alias) and whose kind equals the
-- default category's kind. p_dry_run = true only counts.
-- Returns 0 when the vendor has no default category.
--
-- SECURITY INVOKER: RLS on transactions / vendors / vendor_aliases / categories
-- still applies; the explicit household filters keep the statement scoped to
-- the vendor's household and the membership check gives a clear error.
-- ---------------------------------------------------------------------------
create or replace function public.vendor_recategorize(p_vendor uuid, p_dry_run boolean)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_house    uuid;
  v_category uuid;
  v_kind     text;
  v_count    integer;
begin
  select household_id, default_category_id into v_house, v_category
    from public.vendors where id = p_vendor;
  if v_house is null or not private.is_household_member(v_house) then
    raise exception 'vendor not found' using errcode = 'P0002';
  end if;
  if v_category is null then
    return 0;
  end if;
  select kind into v_kind
    from public.categories where id = v_category and household_id = v_house;
  if v_kind is null then
    return 0;
  end if;

  if p_dry_run then
    select count(*)::integer into v_count
      from public.transactions t
      where t.household_id = v_house
        and t.kind = v_kind
        and t.category_id is distinct from v_category
        and private.merchant_key(t.merchant) in (
          select a.alias_key from public.vendor_aliases a
          where a.vendor_id = p_vendor and a.household_id = v_house);
  else
    update public.transactions t
      set category_id = v_category
      where t.household_id = v_house
        and t.kind = v_kind
        and t.category_id is distinct from v_category
        and private.merchant_key(t.merchant) in (
          select a.alias_key from public.vendor_aliases a
          where a.vendor_id = p_vendor and a.household_id = v_house);
    get diagnostics v_count = row_count;
  end if;
  return v_count;
end;
$$;
revoke all on function public.vendor_recategorize(uuid, boolean) from public;
grant execute on function public.vendor_recategorize(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Merge: body copied from 20261115130200_shopping_lists.sql, plus one rule —
-- a target without a default category inherits the source's default.
-- ---------------------------------------------------------------------------
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

  -- The target keeps its own default; without one it takes the source's.
  update public.vendors t
    set default_category_id = s.default_category_id
    from public.vendors s
    where t.id = p_target
      and s.id = p_source
      and t.default_category_id is null
      and s.default_category_id is not null;

  delete from public.vendors where id = p_source;
end;
$$;
revoke all on function public.merge_vendors(uuid, uuid) from public;
grant execute on function public.merge_vendors(uuid, uuid) to authenticated;

-- RLS: vendors' existing per-row "household crud" policy covers the new
-- column. Realtime: vendors is already published with replica identity full,
-- so default_category_id changes arrive like any other vendor update.
