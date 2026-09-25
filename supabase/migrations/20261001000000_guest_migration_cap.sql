-- Guest chips live in the player's browser, so the amount they report can't be verified. The cap on what
-- a new account can bring over was 25,000; it is now 5,000 (five times the 1,000 starting chips), which
-- keeps a real guest's progress while making an edited browser balance worth little.
create or replace function public.guest_migration_cap()
returns bigint
language sql
immutable
set search_path = ''
as $$ select 5000::bigint $$;

revoke all on function public.guest_migration_cap() from public, anon, authenticated;
grant execute on function public.guest_migration_cap() to service_role;
