# Carta Casino

**Carta Casino** es un casino social de **LiveNest** (contacto: livenestapp@gmail.com): juegos de mesa, de
cartas, puzzle y casino con **monedas virtuales**. Sin dinero real: no se compran monedas, no hay retiros
ni premios reales. Hecho con React, TypeScript, Vite y Tailwind CSS; app Android con Capacitor
(`io.github.siiknotic.carta`) y servidor en Supabase.

> El repositorio se llama `Unopro` por su origen, pero el producto es Carta Casino. Carta (el juego de
> cartas estilo UNO) es solo uno de sus juegos.

## Juegos

Carta, Dominó, Bingo, Jewellery: Olympus, Crash, Carta Horse Racing, Air Hockey Casino, Blackjack,
Ruleta, Póker y Tragamonedas. La lista única está en `src/games/catalog.ts` (ver
`docs/games-platform.md`); cada juego tiene su documento en `docs/`.

## Banco

Monedas para quien se queda sin saldo: recompensa por anuncio (verificada por el servidor con AdMob SSV)
y préstamo de emergencia. Ver `docs/bank.md`.

## Jugar online

GitHub Pages: https://siiknotic.github.io/Unopro/

Se publica automáticamente con `.github/workflows/deploy.yml` en cada push a la rama por defecto
(tests, typecheck, lint y build deben pasar). Requiere **Settings → Pages → Source: GitHub Actions**.

## Requisitos

- Node.js 22 o superior

## Comandos

```bash
npm install        # instalar dependencias
npm run dev        # servidor de desarrollo
npm run build      # build de producción (carpeta dist/)
npm run preview    # previsualizar el build
npm test           # tests (Vitest)
npm run typecheck  # comprobación de tipos
npm run lint       # ESLint
```

## Carta: motor del juego (`src/game/engine`)

Independiente de React. Todo pasa por una única función pura:

```ts
applyAction(state, action) // → { ok: true, state } | { ok: false, error, state }
```

- Determinista: la partida lleva su semilla (`seed`) y el estado del generador aleatorio dentro del `GameState`, así que la misma semilla con las mismas acciones da siempre el mismo resultado (`replay()`).
- Acciones: `PLAY_CARD`, `DRAW_CARD`, `CHOOSE_COLOR`, `CALL_UNO`, `CHALLENGE_UNO`, `END_TURN`, `START_GAME`, `RESTART_GAME`. Se validan con `validateAction()` antes de tocar el estado.
- Reglas oficiales por defecto; las reglas caseras (`stacking`, `jumpIn`, `drawUntilPlayable`, `forcePlay`) se activan en `GameSettings`.
- **Modos de juego → Clásico / Equipos** abre la mesa de juego (`src/components/table/`). La mesa solo lee el `GameState` y envía `GameAction`s; los rivales los mueven los bots (`src/game/bots/`): reciben solo la vista de su jugador (`createPlayerView`), eligen entre acciones que `validateAction` acepta y se configuran en `src/game/bots/config.ts` (dificultad, personalidad y tiempo de pensamiento). Panel de debug solo en desarrollo.

## Ajustes y escenarios

- **Ajustes**: dificultad de los bots (Fácil / Normal / Difícil, usa las dificultades existentes), escenario
  (Aleatorio o fijo), sonido, vibración y animaciones. Se guardan en el navegador (`src/settings/`).
- **Escenarios** (`src/game/scenarios/` + `src/components/scene/`): Cielo, Volcán, Océano, Espacio, Bosque,
  Ciudad y Salón, animados con CSS. Uno por partida; "Aleatorio" evita repetir el anterior.
- **Sonido** (`src/audio/`): efectos originales sintetizados con Web Audio, sin archivos externos.

## Estructura

- `src/game/engine` — motor de Carta (mazo, turnos, reglas, efectos) y sus tests
- `src/game/rules` — modos de Carta
- `src/games` — el resto de juegos (dominó, bingo, crash, caballos, air hockey, póker…) y el catálogo
- `src/casino`, `src/bank`, `src/account`, `src/staff` — monedas, Banco, cuentas y panel del staff
- `supabase/` — migraciones SQL, funciones Edge y sus tests
- `src/screens` — pantallas (inicio, jugar, ajustes, tutoriales)
- `src/components` — componentes de UI
- `src/i18n` — traducciones (español / inglés)
- `src/storage` — persistencia local
