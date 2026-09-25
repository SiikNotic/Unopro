# Auditoría de cumplimiento, privacidad, seguridad y economía — Carta Casino

Fecha: 2026-09-25 · Rama: `claude/bolt-to-github-migration-xhkh26`

> **Esto no es asesoría legal.** Es una auditoría técnica del código y la configuración del repositorio.
> Donde una cuestión depende de la ley o de una interpretación de política, se marca **LEGAL REVIEW REQUIRED**.
> Donde no hay evidencia en el código ni en la configuración accesible, se marca **NO VERIFICADO**.

Premisa del producto, verificada en el código: Carta Casino usa **solo monedas virtuales**. No hay dinero
real, cash-out, premios reales, compra de coins ni conversión de coins a dinero. La búsqueda de código de
pagos, IAP, transferencias entre jugadores, retiro o canje **no encontró nada** (ver §4).

Leyenda: 🔴 CRITICAL · 🟠 HIGH · 🟡 MEDIUM · 🟢 LOW · 🔵 INFO. Tipo: **T** técnico · **P** política de tienda/anuncios · **L** pregunta legal.

## 1. Matriz de severidad

| # | ISSUE | SEV | TIPO | FILE | LINE | WHY | POLICY / REASON | FIX | ¿REQUIRED BEFORE RELEASE? | ESTADO |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Auto-actualización desde GitHub Releases + permiso `REQUEST_INSTALL_PACKAGES` | 🔴 | P | `android/app/src/main/AndroidManifest.xml`, `MainActivity.java`, `src/app/UpdateDialog.tsx` | 54 / 11 / 30 | Una app de Play no puede actualizarse fuera de Play ni pedir ese permiso sin un caso de uso aprobado | Google Play: Device and Network Abuse; política de permiso REQUEST_INSTALL_PACKAGES | Flavor `play` (manifiesto que elimina el permiso, updater no registrado, diálogo desactivado con `VITE_DISTRIBUTION=play`) y job CI `play-bundle` que falla si el permiso aparece | Sí (solo para Play) | **Corregido y verificado en CI** (job `play-bundle`: "OK: no REQUEST_INSTALL_PACKAGES", artefacto `carta-play-aab`) |
| 2 | No había borrado de cuenta | 🔴 | P/L | `src/account/*`, `supabase/functions/account/source.ts`, `supabase/migrations/20260930000000_account_deletion.sql` | — | Play exige borrado de cuenta dentro de la app y por web si la app permite crear cuentas | Google Play: User Data → Account deletion requirements | Botón en Cuenta (confirmación escrita), función `account` verificada en servidor, RPC solo para service_role, auditoría | Sí | **Corregido**; migración aplicada en prod; función `account` desplegada (ACTIVE, verify_jwt); falta prueba de borrado real con una cuenta de prueba |
| 3 | No había Política de Privacidad / Términos | 🔴 | P/L | `src/legal/*`, `public/legal/*.html` | — | Play y AdMob requieren una política accesible dentro de la app y en una URL pública | Google Play: User Data; AdMob program policies | Documentos ES/EN en Ajustes → Legal y privacidad y en `https://siiknotic.github.io/Unopro/legal/` | Sí | **Corregido (borrador)**; revisar con abogado; placeholders pendientes |
| 4 | Responsable legal, email de contacto y edad mínima sin configurar | 🟠 | L | `src/legal/config.ts` | 1–20 | Una política sin responsable ni contacto no es válida para Play | Google Play: la política debe identificar al desarrollador y contacto | Completar `LEGAL_CONFIG` y ejecutar `npm run legal:build` | Sí | **Pendiente (configuración del propietario)** |
| 5 | Mensajes de consentimiento (UMP) no configurados en AdMob | 🟠 | P/L | `src/bank/admobProvider.ts` | 39–62 | El código pide consentimiento con UMP, pero si no hay mensaje configurado continúa. En EEE/UK/Suiza y algunos estados de EE. UU. hace falta | Google EU User Consent Policy; US state privacy messages | Crear mensajes GDPR y de estados de EE. UU. en AdMob → Privacy & messaging | Sí (si se sirven anuncios en esas regiones) | **Pendiente (consola AdMob)** — NO VERIFICADO |
| 6 | Bloqueo de categorías sensibles de anuncios | 🟠 | P | consola AdMob | — | Una app de temática casino no debe mostrar anuncios de apuestas reales/dinero real, sobre todo a menores | AdMob: blocking controls; políticas de juego de azar | En código: `maxAdContentRating: 'Teen'`. En consola: bloquear Gambling, Dating, etc. (ver `ADMOB.md`) | Sí | **Parcial**: código hecho; consola NO VERIFICADO. No hay garantía al 100 % de que solo aparezcan anuncios de juegos |
| 7 | Revisión legal de términos, privacidad y ley de social casino por región | 🟠 | L | `src/legal/content.ts` | — | Hay jurisdicciones con normas específicas para juegos de casino simulado | Varía por región (§6) | Revisión por abogado | Sí | **LEGAL REVIEW REQUIRED** |
| 8 | Formularios de Content rating, Data safety, Target audience y Ads en Play Console | 🟠 | P | Play Console | — | Obligatorios antes de publicar; deben coincidir con el inventario de datos | Google Play: App content | Rellenar según `GOOGLE_PLAY_CHECKLIST.md` y `DATA_INVENTORY.md` | Sí | **Pendiente (Play Console)** |
| 9 | La migración de invitado a cuenta confía en el saldo que reporta el cliente (tope 25 000) | 🟡 | T | `supabase/migrations/20260927000000_profiles_staff.sql` | 352–398 | Un cliente puede declarar hasta 25 000 coins al crear su cuenta | Integridad de la economía virtual (no es dinero) | Opcional: bajar el tope o derivarlo de un saldo de invitado guardado en servidor | No | Documentado; una sola vez por usuario y por guest id |
| 10 | Sin CAPTCHA en el registro: farming de bono de bienvenida | 🟡 | T | Supabase Auth | — | Cuentas desechables pueden acumular bonos | Integridad de la economía virtual | Activar CAPTCHA (hCaptcha/Turnstile) en Supabase Auth y confirmación por email | No | Pendiente (configuración) |
| 11 | Los IDs de invitado anónimos no tienen retención ni borrado definidos | 🟡 | T/L | tablas de invitado en Supabase | — | Datos sin plazo de retención | GDPR/CCPA: limitación de almacenamiento — **LEGAL REVIEW REQUIRED** | Tarea programada que purgue invitados inactivos (p. ej. 12 meses) y declararlo | No (recomendado) | Declarado en la política como "sin plazo definido" |
| 12 | El `userId` de SSV envía el UUID interno a Google | 🟡 | T/L | `src/bank/admobProvider.ts` | 82 | Google recibe un identificador seudónimo del usuario | Declararlo en Data safety (App activity / User IDs → shared with Google) | Declarado en `DATA_INVENTORY.md` y en la política; opcional: enviar un HMAC opaco | No | Documentado |
| 13 | Bundle principal ~593 KB (~180 KB gzip) | 🟡 | T | `dist/assets/index-*.js` | — | Carga inicial más lenta en gama baja | Rendimiento | Dividir más código (lobby, i18n) | No | Pendiente |
| 14 | 11 MB de MP3 en `public/audio` | 🟡 | T | `public/audio/` | — | Pesa en APK/AAB y en la primera carga web (se cargan bajo demanda) | Rendimiento | Recodificar a Opus/AAC 96 kbps | No | Pendiente |
| 15 | Vulnerabilidades en dependencias de desarrollo (vitest, vite) | 🟡 | T | `package.json` | — | Solo afectan al servidor de desarrollo, no al build | Higiene de seguridad | Actualizar vite/vitest a versiones mayores | No | Dependencias de producción: 0 vulnerabilidades |
| 16 | Sin Content-Security-Policy | 🟡 | T | `index.html` | — | Capa extra contra XSS | Endurecimiento | Añadir `<meta http-equiv="Content-Security-Policy">` con los orígenes de Supabase y AdMob | No | Pendiente |
| 17 | Decoración "$500" en el fondo del salón | 🟢 | P | `src/components/casino/SaloonBackdrop.tsx` | — | Símbolo de dinero real en la interfaz | Evitar sugerir dinero real | Sustituido por "★ ★ ★" | No | **Corregido** |
| 18 | Google Fonts cargadas desde `fonts.googleapis.com` | 🟢 | T/L | `src/index.css` | 1 | Envía la IP del usuario a Google sin declararlo | Privacidad (fallos de GDPR sobre Google Fonts en la UE) | Fuentes auto-alojadas con `@fontsource` | No | **Corregido**; `dist` ya no contiene googleapis |
| 19 | Pantalla "Información importante" de social casino | 🔵 | P | `src/legal/SocialCasinoNotice.tsx` | — | Aviso claro de que no hay dinero real | Buenas prácticas de social casino | Modal en el primer arranque y documento en Legal | — | **Hecho** |
| 20 | Póker online no implementado | 🔵 | T | `src/games/poker/*` | — | El póker es local contra bots con fichas de práctica, rotuladas como tal | Honestidad del producto | Multijugador cuando exista una autoridad de servidor para póker | — | Documentado |
| 21 | Certificación de Google Ads para social casino | 🔵 | P | — | — | Solo aplica si la app se **promociona** con Google Ads | Google Ads: Gambling and games policy (social casino games) | Solicitarla antes de anunciar la app | Solo si se anuncia | NO VERIFICADO |

