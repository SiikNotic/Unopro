# Unopro

Juego de cartas estilo UNO hecho con React, TypeScript, Vite y Tailwind CSS.

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

## Estructura

- `src/game/engine` — motor del juego (mazo, turnos, reglas, efectos) y sus tests
- `src/game/rules` — modos de juego
- `src/game/multiplayer` — tipos para el modo multijugador
- `src/screens` — pantallas (inicio, modos, ajustes, tutorial)
- `src/components` — componentes de UI
- `src/i18n` — traducciones (español / inglés)
- `src/storage` — persistencia local
