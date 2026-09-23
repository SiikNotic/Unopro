# Validación masiva de los bots (Paso 4.5)

Datos brutos completos (todas las métricas por grupo): [`REPORT-DATA.md`](REPORT-DATA.md).
JSON: `diff-2p.json`, `diff-4p.json`, `pers-.json`, `team-.json`, `long.json`.

Reproducir:

```bash
npx vite-node scripts/bot-sim.ts -- --rounds 5000 --filter diff-2p --out reports/bots/diff-2p.json
npx vite-node scripts/bot-long.ts -- --games 60 --out reports/bots/long.json
npx vite-node scripts/bot-report.ts -- reports/bots/diff-2p.json reports/bots/diff-4p.json reports/bots/pers-.json reports/bots/team-.json
```

## Método

- Simulador puro (`src/game/bots/sim/`): motor + `createBotController`, sin React, sin navegador, sin `Math.random`/`Date.now`. Seeds 1…5000 por combinación.
- Los bots siguen recibiendo solo su `PlayerView`. El simulador mira el estado completo **solo para medir**.
- En cada combinación los grupos A y B intercambian asientos en seeds pares (`alternateSeats`) para anular la ventaja de posición.
- 1 vs 1 y 4 jugadores (A, B, A, B). Equipos: compañeros enfrentados (A, B, A, B — la disposición que usa la UI) y compañeros contiguos (A, A, B, B).
- **Decisión contrafactual:** en los experimentos de personalidad, cada decisión del grupo con personalidad se recalcula con `balanced` sobre el mismo estado y la misma seed → “% de decisiones idénticas a Balanced”.
- **Consistencia:** cada 10.ª decisión se repite con otras 4 seeds del bot → % de respuestas idénticas (mide cuánta aleatoriedad hay).
- Un oráculo de invariantes independiente comprueba cada acción (108 cartas, ids únicos, conteos, color, turno tras número/Skip, fin de ronda coherente).
- IC 95% de % de victorias: ±1,4 puntos con 5000 rondas.

## 1. Tabla resumen

| Configuración | Victorias A | Victorias B | % A | % B | Turnos prom. | UNO/ronda | Errores |
|---|---:|---:|---:|---:|---:|---:|---:|
| Fácil vs Fácil (1v1) | 2433 | 2567 | 48,7 | 51,3 | 42,2 | 1,82 | 0 |
| Fácil vs Normal (1v1) | 2072 | 2928 | 41,4 | 58,6 | 40,6 | 2,39 | 0 |
| Fácil vs Difícil (1v1) | 1824 | 3176 | 36,5 | 63,5 | 43,7 | 2,79 | 0 |
| Normal vs Normal (1v1) | 2475 | 2525 | 49,5 | 50,5 | 37,7 | 2,83 | 0 |
| Normal vs Difícil (1v1) | 2387 | 2613 | 47,7 | 52,3 | 38,9 | 3,00 | 0 |
| Difícil vs Difícil (1v1) | 2513 | 2487 | 50,3 | 49,7 | 39,3 | 3,14 | 0 |
| Fácil×2 vs Fácil×2 (4j) | 2492 | 2508 | 49,8 | 50,2 | 50,3 | 2,07 | 0 |
| Fácil×2 vs Normal×2 (4j) | 1986 | 3014 | 39,7 | 60,3 | 50,4 | 2,78 | 0 |
| Fácil×2 vs Difícil×2 (4j) | 1746 | 3254 | 34,9 | 65,1 | 53,2 | 3,22 | 0 |
| Normal×2 vs Normal×2 (4j) | 2535 | 2465 | 50,7 | 49,3 | 47,9 | 3,16 | 0 |
| Normal×2 vs Difícil×2 (4j) | 2385 | 2615 | 47,7 | 52,3 | 49,4 | 3,42 | 0 |
| Difícil×2 vs Difícil×2 (4j) | 2528 | 2472 | 50,6 | 49,4 | 50,9 | 3,71 | 0 |
| Normal: Balanced vs Aggressive | 2534 | 2466 | 50,7 | 49,3 | 49,1 | 3,22 | 0 |
| Normal: Balanced vs Defensive | 2520 | 2480 | 50,4 | 49,6 | 47,4 | 3,15 | 0 |
| Normal: Balanced vs Risky | 2657 | 2343 | 53,1 | 46,9 | 49,4 | 3,17 | 0 |
| Normal: Balanced vs Team Player | 2522 | 2478 | 50,4 | 49,6 | 48,0 | 3,16 | 0 |
| Difícil: Balanced vs Aggressive | 2629 | 2371 | 52,6 | 47,4 | 51,9 | 3,68 | 0 |
| Difícil: Balanced vs Defensive | 2427 | 2573 | 48,5 | 51,5 | 50,1 | 3,60 | 0 |
| Difícil: Balanced vs Risky | 2696 | 2304 | 53,9 | 46,1 | 51,8 | 3,64 | 0 |
| Difícil: Balanced vs Team Player | 2550 | 2450 | 51,0 | 49,0 | 50,5 | 3,64 | 0 |
| 2v2 enfrentados Normal: TP vs Balanced | 2456 | 2544 | 49,1 | 50,9 | 47,9 | 3,06 | 0 |
| 2v2 enfrentados Difícil: TP vs Balanced | 2521 | 2479 | 50,4 | 49,6 | 48,8 | 3,49 | 0 |
| 2v2 contiguos Normal: TP vs Balanced | 2669 | 2331 | 53,4 | 46,6 | 44,6 | 2,98 | 0 |
| 2v2 contiguos Difícil: TP vs Balanced | 2584 | 2416 | 51,7 | 48,3 | 45,5 | 3,38 | 0 |

