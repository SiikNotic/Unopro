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
psql -q -d "$DB" -c "insert into auth.users (id, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000dd', now())"
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
psql -q -d "$DB" -c "insert into auth.users (id, email_confirmed_at) values ('$BU', now())"
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
echo "all SQL tests passed"
