# Servidor de las tragamonedas (opcional)

Sin configurar nada, la web funciona en **modo local**: cada tirada se decide en el navegador con
aleatoriedad criptográfica y se cobra/paga en un solo paso, idempotente. Eso protege contra dobles
toques, recargas y pestañas duplicadas, pero **no** contra alguien que manipule su propio navegador.
La pantalla lo indica ("Modo local").

Con este servidor, el resultado y el saldo pasan a decidirse fuera del navegador:

1. El jugador obtiene una sesión anónima de Supabase Auth (JWT).
2. El navegador envía solo `{ requestId, machine, bet }` a la función `slot-spin`.
3. La función verifica el JWT, valida la apuesta, sortea los rodillos con `crypto.getRandomValues`,
   calcula el premio con el mismo motor que usa la web (`src/casino/premium/engine.ts`) y llama a
   `slot_commit`, que en **una transacción** bloquea el monedero, comprueba si ese `requestId` ya se
   registró (idempotencia), comprueba el saldo, descuenta la apuesta, abona el premio y guarda la tirada.
4. La web recibe el recibo, lo valida y solo entonces anima los rodillos hasta ese resultado.

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

## Pruebas

- `npm test` incluye el manejador del servidor (`functions/_shared/__tests__`).
- `tests/run_sql_tests.sh` prueba la migración contra un Postgres **local y desechable**
  (`tests/00_supabase_stub.sql` imita el esquema `auth` de Supabase; no lo apliques a un proyecto real):
  idempotencia, conflictos, límites, RLS/IDOR, permisos y 40 tiradas concurrentes.

## Límites conocidos

- El resto del casino (Blackjack, Ruleta, Fiebre del Oro) sigue usando el monedero local; en modo
  servidor las 8 máquinas premium usan el saldo del servidor, que es independiente.
- La recarga gratuita de fichas no existe aún en el servidor.
- El límite de frecuencia de la función es por instancia (8 peticiones/s por jugador).