(Fácil: Balanced vs cada personalidad y las líneas base Balanced vs Balanced en equipos están en `REPORT-DATA.md`; todas 49–51%.)

## 2. Diferencias por dificultad

Métricas de comportamiento (4 jugadores, grupo en su propia partida espejo; 1 vs 1 da valores equivalentes):

| Métrica | Fácil | Normal | Difícil |
|---|---:|---:|---:|
| Consistencia (misma decisión con otra seed) | 72 % | 81–82 % | 91 % |
| Wild jugado habiendo alternativa no-Wild | 30 % | 6,8 % | 7,5 % |
| Ataca al siguiente rival con ≤2 cartas (cuando puede) | 64–65 % | 88–89 % | 90–91 % |
| Canta UNO (configurado 55/85/97 %) | 54 % | 84 % | 97 % |
| Olvida UNO | 45 % | 15 % | 3 % |
| Penaliza UNO (configurado 25/60/90 %) | 25 % | 60 % | 87–92 % |
| Color fit tras su jugada | 0,28 | 0,31 | 0,30 |
| % de jugadas: número / acción / Wild | 69 / 22 / 9 | 69 / 23 / 9 | 69 / 23 / 9 |
| Roba teniendo jugada legal | 0 % | 0 % | 0 % |
| Cartas robadas por asiento y ronda (espejo) | 6,7 | 6,3 | 6,7 |

Lo que los datos permiten afirmar:

- **Fácil es claramente más débil y más aleatorio.** Pierde con Normal (39,7 % / 41,4 %) y con Difícil (34,9 % / 36,5 %); los intervalos no se solapan con 50 %. Gasta Wilds innecesariamente 4 veces más, ataca menos a rivales cerca de ganar y olvida UNO casi la mitad de las veces.
- **Difícil gana a Normal, pero por poco:** 52,3 % en 1 vs 1 y en 4 jugadores (IC ±1,4 → diferencia real pero pequeña).
- **Normal y Difícil casi no se distinguen en decisiones de juego:** conservación de Wilds (6,8 vs 7,5 %), ataque a amenazas (88 vs 90 %), color fit (0,31 vs 0,30) y reparto de jugadas son prácticamente iguales. Donde sí difieren es en **UNO** (84 vs 97 %), **penalizaciones** (60 vs 90 %) y **consistencia** (82 vs 91 %). Hipótesis (no demostrada, requeriría un experimento de ablación que cambie perfiles): la mayor parte de la ventaja de Difícil sobre Normal viene del UNO y de las penalizaciones, no de mejores jugadas.
- **Difícil no aprovecha mejor los colores** que Normal según la métrica de color fit.
- La lectura de mesa de Difícil (`readsTable`: colores que faltan a otros, quién juega después) no produce una diferencia medible de victorias frente a Normal más allá de ese 2,3 %.

## 3. Diferencias por personalidad (misma dificultad)

% de decisiones idénticas a lo que habría hecho Balanced en el mismo estado:

| Personalidad | Fácil | Normal | Difícil |
|---|---:|---:|---:|
| Aggressive | 99,1 % | 94,8 % | 94,0 % |
| Defensive | 99,5 % | 96,1 % | 97,3 % |
| Risky | 99,3 % | 94,6 % | 90,7 % |
| Team Player (partida sin equipos) | 99,95 % | 99,7 % | 99,5 % |

Métricas que realmente cambian (Normal / Difícil):

