# Tragamonedas: plan de diseño

Referencia de diseño de las 8 máquinas. Cada una comparte el motor (`src/casino/premium/engine.ts`) y
tiene su propia matemática (`src/casino/premium/machines.ts`) y su propia presentación
(`src/components/slots/presentation.ts`).

## Cómo se siente una máquina premium real

- **El mueble es la marca.** Topper, marco y botonera dicen en qué máquina estás antes de girar.
- **La ventana de rodillos es el escenario**: lo más brillante de la pantalla; todo lo demás acompaña.
- **Botonera táctil**: SPIN grande bajo el pulgar, apuesta a un lado, AUTO y MAX al otro.
- **El premio se escenifica por niveles**: símbolos ganadores animados → líneas → *rollup* del
  medidor de créditos → celebración solo si el premio lo merece (small / win / big / mega / jackpot).
- **Casi-premio (anticipación)**: los últimos rodillos frenan más despacio cuando hay opción real.
- **Datos reales a la vista**: RTP, frecuencia de acierto, volatilidad y premio máximo salen de la
  simulación de la matemática de cada máquina, no de un texto inventado.

## Sistema común

- Barra superior del casino (volver, saldo, reglas) igual en todas: orientación y confianza.
- Botonera con la misma posición en todas las máquinas; cambia el material, no el sitio.
- Tipografía de marca por máquina (Google Fonts, cargada solo al abrir esa máquina) y cuerpo común
  (Inter) para cifras y textos de ayuda, con `tabular-nums` en medidores.

## Las máquinas

| Máquina | Concepto | Paleta | Display | Rodillos y símbolos | Movimiento | Celebración | Sonido | Matemática |
|---|---|---|---|---|---|---|---|---|
| Lucky 7s | Vertical cromada de Las Vegas años 70 | laca #141012, cromo #D9DDE3, rojo cereza #C8102E, bombilla #FFB547, papel de rodillo #F1E6CF | Bungee | Rodillos mecánicos de papel con símbolos impresos (7, BAR, campana, cereza, limón, moneda); barra cromada de línea | Mecánico: arranque seco, rebote marcado, paradas espaciadas | Campana, persecución de bombillas; monedas en la bandeja en premios grandes | Trinquete, campana, tolva de monedas; murmullo de sala | Volatilidad baja, 5 líneas, campanas *scatter* pagan en cualquier posición |
| Diamond Royale | Vitrina de joyería sobre terciopelo | terciopelo #07080C, platino #E6E9EF, hielo #BFE6FF, zafiro #2B5FD9, champán #E8CF9A | Cormorant Garamond | Gemas facetadas dibujadas (brillante, esmeralda, rubí, zafiro), corona y anillo; letras grabadas | Deslizamiento suave y largo, casi sin rebote | Rayos de luz sobre el cristal, destellos de estrella; nada de monedas | Campanillas de cristal; pad aéreo | Volatilidad media, 10 líneas, comodín de cristal que se expande en los rodillos 2–4 |
| Golden Fortune | Tesoro de un templo antiguo | basalto #1B1712, oro bruñido #D4A437, oro vivo #FFE08A, jade #2E8B6F, laca roja #9E2B25 | Cinzel | Medallones de oro acuñados, lingotes, ídolo, reloj de arena | Pesado, con inercia | Monedas girando y lluvia de oro; la bóveda de monedas | Tintineo de monedas, gong | Volatilidad media-alta, 20 líneas, bonus **Bóveda de monedas** |
| Inferno | Forja volcánica | obsidiana #120807, magma #FF4D00, brasa #FFB020, ceniza #3A2A26, incandescente #FFF1C1 | Anton | Emblemas ardiendo sobre piedra; marco anguloso con grietas de lava | Agresivo: muy rápido, frenada seca, paradas en ráfaga | Brasas que suben, destello de fuego; temblor sutil solo en premios grandes | Llamarada, impactos graves; pulso intenso | Volatilidad alta, 20 líneas, comodín con multiplicador ×2/×3/×5 y giros gratis con multiplicador creciente |
| Tropical Paradise | Chiringuito al atardecer | laguna #0FB5AE, mar profundo #083D4F, coral #FF6F59, atardecer #FFB74A, palmera #1F7A4D | Lilita One | Frutas en burbujas blandas, isla, velero, concha | Suave y elástico | Burbujas y hojas flotando; flores en premios grandes | Marimba, olas, pájaros | Volatilidad media, 15 líneas, **Giros de la isla** (10 gratis, premios ×2) |
| Pirate's Gold | Mesa de cartas del capitán | madera #2A1A10, pergamino #E9D3A5, tinta #2B1D14, doblón #E0A83A, carmesí #9B1B1B | Pirata One | Rodillos de pergamino con símbolos a tinta; líneas de pago como rutas punteadas de mapa | Pesado, balanceo de barco | Monedas volando; el cofre se abre | Golpes de madera, campana de barco, olas | Volatilidad media-alta, 20 líneas, bonus **Cofres del tesoro** |
| Cosmic Spins | HUD de observatorio | vacío #05040F, nebulosa #6B2BD9, plasma #35E0FF, magenta #FF3DCB, luz estelar #F4F2FF | Orbitron | Glifos de neón sin placa, planetas esféricos; campo de estrellas detrás | Salto a hiperespacio: velocidad máxima, estelas largas | Portal que se expande, estallido de estrellas | Barridos de sintetizador, arpegios | Volatilidad alta, 25 líneas, multiplicador cósmico ×2–×10 y giros gratis |
| Royal Jackpot | Salón de Montecarlo, art déco negro y oro | ónice #0B0B0D, oro déco #C9A24A, champán #F1DFAE, marfil #F7F3EA, burdeos #5A0F1E | Limelight | Medallas de esmalte negro con bisel dorado; escalera de jackpots GRAND / MAJOR / MINOR sobre los rodillos | Majestuoso, paradas lentas | Rayos dorados, corona que cae en el jackpot | Fanfarria de metales, arpa | Volatilidad media-alta, 10 líneas, **escalera de jackpots** con coronas *scatter* |

## Rendimiento

- Efectos pesados (distorsión de calor, campo de estrellas, rayos) se reducen o se apagan en
  dispositivos modestos (`hardwareConcurrency` ≤ 4 o `deviceMemory` ≤ 4) y con movimiento reducido.
- Partículas en un solo canvas con tope; bucles de animación solo mientras algo se mueve.
- Un solo contexto de audio; música ambiental generada, una instancia por máquina, parada al salir
  o al pasar a segundo plano.

## Números reales

`src/casino/premium/machineStats.ts` se genera con `npm run slots:stats`: el RTP es exacto (calculado a
partir de las tiras) y la frecuencia de premios, la volatilidad y la frecuencia de features se simulan
con 2 millones de rondas por máquina. Los tests fallan si la configuración cambia sin regenerarlo.
