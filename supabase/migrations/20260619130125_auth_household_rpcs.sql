-- Teftera — invite-code generator, member display_name, and the create/join RPCs.
--
-- create_household / join_household_by_code are SECURITY DEFINER and granted to
-- `authenticated` ON PURPOSE: the client must call them, and a joiner cannot read
-- a household by its code under RLS (SELECT requires membership). Both are scoped
-- to auth.uid() internally. The resulting advisor warnings 0029 for these two
-- functions are expected and intentional.

-- Invite-code generator: 8 chars, unambiguous alphabet (no O/0/I/1).
create or replace function private.gen_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..8 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

alter table public.households
  alter column invite_code set default private.gen_invite_code();

-- Member display name (avoids exposing auth.users to read other members).
alter table public.household_members
  add column display_name text;

-- Create a household + the creator's membership atomically.
create or replace function public.create_household(p_name text, p_display_name text)
returns table (id uuid, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household public.households%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  insert into public.households (name)
  values (p_name)
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household.id, auth.uid(), 'owner', p_display_name);

  id := v_household.id;
  invite_code := v_household.invite_code;
  return next;
end;
$$;

revoke all on function public.create_household(text, text) from public, anon;
grant execute on function public.create_household(text, text) to authenticated;

-- Resolve an invite code (bypassing RLS) and join the caller to that household.
create or replace function public.join_household_by_code(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select id into v_household_id
  from public.households
  where invite_code = upper(p_code);

  if v_household_id is null then
    raise exception 'invalid invite code';
  end if;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_household_id, auth.uid(), 'member', p_display_name)
  on conflict (household_id, user_id) do nothing;

  return v_household_id;
end;
$$;

revoke all on function public.join_household_by_code(text, text) from public, anon;
grant execute on function public.join_household_by_code(text, text) to authenticated;