| Métrica | Balanced | Aggressive | Defensive | Risky |
|---|---:|---:|---:|---:|
| Wild con alternativa | 6,2–7,5 % | 14,8 / 17,6 % | 4,3 / 3,8 % | 38,1 / 46,8 % |
| % jugadas de acción | 22,5–22,7 % | 23,9 / 23,6 % | 21,4 / 22,1 % | 23,5 / 23,6 % |
| % jugadas de número | 68,9 % | 67,4 / 67,6 % | 70,0 / 69,5 % | 67,5 / 67,3 % |
| Roba teniendo jugada | 0 % | 0 % | 0,1 / 2,4 % | 0 % |
| % victorias vs Balanced | — | 49,3 / 47,4 % | 49,6 / 51,5 % | 46,9 / 46,1 % |

- **Risky** es la personalidad más distinta: usa Wild con alternativa 5–6 veces más que Balanced. **Pierde** frente a Balanced (46–47 %, diferencia significativa).
- **Aggressive** usa más Wilds y más cartas de acción, pero su tasa de “ataca a amenaza” es igual a Balanced (89,6 vs 89,3 %; 91,0 vs 91,1 %) porque Balanced ya ataca casi siempre que puede. En Difícil **pierde** frente a Balanced (47,4 %). En Fácil sí ataca más a amenazas (76 vs 65 %).
- **Defensive** guarda más Wilds (3,8–4,3 %) y juega menos acción; a veces roba para no gastar un Wild (2,4 % en Difícil). Resultado: empate en Normal, ligera ventaja en Difícil (51,5 %, justo en el borde del IC).
- En **Fácil** las personalidades casi no se notan (≥99 % decisiones idénticas): el ruido y los errores de Fácil dominan.
- Ninguna personalidad cambia UNO ni penalizaciones (no están en sus modificadores).

## 4. Team Player

| Escenario | Decisiones idénticas a Balanced | % victorias equipo TP | Línea base Bal vs Bal |
|---|---:|---:|---:|
| 4 jugadores sin equipos | 99,5–99,95 % | 49–50 % | — |
| 2v2 compañeros **enfrentados** (disposición de la UI), Normal | 98,6 % | 49,1 % | 50,1 % |
| 2v2 compañeros enfrentados, Difícil | 99,3 % | 50,4 % | 50,2 % |
| 2v2 compañeros **contiguos**, Normal | 94,3 % | **53,4 %** | 50,6 % |
| 2v2 compañeros contiguos, Difícil | 95,8 % | 51,7 % | 49,9 % |

Métricas de equipo (contiguos, TP vs Balanced en la misma partida):

| Métrica | TP Normal | Bal Normal | TP Difícil | Bal Difícil |
|---|---:|---:|---:|---:|
| Ataques al compañero por 1000 decisiones | 12,4 | 42,4 | 1,2 | 27,1 |
| Compañero con 1–2 cartas: el turno pasa a él | 61,5 % | 51,0 % | 71,2 % | 63,7 % |
| Turno pasa al compañero (todas) | 46,6 % | 43,4 % | 47,5 % | 44,6 % |
| Roba teniendo jugada legal | 19,3 % | 1,3 % | 24,8 % | 10,7 % |
| Color fit del compañero tras elegir color | 0,29 | 0,29 | 0,29 | 0,29 |

En compañeros enfrentados: ataques al compañero 0 en todos (el siguiente jugador siempre es rival), “turno → compañero con ≤2 cartas” 14,1 % TP vs 14,3–15,4 % Balanced.

Conclusión sobre Team Player:

- **Sigue ocurriendo:** en la disposición que usa la UI (compañeros enfrentados) Team Player toma la misma decisión que Balanced en el 98,6–99,3 % de los casos y no cambia el resultado. En partidas sin equipos es idéntico (no hay compañero que considerar).
- **Sí cambia el comportamiento con compañeros contiguos:** evita atacar al compañero (1,2–12,4 vs 27–42 por 1000 decisiones), le pasa el turno más cuando está cerca de ganar y gana más (53,4 % en Normal, significativo; 51,7 % en Difícil, marginal). Para lograrlo roba mucho más teniendo jugadas legales (19–25 %): prefiere robar antes que saltar al compañero.
- **No elige colores mejores para el compañero:** el color fit real del compañero es 0,29 igual que Balanced (no puede ver su mano; la única pista pública son los robos, y no alcanza).
- **Balanced también perjudica bastante al compañero contiguo** (27–45 ataques por 1000 decisiones). Parte pueden ser ataques forzados (única jugada legal), la métrica no lo distingue.

## 5. Información oculta

