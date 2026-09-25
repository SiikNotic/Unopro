# Checklist de Google Play — Carta Casino

> Solo preparación: **no se envía nada a Google automáticamente**. Esto no es asesoría legal.
> Rellenar los formularios de Play Console con estos datos, que salen de `DATA_INVENTORY.md` y de `AUDIT.md`.

## 0. Build correcto
- [ ] Subir el **AAB del flavor `play`** (artefacto `carta-play-aab` del workflow *Android app*, job `play-bundle`), **nunca** el APK `direct`.
- [ ] Comprobar que el job verificó que **no** tiene `REQUEST_INSTALL_PACKAGES` ("OK: no REQUEST_INSTALL_PACKAGES").
- [ ] Ajustar `APP_VERSION_NAME` / `APP_VERSION_CODE` del job `play-bundle` antes de cada subida: ahora son `1.0` / `1` y cada subida necesita un versionCode mayor.
- [ ] Play App Signing: la clave del CI actúa como clave de subida.
- [ ] `ADMOB_APP_ID` y `VITE_ADMOB_REWARDED_ID` de producción configurados como Variables del repositorio (sin ellos se usan los IDs de prueba de Google).

## 1. Antes de enviar (bloqueantes)
- [ ] `src/legal/config.ts`: responsable (`owner`), email de contacto (`contactEmail`) y edad mínima (`minimumAge`), y después `npm run legal:build`.
- [ ] Revisión legal de Términos, Privacidad y Reglas de moneda virtual (**LEGAL REVIEW REQUIRED**).
- [ ] AdMob: mensajes UMP (GDPR y estados de EE. UU.) y bloqueos de categorías (ver `ADMOB.md`).
- [ ] Verificar en vivo el borrado de cuenta (crear una cuenta de prueba → Eliminar → ya no puede iniciar sesión).

## 2. App content (Play Console → Policy → App content)
| Sección | Valor sugerido |
|---|---|
| Privacy policy | `https://siiknotic.github.io/Unopro/legal/privacy-es.html` (EN: `privacy-en.html`) |
| Ads | **Sí, contiene anuncios** (AdMob, anuncios recompensados) |
| App access | Todo es accesible sin cuenta (modo invitado); la cuenta es opcional. Si Google lo pide, dar credenciales de prueba |
| Target audience | **Solo 18+** (recomendado por la temática de casino; confirmar con abogado). No seleccionar franjas de niños |
| Content rating (IARC) | Responder **Sí a "juego de azar simulado"** (Simulated gambling); sin dinero real ni premios. Resultado esperado: PEGI 18 / ESRB T–M / Adults only según región — NO VERIFICADO hasta completar el cuestionario |
| News app | No |
| Data safety | Ver §3 |
| Government app | No |
| Financial features | Ninguna |
| Health | No |
| Account deletion | En la app: Cuenta → Eliminar cuenta. URL web: `https://siiknotic.github.io/Unopro/legal/deletion-es.html` |

## 3. Data safety (según `DATA_INVENTORY.md`)
| Tipo de dato | Recopilado | Compartido | Propósito | Opcional | Notas |
|---|---|---|---|---|---|
| Email | Sí (solo con cuenta) | No | Gestión de cuenta | Sí | Supabase Auth |
| Nombre de usuario | Sí (con cuenta) | No* | Funcionalidad | Sí | *Visible para otros jugadores en las mesas |
| User IDs | Sí | Sí, con Google (AdMob SSV) | Funcionalidad, publicidad (verificación de la recompensa) | No con anuncios | UUID interno en el callback SSV |
| Device or other IDs (AAID) | Sí (por el SDK de AdMob) | Sí, con Google | Publicidad, análisis de anuncios, prevención de fraude | — | Declarado por el SDK de Google Mobile Ads |
| App interactions / in-game activity | Sí (saldo e historial virtual) | No | Funcionalidad | No | |
| Approximate location (IP) | Por el SDK de AdMob | Sí, con Google | Publicidad | — | Según la documentación de datos de Google Mobile Ads — verificar |
| Crash logs / Diagnostics | **NO VERIFICADO** | — | — | — | El código no tiene SDK de crash. Revisar lo que añade Play Console |
| Purchases / Financial info | **No** | — | — | — | No hay compras |
| Precise location, contacts, photos, mensajes | **No** | — | — | — | |

- [ ] Datos cifrados en tránsito: **Sí** (HTTPS).
- [ ] Los usuarios pueden pedir el borrado: **Sí** (en la app y por web).
- [ ] Completar la sección de SDK de Google Mobile Ads con su guía oficial de Data safety.

## 4. Permisos del AAB `play`
- `INTERNET`, `ACCESS_NETWORK_STATE` y el `AD_ID` que añade el SDK de AdMob → declarar el uso del Advertising ID: **Sí, para publicidad**.
- **Sin** `REQUEST_INSTALL_PACKAGES` (lo elimina el manifiesto `src/play`).

## 5. Ficha de la tienda
- [ ] Nombre y descripción sin marcas de casinos reales, sin "gana dinero", "cash", "premios" ni "$".
- [ ] Incluir en la descripción: "Solo monedas virtuales. Sin dinero real, sin premios, sin cash-out. La práctica o el éxito en juegos de casino simulado no implica éxito futuro en juegos con dinero real."
- [ ] Capturas de 360–412 px (teléfono) y de 768/1024 (tableta) sin símbolos de dinero.
- [ ] Icono y gráfico destacado originales.
- [ ] Categoría: Juegos → Casino.
- [ ] Email de contacto del desarrollador (el mismo de `LEGAL_CONFIG`).

## 6. Distribución
- [ ] Elegir países tras la revisión legal (ver `AUDIT.md` §6). Excluir los que prohíben o restringen el casino simulado.
- [ ] Empezar con un test interno o cerrado antes de producción.
- [ ] `app-ads.txt` en el dominio del desarrollador declarado en Play (requiere dominio propio — NO VERIFICADO).

## 7. Si se promociona con Google Ads
- [ ] Solicitar la certificación de **social casino games** de Google Ads antes de anunciar (NO VERIFICADO).
