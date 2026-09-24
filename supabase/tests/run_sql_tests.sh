#!/usr/bin/env bash
# Runs the slot SQL tests against a THROWAWAY local Postgres (never a real project).
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
echo "all SQL tests passed"
