-- Mark transaction provenance so we can distinguish manual entries, DSK CSV
-- imports, and (future) receipt-scanned rows. Powers a household-wide
-- "last synced with DSK" timestamp and an imported badge.
-- Additive + defaulted, so existing rows and inserts that omit it stay valid.
alter table public.transactions
  add column source text not null default 'manual'
  check (source in ('manual','dsk_import','receipt'));
