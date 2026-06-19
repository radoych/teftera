-- Teftera — initial schema
-- 7 core tables, Row Level Security on every one, and a trigger that seeds
-- each new household with the default category catalog.
--
-- Money rule: all *_eur columns are INTEGER euro-cent minor units. Never float.
-- RLS rule: a user may read/write only rows whose household they belong to.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique
                default upper(substr(md5(random()::text), 1, 6)),
  created_at  timestamptz not null default now()
);

create table public.household_members (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'member',
  joined_at    timestamptz not null default now(),
  unique (household_id, user_id)
);

create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  icon         text not null,
  color        text not null,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.receipts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  user_id         uuid references auth.users (id) on delete set null,
  storage_path    text,
  raw_gemini_json jsonb,
  processed_at    timestamptz,
  created_at      timestamptz not null default now()
);

create table public.transactions (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  user_id           uuid references auth.users (id) on delete set null,
  amount_eur        integer not null,                                  -- euro cents
  original_amount   integer,                                           -- minor units of original_currency
  original_currency text,
  merchant          text not null,
  category_id       uuid references public.categories (id) on delete set null,
  date              date not null,
  note              text,
  receipt_id        uuid references public.receipts (id) on delete set null,
  is_flagged        boolean not null default false,
  created_at        timestamptz not null default now()
);

create table public.budgets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  category_id  uuid references public.categories (id) on delete set null,
  amount_eur   integer not null,                                       -- euro cents
  month        date not null,                                          -- first day of the budget month
  created_at   timestamptz not null default now(),
  unique (household_id, category_id, month)
);

create table public.anomalies (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  reason         text not null,
  score          numeric,
  reviewed       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index household_members_user_idx   on public.household_members (user_id);
create index household_members_house_idx  on public.household_members (household_id);
create index categories_house_idx         on public.categories (household_id);
create index receipts_house_idx           on public.receipts (household_id);
create index transactions_house_date_idx  on public.transactions (household_id, date desc);
create index transactions_category_idx    on public.transactions (category_id);
create index budgets_house_month_idx      on public.budgets (household_id, month);
create index anomalies_house_idx          on public.anomalies (household_id);

-- ---------------------------------------------------------------------------
-- Default-category seeding
-- ---------------------------------------------------------------------------
-- Mirrors DEFAULT_CATEGORIES in lib/categories.ts. Runs once per household.

create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (household_id, name, icon, color, is_default) values
    (new.id, 'Food & Dining', 'restaurant',      '#ffdfa7', true),
    (new.id, 'Beverages',     'local-cafe',       '#d8e3ff', true),
    (new.id, 'Groceries',     'shopping-basket',  '#adc7ff', true),
    (new.id, 'Transport',     'directions-car',   '#a8c8ff', true),
    (new.id, 'Housing',       'home',             '#c4c6d0', true),
    (new.id, 'Utilities',     'bolt',             '#ffdfa7', true),
    (new.id, 'Health',        'medical-services', '#ffb4ab', true),
    (new.id, 'Entertainment', 'movie',            '#d8e3ff', true),
    (new.id, 'Shopping',      'shopping-bag',     '#adc7ff', true),
    (new.id, 'Other',         'category',         '#8e909a', true);
  return new;
end;
$$;

create trigger seed_categories_after_household_insert
  after insert on public.households
  for each row execute function public.seed_default_categories();

-- ---------------------------------------------------------------------------
-- Membership helper (SECURITY DEFINER)
-- ---------------------------------------------------------------------------
-- RLS policies need to ask "is auth.uid() a member of household X?". Doing that
-- with a subquery against household_members *inside* a policy on
-- household_members causes infinite recursion. A SECURITY DEFINER function runs
-- with the owner's rights, bypassing RLS, so it breaks the cycle. Defined after
-- the tables exist because `language sql` validates the body at creation time.

create or replace function public.is_household_member(hid uuid)
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
      and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.categories        enable row level security;
alter table public.receipts          enable row level security;
alter table public.transactions      enable row level security;
alter table public.budgets           enable row level security;
alter table public.anomalies         enable row level security;

-- households -----------------------------------------------------------------
-- Any authenticated user may create a household. Members may read/update/delete
-- their own (cascade handles dependent rows).
create policy "households: members read"
  on public.households for select to authenticated
  using (public.is_household_member(id));

create policy "households: authenticated create"
  on public.households for insert to authenticated
  with check (true);

create policy "households: members update"
  on public.households for update to authenticated
  using (public.is_household_member(id))
  with check (public.is_household_member(id));

create policy "households: members delete"
  on public.households for delete to authenticated
  using (public.is_household_member(id));

-- household_members ----------------------------------------------------------
-- A user sees rows of households they belong to (via the SECURITY DEFINER
-- helper, so no recursion). A user may add/remove only their own membership
-- row — this covers both "create household then join it" and "join by code".
create policy "members: read own households"
  on public.household_members for select to authenticated
  using (user_id = auth.uid() or public.is_household_member(household_id));

create policy "members: join self"
  on public.household_members for insert to authenticated
  with check (user_id = auth.uid());

create policy "members: leave self"
  on public.household_members for delete to authenticated
  using (user_id = auth.uid());

-- Generic household-scoped tables -------------------------------------------
-- Same pattern for the rest: full CRUD limited to the caller's households.

create policy "categories: household crud"
  on public.categories for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "receipts: household crud"
  on public.receipts for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "transactions: household crud"
  on public.transactions for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "budgets: household crud"
  on public.budgets for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "anomalies: household crud"
  on public.anomalies for all to authenticated
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
