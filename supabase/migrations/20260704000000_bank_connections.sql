-- Day 17: Enable Banking connection per household (one row max).
create table public.bank_connections (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references public.households (id) on delete cascade,
  created_by    uuid not null references auth.users (id),
  provider      text not null default 'enable_banking',
  session_id    text not null,
  account_uid   text not null,
  bank_name     text not null default 'DSK Bank',
  valid_until   timestamptz not null,
  created_at    timestamptz not null default now(),
  unique (household_id)
);

alter table public.bank_connections enable row level security;

-- Household members may see their connection's metadata and disconnect it.
-- INSERT/UPDATE happen only in the Edge Function callback via service role,
-- so no INSERT/UPDATE policies for authenticated.
--
-- NOTE (deviation from task-1-brief.md Step 1): the brief's draft SQL calls
-- `private.member_household_ids()` (a set-returning helper). This project's
-- actual RLS helper, confirmed by inspecting existing migrations
-- (20260619103503_harden_security_and_indexes.sql), is
-- `private.is_household_member(hid uuid) returns boolean`, used everywhere
-- as `using (private.is_household_member(household_id))`. No
-- `member_household_ids` function exists in this codebase. This file uses
-- the real helper so the policy matches every other household-scoped table.
create policy "bank_connections_select_own_household"
  on public.bank_connections for select to authenticated
  using (private.is_household_member(household_id));

create policy "bank_connections_delete_own_household"
  on public.bank_connections for delete to authenticated
  using (private.is_household_member(household_id));

-- session_id grants bank-data access: hide it from client roles via
-- column-level grants. (RLS restricts rows; grants restrict columns.)
revoke all on public.bank_connections from anon, authenticated;
grant select (id, household_id, bank_name, valid_until, created_at)
  on public.bank_connections to authenticated;
grant delete on public.bank_connections to authenticated;