## 2. Separación TÉCNICO / POLÍTICA / PREGUNTA LEGAL

**TÉCNICO (resuelto o resoluble con código):** #1 (flavor play), #2 (borrado), #9, #10, #11, #13, #14, #15, #16, #17, #18.

**POLÍTICA (Google Play / AdMob — configuración en consolas):** #1, #2, #3, #5, #6, #8, #21.

**PREGUNTA LEGAL — LEGAL REVIEW REQUIRED:**
- ¿Los Términos y la Política de Privacidad borrador son suficientes para cada país de distribución?
- Edad mínima (13/16/18) y si hace falta verificación de edad o age-gate.
- Base jurídica del tratamiento (consentimiento/interés legítimo) y plazos de retención.
- Si hace falta designar un representante en la UE/UK (GDPR art. 27).
- Estado legal de los juegos de casino simulado en cada región (§6).
- Si los bonos de anuncio recompensado ("mira un anuncio → coins") están permitidos en cada región y para menores.

## 3. Privacidad (resumen; detalle en `DATA_INVENTORY.md`)

- **Recopilado:** email y proveedor de login (cuentas), nombre de usuario público, saldo e historial de juego virtual, id de invitado anónimo, datos de AdMob (AAID, IP, datos del dispositivo) procesados por Google.
- **No hay:** analítica, SDK de crash reporting, pagos ni localización precisa en el código. Las estadísticas propias de Play Console son NO VERIFICADO.
- **Quién ve qué:** otros jugadores solo ven el nombre de usuario. El staff (roles en la base de datos) puede ver el email; está declarado.
- **Región del servidor:** Supabase us-east-1 (verificado).
- **Borrado:** en la app (Cuenta → Eliminar cuenta) y la página pública `legal/deletion-es.html`. Datos locales: Ajustes → Restablecer todos los datos.

