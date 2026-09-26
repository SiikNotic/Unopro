#!/usr/bin/env bash
# Runs the slot, game-room and accounts SQL tests against a THROWAWAY local Postgres (never a real project).
# Usage: PGHOST=... PGPORT=... PGUSER=postgres supabase/tests/run_sql_tests.sh
set -euo pipefail
cd "$(dirname "$0")"
DB=slots_test_$$
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f 00_supabase_stub.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260924000000_slots.sql
# applying the migration twice must be harmless
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260924000000_slots.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f slots_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260925000000_game_rooms.sql
# applying it twice must be harmless too
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260925000000_game_rooms.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f game_rooms_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260926000000_accounts.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260926000000_accounts.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f accounts_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260927000000_profiles_staff.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260927000000_profiles_staff.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f profiles_staff_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260928000000_bank.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260928000000_bank.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f bank_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260929000000_tables.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20260929000000_tables.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tables_test.sql
for m in 20260930000000_account_deletion 20261001000000_guest_migration_cap 20261002000000_terms_acceptance 20261003000000_game_control_stakes 20261003000000_game_control_stakes; do
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "../migrations/$m.sql"
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f game_control_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261004000000_orphan_stakes.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261004000000_orphan_stakes.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f orphan_stakes_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261005000000_staff_overview_games.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261005000000_staff_overview_games.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f staff_overview_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261006000000_game_control_tables.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261006000000_game_control_tables.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f game_control_tables_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261007000000_crash.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../migrations/20261007000000_crash.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f crash_test.sql

# Two players ask for the same username at the same instant: exactly one gets it.
for u in 21 22 23 24 25 26; do
  psql -q -d "$DB" -c "insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0002-0000000000$u', 'r$u@t.dev', now())"
  psql -q -d "$DB" -c "set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0002-0000000000$u', false); select public.ensure_profile(null)" >/dev/null
done
for u in 21 22 23 24 25 26; do
  psql -q -d "$DB" -c "set role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0002-0000000000$u', false); select public.set_username('RaceName')" >/dev/null 2>&1 &
done
wait
TAKEN=$(psql -At -d "$DB" -c "select count(*) from public.profiles where lower(username) = 'racename'")
echo "username race: holders=$TAKEN"
[ "$TAKEN" = 1 ] || { echo "USERNAME RACE TEST FAILED"; exit 1; }

# Concurrency: 40 parallel commits for one player who can afford only 5 bets of 200 (balance 1000),
# 10 of them replaying the same request id. Exactly 5 distinct spins may be booked, never a negative balance.
psql -q -d "$DB" -c "insert into auth.users (id) values ('00000000-0000-0000-0000-0000000000cc')"
REPLAY=22222222-2222-4222-8222-222222222222
for i in $(seq 1 40); do
  if [ "$i" -le 10 ]; then RID=$REPLAY; else RID=$(cat /proc/sys/kernel/random/uuid); fi
  psql -q -d "$DB" -c "set role service_role; select * from public.slot_commit('00000000-0000-0000-0000-0000000000cc', '$RID', 'cosmic', 200, '{\"base\":{\"stops\":[1,2,3,4,5]},\"free\":[],\"picks\":[]}', 0)" >/dev/null 2>&1 &
done
wait
read -r SPINS BAL REPLAYS < <(psql -At -F ' ' -d "$DB" -c "select (select count(*) from public.slot_spins where user_id = '00000000-0000-0000-0000-0000000000cc'), (select balance from public.casino_wallets where user_id = '00000000-0000-0000-0000-0000000000cc'), (select count(*) from public.slot_spins where request_id = '$REPLAY')")
echo "concurrency: spins=$SPINS balance=$BAL replayed_id_rows=$REPLAYS"
[ "$SPINS" = 5 ] && [ "$BAL" = 0 ] && [ "$REPLAYS" -le 1 ] || { echo "CONCURRENCY TEST FAILED"; exit 1; }

# Concurrency on account coins: 30 parallel roulette bookings of 250 for a player with 1,000 coins.
psql -q -d "$DB" -c "insert into auth.users (id, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000dd', now()); insert into public.terms_acceptances (user_id, version, adult_confirmed) values ('00000000-0000-0000-0000-0000000000dd', public.terms_version(), true)"
psql -q -d "$DB" -c "set role service_role; select * from public.account_claim_bonus('00000000-0000-0000-0000-0000000000dd', gen_random_uuid())" >/dev/null
for i in $(seq 1 30); do
  psql -q -d "$DB" -c "set role service_role; select * from public.account_play('00000000-0000-0000-0000-0000000000dd', gen_random_uuid(), 'roulette', 250, 0, '{}')" >/dev/null 2>&1 &
