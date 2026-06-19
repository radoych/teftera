-- Teftera — finish hardening the seed trigger function.
--
-- Migration 2 revoked EXECUTE on seed_default_categories() from PUBLIC, but
-- Supabase grants EXECUTE directly to the `anon` and `authenticated` roles via
-- default privileges, so the function stayed callable via /rest/v1/rpc
-- (advisor lints 0028/0029). Revoke those direct grants. The function is a
-- trigger and fires regardless of the caller's EXECUTE privilege, so the
-- household category seeding is unaffected.

revoke all on function public.seed_default_categories() from anon, authenticated;
