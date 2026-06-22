-- Day 5: enable realtime change feed on transactions so both household
-- members see new rows without a refresh. Idempotent — safe to re-run.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;
end $$;

-- Full row image on UPDATE/DELETE events (harmless; we refetch on change).
alter table public.transactions replica identity full;