- Tests nuevos (`hiddenInfo.extended.test.ts`, 12 casos): en cada decisión de partidas reales se altera **solo** información oculta, verificando que lo público sigue idéntico (descarte, conteos, mano propia):
  manos de los rivales · mano del compañero · orden del mazo · seed y estado del PRNG del motor · ids de todas las cartas ocultas · todo a la vez. En modo clásico y 2v2.
- Resultado: **la decisión fue idéntica en todos los casos** (>300 decisiones por caso; más de 3600 comparaciones en total), y el test comprueba que la perturbación realmente cambió los datos ocultos.
- Junto con los tests previos (`hiddenInfo.test.ts`, `playerView.test.ts`), las pruebas confirman que los bots no usan información privada.

## 6. Determinismo

- Mismo seed + misma configuración → métricas y hash de toda la secuencia de decisiones idénticos: dentro del mismo proceso (test) y **entre dos procesos separados** (500 rondas, hash 2904399480 en ambas ejecuciones).
- Seeds distintas producen partidas distintas (test).
- No se encontró ninguna diferencia entre ejecuciones con la misma seed.

## 7. Estabilidad

Simulaciones por combinación (32 combinaciones × 5000 rondas):

| | Rondas |
|---|---:|
| Simuladas | 160 000 |
| Terminadas correctamente | 160 000 |
| Fallidas | 0 |
| Bloqueadas (bot sin acción) | 0 |
| Bucles (>5000 acciones) | 0 |
| Acciones ilegales | 0 |
| Violaciones de invariantes | 0 |

_Partidas largas: en ejecución; se añaden en el siguiente commit._

## 8. Rendimiento

- 1000 rondas de 4 bots: ~13–17 s (un núcleo, con métricas, contrafactual y consistencia activados; sin instrumentación son más rápidas).
- 5000 rondas: 53–86 s por combinación (1 vs 1 más rápido; Fácil vs Difícil el más lento porque las rondas duran más).
- Tanda completa de 160 000 rondas: 2204 s de CPU, ~14 min en 4 procesos.
- Cuello de botella observado: `structuredClone` del estado completo en cada `applyAction` (el log crece durante la ronda) y el `validateAction` por carta que hacen bot y analizador. No se optimizó (no era necesario).

## 9. Bugs encontrados

- **Ninguno** en el motor, en la estrategia de los bots ni en el simulador durante las 160 000 rondas ni en las partidas largas.
- No se modificaron pesos, probabilidades, dificultades ni personalidades. No se añadieron tests de regresión (no hubo bug que reproducir).

Hallazgos de diseño (no son bugs, pero son relevantes):

1. Team Player no tiene efecto en la disposición de equipos que usa la UI (compañeros enfrentados).
2. Normal y Difícil apenas se distinguen en calidad de jugadas; la diferencia está en UNO/penalizaciones/consistencia.
3. Aggressive y Risky pierden frente a Balanced (46–47 %): sus modificadores empeoran el juego.
4. Team Player (contiguos) roba teniendo jugadas legales en el 19–25 % de sus robos para no saltar al compañero.
5. Balanced ataca al compañero contiguo 27–45 veces por 1000 decisiones.

## 10. Conclusión

- **Demostrado:** Fácil es más débil (35–41 % contra Normal/Difícil) y más aleatorio (72 % consistencia). Difícil es más consistente (91 %) y mucho más fiable con UNO y penalizaciones. Risky, Aggressive y Defensive cambian de forma medible el uso de Wilds.
- **Pequeño:** Difícil vs Normal = 52,3 %. Defensive vs Balanced (Difícil) = 51,5 %. Team Player contiguos en Difícil = 51,7 %.
- **Personalidades con comportamiento realmente distinto:** Risky (hasta 9,3 % de decisiones distintas), Aggressive (5–6 %), Defensive (3–4 %). Team Player solo con compañeros contiguos (4–6 %); con compañeros enfrentados, <1,5 %.
- **No funciona bien todavía:** Team Player en la disposición de la UI; Difícil apenas juega mejor que Normal; Aggressive/Risky son peores que Balanced; ninguna dificultad mejora la elección de color para el compañero.
- **Para la siguiente fase (propuesta, no aplicada):** dar a Team Player comportamientos que importen con compañeros enfrentados (p. ej. preferir Skip/+2 que entregan el turno al compañero cuando tiene pocas cartas, no penalizar/atacar cuando ayuda al rival siguiente); separar mejor Normal y Difícil en decisiones de juego (no solo UNO); revisar los modificadores de Aggressive/Risky; y medir de nuevo con este mismo simulador.
