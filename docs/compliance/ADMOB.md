# AdMob — configuración y consideraciones de social casino

> No se ha activado ninguna configuración de producción. Todo lo marcado **NO VERIFICADO** se debe comprobar en la consola de AdMob.
> Esto no es asesoría legal.

## Qué hace el código (verificado)
- `src/bank/admobProvider.ts`
  - `AdMob.initialize({ initializeForTesting, maxAdContentRating: 'Teen' })`: el SDK no pide anuncios con clasificación superior a Teen.
  - Consentimiento: `requestConsentInfo` y, si hace falta, `showConsentForm` (Google UMP). Si el usuario lo rechaza donde es obligatorio, no se piden anuncios. Si la comprobación falla (p. ej. no hay mensaje configurado), el código continúa: fuera de las regiones con consentimiento obligatorio, Google sirve anuncios igualmente.
  - Solo hay **anuncios recompensados**, siempre a petición del usuario (botón), nunca intersticiales automáticos.
  - SSV: `ssv: { userId, customData: userId }`, con el UUID interno del usuario.
- `supabase/functions/admob-ssv`
  - Verifica la firma ECDSA de Google con sus claves públicas.
  - El reward id de Google es único, así que no hay dobles cobros; tope de 20 recompensas al día.
  - El crédito lo da el servidor, no el cliente.
- Sin variables `ADMOB_APP_ID` / `VITE_ADMOB_REWARDED_ID` se usan los IDs de prueba de Google, que no generan ingresos ni tráfico real.
- En la web no hay anuncios reales: el proveedor web no está conectado a ninguna red.

## Configuración pendiente en la consola (NO VERIFICADO)
1. **Privacy & messaging**
   - [ ] Mensaje **GDPR** (EEE, UK, Suiza) con la política de privacidad `https://siiknotic.github.io/Unopro/legal/privacy-en.html`.
   - [ ] Mensaje de **estados de EE. UU.** (CCPA/CPRA y otros).
   - [ ] Opcional: mensaje de IDFA (solo iOS; no aplica).
2. **Blocking controls** → Sensitive categories. Bloquear como mínimo:
   - [ ] Gambling & betting (juego con dinero real). **Imprescindible**.
   - [ ] Dating, Sexual & suggestive content, Alcohol, Get rich quick, Drugs & supplements, Cosmetic procedures, Politics, Religion (recomendado por la audiencia).
   - [ ] Revisar "General categories" y el Ad review center tras el lanzamiento.
3. **Max ad content rating:** además del código, fijarlo en la app como **T (Teen)** o **G** en AdMob → App settings.
4. **Rewarded ad unit**
   - [ ] Activar Server-side verification con la URL `https://mdwkigzorhvktgqlffck.supabase.co/functions/v1/admob-ssv`.
   - [ ] Poner la recompensa a 1 (el importe real lo decide el servidor).
5. **app-ads.txt:** requiere el sitio web del desarrollador declarado en Play (NO VERIFICADO).
6. **Tag for child-directed treatment / under age of consent:** no marcar si la audiencia es 18+. Si la revisión legal decide lo contrario, activarlos (**LEGAL REVIEW REQUIRED**).

## Datos transmitidos a Google (para Data safety y Privacidad)
- Los recoge el SDK: AAID (Advertising ID), IP y ubicación aproximada, datos del dispositivo e interacciones con los anuncios. Ver la guía oficial de Data safety de Google Mobile Ads.
- Los envía la app: el UUID interno del usuario en el callback SSV.

## Consideraciones de social casino
- **Sin garantía absoluta:** aunque se bloqueen categorías, AdMob no garantiza al 100 % que todos los anuncios sean de juegos. Revisar periódicamente en el Ad review center.
- **Anuncios de apuestas con dinero real:** bloquearlos es clave para no sugerir que las coins virtuales llevan al juego real.
- **"Mira un anuncio y recibe coins":** permitido por la política de anuncios recompensados de AdMob si es opcional y la recompensa se da de verdad. Las coins no tienen valor monetario ni se pueden comprar ni canjear.
- **Disponibilidad regional:** AdMob no sirve en todos los países y algunas regiones limitan la publicidad a menores (**LEGAL REVIEW REQUIRED**).
- **Promoción con Google Ads:** requiere la certificación de social casino (distinta de AdMob) — NO VERIFICADO.
