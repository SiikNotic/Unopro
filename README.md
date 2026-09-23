# Unopro

Juego de cartas estilo UNO hecho con React, TypeScript, Vite y Tailwind CSS.

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

## Motor del juego (`src/game/engine`)

Independiente de React. Todo pasa por una única función pura:

```ts
applyAction(state, action) // → { ok: true, state } | { ok: false, error, state }
```

- Determinista: la partida lleva su semilla (`seed`) y el estado del generador aleatorio dentro del `GameState`, así que la misma semilla con las mismas acciones da siempre el mismo resultado (`replay()`).
- Acciones: `PLAY_CARD`, `DRAW_CARD`, `CHOOSE_COLOR`, `CALL_UNO`, `CHALLENGE_UNO`, `END_TURN`, `START_GAME`, `RESTART_GAME`. Se validan con `validateAction()` antes de tocar el estado.
- Reglas oficiales por defecto; las reglas caseras (`stacking`, `jumpIn`, `drawUntilPlayable`, `forcePlay`) se activan en `GameSettings`.
- **Modos de juego → Clásico / Equipos** abre la mesa de juego (`src/components/table/`). La mesa solo lee el `GameState` y envía `GameAction`s; los rivales los mueven los bots (`src/game/bots/`): reciben solo la vista de su jugador (`createPlayerView`), eligen entre acciones que `validateAction` acepta y se configuran en `src/game/bots/config.ts` (dificultad, personalidad y tiempo de pensamiento). Panel de debug solo en desarrollo.

## Estructura

- `src/game/engine` — motor del juego (mazo, turnos, reglas, efectos) y sus tests
- `src/game/rules` — modos de juego
- `src/game/multiplayer` — tipos para el modo multijugador
- `src/screens` — pantallas (inicio, modos, ajustes, tutorial)
- `src/components` — componentes de UI
- `src/i18n` — traducciones (español / inglés)
- `src/storage` — persistencia local
