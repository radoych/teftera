-- Store the actual time a transaction happened, distinct from row creation.
-- DSK CSV imports carry a real date + time; without this column the UI showed
-- the import time (created_at) instead. Nullable: when unknown, display falls
-- back to created_at. created_at stays the true creation/import time (used by
-- the "last synced with DSK" indicator).
alter table public.transactions add column occurred_at timestamptz;
comment on column public.transactions.occurred_at is
  'Actual time the transaction happened (e.g. DSK CSV date+time). Null for rows where only creation time is known; display falls back to created_at.';