## 4. Seguridad y economía (verificado en backend/base de datos, no solo en la interfaz)

- **Saldo:** solo cambia mediante RPC/funciones de servidor con bloqueo de fila e ids de petición idempotentes. El cliente no puede escribir el saldo (RLS).
- **Bono de anuncio:** solo con un callback SSV firmado por Google (verificación ECDSA en `admob-ssv`), con reward id único y tope diario de 20. No hay `setTimeout → +coins`.
- **Cooldown:** usa la hora del servidor.
- **Roles:** en `profiles.role`; el owner es único y está protegido por trigger. El frontend no decide roles. `admin_audit` es solo de inserción (trigger).
- **Cuentas:** baneados e invitados son rechazados en las operaciones de banco.
- **Mesas online (blackjack/ruleta):** resultado del servidor con semilla comprometida (provably fair). El cliente no controla resultados.
- **Borrado de cuenta:** la función verifica el JWT contra `/auth/v1/user`. La RPC `account_delete_prepare` solo tiene grant para `service_role` (verificado en prod: authenticated=false, anon=false). El owner está protegido.
- **Secretos:** el repositorio solo contiene la clave publicable. El service role solo existe como variable de entorno de las funciones.
- **Búsqueda de compra/venta/retiro/transferencia de coins:** sin coincidencias. **No hay CRITICAL COMPLIANCE ISSUE de economía.**
- **Backdoors / cuentas secretas / comandos ocultos:** no se encontraron. El tablero de pruebas de desarrollo no está en `dist`.

