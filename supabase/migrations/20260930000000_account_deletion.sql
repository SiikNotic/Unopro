-- Account deletion (required by the stores for apps with accounts).
--
-- The `account` edge function verifies the caller's token, calls account_delete_prepare (service role only)
-- and then deletes the user through the Auth admin API. Deleting the auth user removes, by the existing
-- `on delete cascade` foreign keys, the profile, wallet, ledger, bank loans, ad rewards, bans, guest
-- migration, open blackjack hand, slot spins and rooms the player hosted.
-- Kept on purpose: the append-only admin_audit rows (they hold only ids and the reason, needed to account
-- for staff actions), with the deletion itself recorded there too.

alter table public.admin_audit drop constraint if exists admin_audit_action_check;
alter table public.admin_audit add constraint admin_audit_action_check
  check (action in ('ADD_COINS', 'REMOVE_COINS', 'BAN', 'UNBAN', 'USERNAME_CHANGE', 'ROLE_CHANGE', 'GUEST_MIGRATION', 'ACCOUNT_DELETE'));

-- Checks that the account may be deleted and records it. The owner account can't be deleted this way
-- (it would leave the service without an owner); it raises 'owner_protected'.
create or replace function public.account_delete_prepare(p_user uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
  v_name text;
begin
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'no_such_user' using errcode = 'P0404';
  end if;
  select p.role, p.username into v_role, v_name from public.profiles p where p.user_id = p_user;
  if v_role = 'owner' then
    raise exception 'owner_protected' using errcode = 'P0403';
  end if;
  perform public.audit(p_user, coalesce(v_role, 'user'), p_user, 'ACCOUNT_DELETE', 'Deleted by the account holder', jsonb_build_object('username', v_name));
  return 'ok';
end;
$$;

revoke all on function public.account_delete_prepare(uuid) from public, anon, authenticated;
grant execute on function public.account_delete_prepare(uuid) to service_role;
