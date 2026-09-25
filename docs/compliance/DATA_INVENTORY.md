# Inventario de datos y terceros (Carta Casino)

Construido a partir del código (package.json, imports, AndroidManifest, funciones de Supabase) el 2026-09-25.
"NO VERIFICADO" = no hay evidencia en el código; depende del proveedor y hay que comprobarlo en su documentación.

| SERVICIO | SDK / cómo se usa | DATOS | PROPÓSITO | COMPARTIDO CON | ¿OBLIGATORIO? | POLÍTICA | ¿CONSENTIMIENTO? | REGIÓN |
|---|---|---|---|---|---|---|---|---|
| Supabase (Auth) | REST sin SDK (`src/account/authApi.ts`, `src/casino/premium/anonAuth.ts`) | Email, contraseña (hash en Supabase), identidad OAuth (email, nombre, avatar, id del proveedor), id de usuario, id anónimo de invitado, IP y user agent en logs | Cuentas, sesiones | Supabase Inc. | Sí para cuentas y juego en línea; no para jugar sin conexión | https://supabase.com/privacy | No (servicio necesario) | us-east-1 (verificado por MCP) |
| Supabase (Base de datos / Edge Functions / Realtime) | REST/RPC, `@supabase/realtime-js` | Nombre de usuario, saldo, historial (juego, apuesta, pago, fecha), préstamos, recompensas, salas en línea (nombre visible, estado), baneos, auditoría, `last_seen_at` | Juego, economía, moderación | Supabase Inc. | Sí para cuenta/en línea | https://supabase.com/privacy | No | us-east-1 |
| GitHub Pages | Alojamiento de la web | IP, user agent, URL (logs de GitHub) | Servir la web | GitHub (Microsoft) | Sí (web) | https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement | No | NO VERIFICADO (infraestructura de GitHub) |
| GitHub Releases | App Android "direct": `AppUpdaterPlugin` descarga `update.json` y el APK | IP, user agent | Actualizaciones de la APK directa (no en la versión de Play) | GitHub | No (solo APK directa) | igual que arriba | No | NO VERIFICADO |
| Google AdMob | `@capacitor-community/admob` 8.1.0 (solo Android) | Identificador de publicidad (AAID), IP, info de dispositivo/app, interacciones con anuncios (según Google); **nuestro id interno de usuario** en `ssv.userId/customData` | Anuncios recompensados opcionales y verificación de recompensa (SSV) | Google | No (opcional, el usuario lo pide) | https://policies.google.com/privacy · https://developers.google.com/admob/android/privacy/play-data-disclosure | Sí donde la ley lo exige (UMP de Google); **requiere configurar mensajes en AdMob** | Global (Google) |
| Google Sign-In (OAuth) | Redirección vía Supabase Auth | Email, nombre, avatar, id de Google | Iniciar sesión | Google → Supabase | No (opcional) | https://policies.google.com/privacy | El usuario lo elige | Global |
| Discord (OAuth) | Redirección vía Supabase Auth | Email, nombre, avatar, id de Discord | Iniciar sesión | Discord → Supabase | No (opcional) | https://discord.com/privacy | El usuario lo elige | Global |
| Cloudflare Turnstile (CAPTCHA) | Script `challenges.cloudflare.com` cargado solo al registrarse, iniciar sesión, pedir reset o crear sesión de invitado en línea (`src/account/captcha.ts`); activo solo con `VITE_TURNSTILE_SITE_KEY` | IP, datos del navegador y señales de interacción | Prevención de bots y farming de bonos | App → Cloudflare; token → Supabase Auth | No | https://www.cloudflare.com/privacypolicy/ | Necesario para registrarse cuando está activado | Global |
| Fuentes | **Autoalojadas** desde esta versión (`@fontsource/*`, `src/components/slots/fonts`) | Ninguno (ya no hay petición a Google Fonts) | Tipografía | — | — | — | — | — |
| Analítica | **Ninguna** en el código | — | — | — | — | — | — | — |
| Informes de fallos | **Ninguno** en el código. Google Play Console puede mostrar estadísticas de fallos al desarrollador: NO VERIFICADO | — | — | — | — | — | — | — |
| Pagos | **Ninguno** (sin compras) | — | — | — | — | — | — | — |

## Almacenamiento en el dispositivo

- `localStorage` con prefijo `carta.` (`src/storage`): preferencias, idioma, monedas de invitado, progreso de juegos
  (Jewellery, configuraciones), aviso legal visto, sesión (tokens de Supabase: `carta.slots.session`, sesión de cuenta).
- `sessionStorage`: mano de Blackjack en curso por pestaña.
- Sin cookies propias; sin IndexedDB; sin service worker (búsqueda en `src`: ninguna coincidencia).

## Qué ve cada quien

- Otros jugadores: solo el **nombre de usuario** (o el nombre escrito por un invitado) en salas en línea. Las vistas de
  sala (`room_views`) no incluyen ids internos ni emails.
- Staff (rol en base de datos): email, nombre, saldo, historial, baneos, para moderación (`staff_*` en
  `supabase/migrations/20260927000000_profiles_staff.sql`); cada acción queda en `admin_audit`.
