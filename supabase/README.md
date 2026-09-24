# Servidores opcionales: cuentas, salas online y tragamonedas

Sin configurar nada, la web funciona en **modo local**: cada tirada se decide en el navegador con
aleatoriedad criptográfica y se cobra/paga en un solo paso, idempotente. Eso protege contra dobles
toques, recargas y pestañas duplicadas, pero **no** contra alguien que manipule su propio navegador.
La pantalla lo indica ("Modo local").

Con este servidor, el resultado y el saldo pasan a decidirse fuera del navegador:

1. El jugador obtiene una sesión anónima de Supabase Auth (JWT).
2. El navegador envía solo `{ requestId, machine, bet }` a la función `slot-spin`.
3. La función verifica el JWT, valida la apuesta contra los niveles de esa máquina y decide la **ronda
   completa** (giro base, multiplicadores, giros gratis y bonus) con `crypto.getRandomValues` y la
   matemática de esa máquina (`src/casino/premium/machines.ts`, el mismo motor que usa la web). Luego
   llama a `slot_commit`, que en **una transacción** bloquea el monedero, comprueba si ese `requestId`
   ya se registró (idempotencia), comprueba el saldo, descuenta la apuesta, abona el premio y guarda
   todos los sorteos de la ronda.
4. La web recibe el recibo, lo recalcula a partir de los sorteos y solo si cuadra lo reproduce
   (rodillos, giros gratis, bonus). Elegir monedas o cofres solo revela premios ya decididos.

Los jugadores solo pueden **leer** sus propias filas (RLS). No pueden escribir saldos ni llamar a
`slot_commit`. No hay cuentas de administración, parámetros ocultos ni atajos.

## Puesta en marcha (la hace el dueño del proyecto)

1. Crea un proyecto en Supabase y activa *Anonymous sign-ins* (Authentication → Providers).
2. Aplica `migrations/20260924000000_slots.sql` (SQL editor o `supabase db push`).
3. Despliega la función: `supabase functions deploy slot-spin` y define el secreto
   `ALLOWED_ORIGIN=https://siiknotic.github.io`. `SUPABASE_URL`, `SUPABASE_ANON_KEY` y
   `SUPABASE_SERVICE_ROLE_KEY` los inyecta Supabase; **la service role key nunca va al repositorio
   ni a la web**.
4. Compila la web con estas variables (no son secretas; en GitHub Actions como *variables*):
   - `VITE_SUPABASE_URL=https://<proyecto>.supabase.co`
   - `VITE_SUPABASE_ANON_KEY=<clave pública (publishable)>`
   - `VITE_SLOTS_API_URL=https://<proyecto>.supabase.co/functions/v1/slot-spin`

   La CSP de la build añade ese origen a `connect-src` automáticamente.

## Salas online (Dominó y Bingo)

Proyecto: `unopro-juegos`. Ver `docs/games-platform.md` para la arquitectura.

1. Activa *Anonymous sign-ins* (Authentication → Providers / Sign In).
2. Aplica `migrations/20260925000000_game_rooms.sql`.
3. `npm run functions:build` (genera `functions/game-room/index.ts` desde `source.ts`) y despliega
   `game-room` con verificación JWT. Los orígenes permitidos (CORS) están en `source.ts`.
4. En GitHub → Settings → Secrets and variables → Actions → **Variables**:
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (clave publishable; son públicas). El workflow las pasa
   al build y la CSP añade el origen `https://` y `wss://` (Realtime).

Coste: cada cliente en partida hace un `tick` cada 0,7 s (bingo) o 1 s (dominó), y cada 3 s en el lobby.
Solo las pestañas visibles lo hacen.

## Cuentas y monedas de cuenta

- **Invitado**: juega como siempre con las fichas de su navegador (recarga gratis incluida). No tiene fila en el servidor.
- **Registrado** (correo confirmado, Google o Discord): recibe **una vez** 1,000 monedas en `account_wallets`.
  Con sesión iniciada, Blackjack, Ruleta, Fiebre del Oro y las 8 tragamonedas premium juegan contra la
  función `casino`: el servidor sortea con `crypto.getRandomValues`, reserva y paga en una transacción
  (`account_play`, `bj_open`/`bj_step`) y responde con el resultado. El navegador solo envía la apuesta.
- Los jugadores leen solo su saldo y su historial (RLS). Nadie puede escribir saldos desde el navegador; las
  manos de blackjack en curso (con el mazo) no son legibles. La condición «registrado» se comprueba también en
  la base de datos (`account_registered`: no anónimo y `email_confirmed_at` no nulo).

Puesta en marcha (proyecto `unopro-juegos`):

1. `migrations/20260926000000_accounts.sql` y la función `casino` (`npm run functions:build`; verificación JWT).
2. Authentication → URL Configuration: *Site URL* `https://siiknotic.github.io/Unopro/` y en *Redirect URLs*
   `https://siiknotic.github.io/Unopro/**` (y `http://localhost:5173/**` para desarrollo).
3. Authentication → Providers: *Email* (con confirmación), *Google* y *Discord* con su Client ID / Secret.
   En Google Cloud y en el Discord Developer Portal, la URL de retorno es
   `https://mdwkigzorhvktgqlffck.supabase.co/auth/v1/callback`.
4. Recomendado: SMTP propio (el correo integrado de Supabase envía muy pocos mensajes por hora).

## Pruebas

- `npm test` incluye el manejador del servidor (`functions/_shared/__tests__`).
- `tests/run_sql_tests.sh` prueba las migraciones (tragamonedas, salas y cuentas) contra un Postgres **local y desechable**
  (`tests/00_supabase_stub.sql` imita el esquema `auth` de Supabase; no lo apliques a un proyecto real):
  idempotencia, conflictos, límites, RLS/IDOR, permisos y 40 tiradas concurrentes.

## Límites conocidos

- En modo local, solo una pestaña del navegador puede apostar a la vez (Web Locks); las demás muestran
  un aviso y un botón «Jugar aquí». En navegadores sin Web Locks se mantiene el comportamiento anterior.

- El resto del casino (Blackjack, Ruleta, Fiebre del Oro) sigue usando el monedero local; en modo
  servidor las 8 máquinas premium usan el saldo del servidor, que es independiente.
- La recarga gratuita de fichas no existe aún en el servidor.
- El límite de frecuencia de la función es por instancia (8 peticiones/s por jugador).
