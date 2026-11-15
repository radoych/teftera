-- Repoint the five receipts Storage policies at private.is_household_member, the
-- same SECURITY DEFINER helper every table policy uses (audit 2026-09-10, D12).
-- Replaces the policies created in 20260625134427_receipts_storage_bucket.sql
-- (that applied migration is left untouched). Idempotent.
--
-- Semantics are preserved exactly:
--   * same names, commands, role (authenticated) and USING / WITH CHECK split;
--   * object key layout {household_id}/{uuid}.jpg — the first path segment must be
--     a household the caller belongs to.
-- The old check compared text (`foldername[1] in (select household_id::text …)`),
-- so a first segment that is not a canonical lower-case uuid never matched. The
-- regex guard keeps that: such a key is denied instead of raising a uuid cast
-- error, and CASE guarantees the cast is evaluated only after the guard passes
-- (a bare `and` gives no evaluation-order guarantee in Postgres).

drop policy if exists "receipts: household read" on storage.objects;
create policy "receipts: household read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and case
      when (storage.foldername(name))[1]
           ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_household_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "receipts: household insert" on storage.objects;
create policy "receipts: household insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and case
      when (storage.foldername(name))[1]
           ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_household_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "receipts: household update" on storage.objects;
create policy "receipts: household update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts'
    and case
      when (storage.foldername(name))[1]
           ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_household_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  )
  with check (
    bucket_id = 'receipts'
    and case
      when (storage.foldername(name))[1]
           ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_household_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );

drop policy if exists "receipts: household delete" on storage.objects;
create policy "receipts: household delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and case
      when (storage.foldername(name))[1]
           ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then private.is_household_member(((storage.foldername(name))[1])::uuid)
      else false
    end
  );
