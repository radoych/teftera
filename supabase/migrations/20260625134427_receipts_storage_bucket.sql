-- Day 10: private Storage bucket for receipt images, household-scoped RLS.
-- Object key layout: {household_id}/{uuid}.jpg — the first path segment is the
-- household id, which the policies authorize against. Idempotent.

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts: household read" on storage.objects;
create policy "receipts: household read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "receipts: household insert" on storage.objects;
create policy "receipts: household insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "receipts: household update" on storage.objects;
create policy "receipts: household update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  );

drop policy if exists "receipts: household delete" on storage.objects;
create policy "receipts: household delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] in (
      select household_id::text
      from public.household_members
      where user_id = auth.uid()
    )
  );