done
wait
read -r ROUNDS ABAL < <(psql -At -F ' ' -d "$DB" -c "select (select count(*) from public.account_ledger where user_id = '00000000-0000-0000-0000-0000000000dd' and game = 'roulette'), (select balance from public.account_wallets where user_id = '00000000-0000-0000-0000-0000000000dd')")
echo "account concurrency: rounds=$ROUNDS balance=$ABAL"
[ "$ROUNDS" = 4 ] && [ "$ABAL" = 0 ] || { echo "ACCOUNT CONCURRENCY TEST FAILED"; exit 1; }
# Bank: 20 simultaneous loan claims (5 of them replaying one request id) pay exactly one loan of 500,
# and 10 simultaneous deliveries of one ad reward id pay 100 exactly once.
BU=00000000-0000-0000-0003-0000000000ee
psql -q -d "$DB" -c "insert into auth.users (id, email_confirmed_at) values ('$BU', now()); insert into public.terms_acceptances (user_id, version, adult_confirmed) values ('$BU', public.terms_version(), true)"
LREPLAY=33333333-3333-4333-8333-333333333333
for i in $(seq 1 20); do
  if [ "$i" -le 5 ]; then RID=$LREPLAY; else RID=$(cat /proc/sys/kernel/random/uuid); fi
  psql -q -d "$DB" -c "set role authenticated; select set_config('request.jwt.claim.sub', '$BU', false); select * from public.bank_claim_loan('$RID')" >/dev/null 2>&1 &
done
for i in $(seq 1 10); do
  psql -q -d "$DB" -c "set role service_role; select * from public.bank_grant_ad_reward('$BU', 'admob', 'race-event')" >/dev/null 2>&1 &
done
wait
read -r LOANS ADS BBAL < <(psql -At -F ' ' -d "$DB" -c "select (select count(*) from public.bank_loans where user_id = '$BU'), (select count(*) from public.account_ledger where user_id = '$BU' and game = 'ad_reward'), (select balance from public.account_wallets where user_id = '$BU')")
echo "bank concurrency: loans=$LOANS ad_payments=$ADS balance=$BBAL"
[ "$LOANS" = 1 ] && [ "$ADS" = 1 ] && [ "$BBAL" = 600 ] || { echo "BANK CONCURRENCY TEST FAILED"; exit 1; }
# Tables: 20 simultaneous bets of 100 against a balance of 500 (5 of them replaying one request id):
# exactly 5 bets are taken, never a negative balance.
TU=00000000-0000-0000-0004-0000000000ee
psql -q -d "$DB" -c "insert into auth.users (id, email_confirmed_at) values ('$TU', now()); insert into public.account_wallets (user_id, balance) values ('$TU', 500); insert into public.terms_acceptances (user_id, version, adult_confirmed) values ('$TU', public.terms_version(), true)"
TREPLAY=44444444-4444-4444-8444-444444444444
for i in $(seq 1 20); do
  if [ "$i" -le 5 ]; then RID=$TREPLAY; else RID=$(cat /proc/sys/kernel/random/uuid); fi
  psql -q -d "$DB" -c "set role service_role; select * from public.table_bet('$TU', '$RID', 'roulette', 100, '{}')" >/dev/null 2>&1 &
done
wait
read -r TBETS TBAL < <(psql -At -F ' ' -d "$DB" -c "select (select count(*) from public.account_ledger where user_id = '$TU'), (select balance from public.account_wallets where user_id = '$TU')")
echo "table concurrency: bets=$TBETS balance=$TBAL"
[ "$TBETS" = 5 ] && [ "$TBAL" = 0 ] || { echo "TABLE CONCURRENCY TEST FAILED"; exit 1; }
# Staked rooms: 10 simultaneous deliveries of one Domino pot payout (the same request id) pay it once.
PU=00000000-0000-0000-0005-0000000000ee
psql -q -d "$DB" -c "insert into auth.users (id, email_confirmed_at) values ('$PU', now()); insert into public.account_wallets (user_id, balance) values ('$PU', 0); insert into public.terms_acceptances (user_id, version, adult_confirmed) values ('$PU', public.terms_version(), true)"
PREPLAY=55555555-5555-4555-8555-555555555555
for i in $(seq 1 10); do
  psql -q -d "$DB" -c "set role service_role; select * from public.table_pay('$PU', '$PREPLAY', 'domino', 400, '{}')" >/dev/null 2>&1 &
