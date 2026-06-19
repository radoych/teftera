-- Teftera — security & performance hardening (follows initial_schema)
-- Addresses Supabase advisor findings:
--   * SECURITY DEFINER helpers exposed via PostgREST RPC (lints 0028/0029)
--   * auth.uid() re-evaluated per row in RLS policies (lint 0003)
--   * foreign keys without a covering index (lint 0001)

-- ---------------------------------------------------------------------------
-- 1. Move the membership helper out of the API-exposed `public` schema.
-- ---------------------------------------------------------------------------
-- PostgREST only exposes functions in its configured schemas (public). Putting
-- the helper in `private` removes the /rest/v1/rpc/... surface while RLS keeps
-- working — the authenticated role still gets USAGE on the schema and EXECUTE
-- on the function. This is Supabase's recommended pattern for RLS helpers.

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.is_household_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = hid
      and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_household_member(uuid) from public;
grant execute on function private.is_household_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Repoint every policy to private.is_household_member and wrap auth.uid()
--    in a scalar subselect so it is evaluated once per query, not per row.
-- ---------------------------------------------------------------------------

-- households -----------------------------------------------------------------
drop policy "households: members read"   on public.households;
drop policy "households: members update" on public.households;
drop policy "households: members delete" on public.households;

create policy "households: members read"
  on public.households for select to authenticated
  using (private.is_household_member(id));

create policy "households: members update"
  on public.households for update to authenticated
  using (private.is_household_member(id))
  with check (private.is_household_member(id));

create policy "households: members delete"
  on public.households for delete to authenticated
  using (private.is_household_member(id));

-- household_members ----------------------------------------------------------
drop policy "members: read own households" on public.household_members;
drop policy "members: join self"           on public.household_members;
drop policy "members: leave self"          on public.household_members;

create policy "members: read own households"
  on public.household_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_household_member(household_id));

create policy "members: join self"
  on public.household_members for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "members: leave self"
  on public.household_members for delete to authenticated
  using (user_id = (select auth.uid()));

-- household-scoped tables ----------------------------------------------------
drop policy "categories: household crud"   on public.categories;
drop policy "receipts: household crud"     on public.receipts;
drop policy "transactions: household crud" on public.transactions;
drop policy "budgets: household crud"      on public.budgets;
drop policy "anomalies: household crud"    on public.anomalies;

create policy "categories: household crud"
  on public.categories for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy "receipts: household crud"
  on public.receipts for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy "transactions: household crud"
  on public.transactions for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy "budgets: household crud"
  on public.budgets for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

create policy "anomalies: household crud"
  on public.anomalies for all to authenticated
  using (private.is_household_member(household_id))
  with check (private.is_household_member(household_id));

-- The public helper is now unreferenced — drop it.
drop function public.is_household_member(uuid);

-- ---------------------------------------------------------------------------
-- 3. The seed trigger function should never be RPC-callable. Triggers fire
--    regardless of the caller's EXECUTE privilege, so revoking it is safe.
-- ---------------------------------------------------------------------------

revoke all on function public.seed_default_categories() from public;

-- ---------------------------------------------------------------------------
-- 4. Covering indexes for foreign keys that lacked them.
-- ---------------------------------------------------------------------------

create index transactions_user_idx    on public.transactions (user_id);
create index transactions_receipt_idx on public.transactions (receipt_id);
create index budgets_category_idx     on public.budgets (category_id);
create index receipts_user_idx        on public.receipts (user_id);
create index anomalies_transaction_idx on public.anomalies (transaction_id);
