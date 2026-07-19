-- Income tracking: kind on categories + transactions, income default categories.
alter table public.categories add column kind text not null default 'expense';
alter table public.categories add constraint categories_kind_check
  check (kind in ('expense','income'));

alter table public.transactions add column kind text not null default 'expense';
alter table public.transactions add constraint transactions_kind_check
  check (kind in ('expense','income'));

-- Seed fn now also creates the two default income categories.
create or replace function public.seed_default_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.categories (household_id, name, icon, color, is_default, kind) values
    (new.id, 'Food & Dining', 'restaurant',              '#ffdfa7', true, 'expense'),
    (new.id, 'Beverages',     'local-cafe',               '#d8e3ff', true, 'expense'),
    (new.id, 'Groceries',     'shopping-basket',          '#adc7ff', true, 'expense'),
    (new.id, 'Transport',     'directions-car',           '#a8c8ff', true, 'expense'),
    (new.id, 'Housing',       'home',                     '#c4c6d0', true, 'expense'),
    (new.id, 'Utilities',     'bolt',                     '#ffdfa7', true, 'expense'),
    (new.id, 'Health',        'medical-services',         '#ffb4ab', true, 'expense'),
    (new.id, 'Entertainment', 'movie',                    '#d8e3ff', true, 'expense'),
    (new.id, 'Shopping',      'shopping-bag',             '#adc7ff', true, 'expense'),
    (new.id, 'Other',         'category',                 '#8e909a', true, 'expense'),
    (new.id, 'Заплата',       'payments',                 '#d8e3ff', true, 'income'),
    (new.id, 'Друг приход',   'account-balance-wallet',   '#c4c6d0', true, 'income');
  return new;
end;
$$;

-- Backfill income categories for existing households.
insert into public.categories (household_id, name, icon, color, is_default, kind)
select h.id, v.name, v.icon, v.color, true, 'income'
from public.households h
cross join (values
  ('Заплата', 'payments', '#d8e3ff'),
  ('Друг приход', 'account-balance-wallet', '#c4c6d0')
) as v(name, icon, color)
where not exists (
  select 1 from public.categories c
  where c.household_id = h.id and c.kind = 'income' and c.name = v.name
);