done
wait
read -r PAYS PBAL < <(psql -At -F ' ' -d "$DB" -c "select (select count(*) from public.account_ledger where user_id = '$PU'), (select balance from public.account_wallets where user_id = '$PU')")
echo "pot payout concurrency: payouts=$PAYS balance=$PBAL"
[ "$PAYS" = 1 ] && [ "$PBAL" = 400 ] || { echo "POT PAYOUT CONCURRENCY TEST FAILED"; exit 1; }
# Two refund jobs at once (e.g. cron plus a manual run): each lost stake is paid back once.
OU=00000000-0000-0000-0006-0000000000ee
psql -q -d "$DB" -c "insert into auth.users (id, email_confirmed_at) values ('$OU', now()); insert into public.account_wallets (user_id, balance) values ('$OU', 300); insert into public.terms_acceptances (user_id, version, adult_confirmed) values ('$OU', public.terms_version(), true)"
psql -q -d "$DB" -c "set role service_role; select public.table_bet('$OU', gen_random_uuid(), 'bingo', 100, '{\"roomId\":\"66666666-0000-4000-8000-0000000000ff\",\"nonce\":\"race\",\"room\":\"RACE2\"}') from generate_series(1, 3)" >/dev/null
psql -q -d "$DB" -c "update public.account_ledger set created_at = now() - interval '20 minutes' where user_id = '$OU'"
for i in $(seq 1 8); do
  psql -q -d "$DB" -c "set role service_role; select public.refund_orphan_stakes()" >/dev/null 2>&1 &
done
wait
read -r OREF OBAL < <(psql -At -F ' ' -d "$DB" -c "select (select count(*) from public.account_ledger where user_id = '$OU' and payout > 0), (select balance from public.account_wallets where user_id = '$OU')")
echo "orphan refund concurrency: refunds=$OREF balance=$OBAL"
[ "$OREF" = 3 ] && [ "$OBAL" = 300 ] || { echo "ORPHAN REFUND CONCURRENCY TEST FAILED"; exit 1; }
# Crash: 20 simultaneous bets (different request ids) on one round book exactly one; then 20 simultaneous
# cash-outs of that bet pay it exactly once.
CU=00000000-0000-0000-0009-0000000000ee
psql -q -d "$DB" -c "insert into auth.users (id, email_confirmed_at) values ('$CU', now()); insert into public.account_wallets (user_id, balance) values ('$CU', 1000); insert into public.terms_acceptances (user_id, version, adult_confirmed) values ('$CU', public.terms_version(), true)"
psql -q -d "$DB" -c "select public.crash_state(); update public.crash_rounds set starts_at = clock_timestamp() + interval '60 seconds', crash_at = clock_timestamp() + interval '600 seconds', crash_multiplier = 500 where id = (select max(id) from public.crash_rounds)" >/dev/null
for i in $(seq 1 20); do
  psql -q -d "$DB" -c "set role authenticated; select set_config('request.jwt.claim.sub', '$CU', false); select public.crash_bet(gen_random_uuid(), 100, null)" >/dev/null 2>&1 &
done
wait
psql -q -d "$DB" -c "update public.crash_rounds set starts_at = clock_timestamp() - interval '11.6 seconds' where id = (select max(id) from public.crash_rounds)"
CROUND=$(psql -At -d "$DB" -c "select max(id) from public.crash_rounds")
for i in $(seq 1 20); do
  psql -q -d "$DB" -c "set role authenticated; select set_config('request.jwt.claim.sub', '$CU', false); select public.crash_cashout($CROUND)" >/dev/null 2>&1 &
done
wait
read -r CBETS CPAYS CBAL < <(psql -At -F ' ' -d "$DB" -c "select (select count(*) from public.crash_bets where user_id = '$CU'), (select count(*) from public.account_ledger where user_id = '$CU' and payout > 0), (select balance from public.account_wallets where user_id = '$CU')")
echo "crash concurrency: bets=$CBETS payouts=$CPAYS balance=$CBAL"
[ "$CBETS" = 1 ] && [ "$CPAYS" = 1 ] && [ "$CBAL" -ge 1100 ] && [ "$CBAL" -le 1115 ] || { echo "CRASH CONCURRENCY TEST FAILED"; exit 1; }
echo "all SQL tests passed"