## 5. Rendimiento

- **Póker:** p95 del frame 16,7 ms (60 FPS) en el navegador de pruebas. Animaciones solo con transform/opacity. Sin bucles permanentes. Timers registrados y limpiados al salir. Respeta `prefers-reduced-motion`.
- **Anchos 360/390/412/768/1024/1440:** sin scroll horizontal ni elementos fuera de vista (verificado con Playwright).
- **Pendiente:** #13 bundle y #14 audio.

## 6. REGIONAL CONSIDERATIONS

> Resumen orientativo, **no** asesoría legal. Todo requiere **LEGAL REVIEW REQUIRED** antes de distribuir en cada región.

**Estados Unidos**
- Los juegos de casino simulado sin dinero real y sin canje suelen tratarse distinto que el juego real. Hay litigios sobre social casino cuando las coins se **compran** (p. ej. el caso *Kater v. Churchill Downs*, Washington); aquí no hay compras, lo que reduce el riesgo, pero LEGAL REVIEW REQUIRED.
- Privacidad: leyes estatales (CCPA/CPRA en California, y Virginia, Colorado, Connecticut, etc.) → mensajes de estados de EE. UU. en AdMob.
- COPPA si la app atrae a menores de 13 → la audiencia objetivo no debe incluir niños.

**Puerto Rico**
- Se aplica la ley federal de EE. UU. (COPPA, FTC).
- El juego está regulado localmente (Comisión de Juegos). Que una app sin dinero real ni premios quede fuera de esa regulación es una PREGUNTA LEGAL → LEGAL REVIEW REQUIRED.
- Idioma: la app y los documentos están en español e inglés.

**Latinoamérica**
- Leyes de protección de datos: Brasil (LGPD), México (LFPDPPP 2025), Argentina (Ley 25.326), Colombia (Ley 1581), Chile (Ley 21.719), entre otras. Algunas exigen avisos o registros específicos → LEGAL REVIEW REQUIRED.
- Algunas jurisdicciones regulan la publicidad de juegos de azar dirigida a menores.
- Revisar la disponibilidad de AdMob por país.

**Otros**
- **UE/EEE/UK/Suiza:** GDPR/UK GDPR, consentimiento UMP obligatorio y posible representante (art. 27). Algunos países (p. ej. Bélgica y Países Bajos con loot boxes) son estrictos con mecánicas de azar; aquí no hay compras, pero LEGAL REVIEW REQUIRED.
- **Países donde Play restringe apps de casino simulado:** se puede limitar la distribución por país en Play Console.
- **Corea del Sur, China, etc.:** normativas específicas → no distribuir sin revisión.

## 7. Qué no se ha verificado (NO VERIFICADO)

- Configuración real de la consola de AdMob (UMP, bloqueos, app-ads.txt, estado de la cuenta).
- Configuración de Play Console y la cuenta de desarrollador.
- CAPTCHA o confirmación de email en Supabase Auth.
- Borrado de extremo a extremo con una cuenta real (la función está desplegada, pero no se probó en vivo desde este entorno).
- Ley aplicable en cada región.
