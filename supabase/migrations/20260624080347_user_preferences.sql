-- Per-user preferences (home-screen layout, etc.).
-- Documented exception to the household_id-pattern RLS rule: prefs are inherently
-- per-user, so RLS scopes by user_id = auth.uid(). household_id is carried for
-- rule-compliance and possible future use. See docs/superpowers/specs/
-- 2026-06-24-ux-modals-and-home-layout-design.md.
create table public.user_preferences (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  settings     jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

create policy user_preferences_rw on public.user_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
