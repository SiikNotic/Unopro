# Bot validation — raw data

Generated from: reports/bots/diff-2p.json, reports/bots/diff-4p.json, reports/bots/pers-.json, reports/bots/team-.json

**Totals:** 160000 rounds, 160000 finished, 0 unfinished, 0 illegal actions, 0 invariant violations, 0 stalls, 0 loops, 2204 s CPU.

**Failures recorded:** 0

## Difficulty — 1 vs 1
| Configuration | A | B | Wins A | Wins B | % A (95% CI) | % B | Avg turns | UNO calls/round | Unfinished | Errors | Time |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| easy vs easy (1 vs 1) | easy/balanced | easy/balanced | 2433 | 2567 | 48.7% ±1.4 | 51.3% | 42.2 | 1.82 | 0 | 0 | 61.5 s |
| easy vs normal (1 vs 1) | easy/balanced | normal/balanced | 2072 | 2928 | 41.4% ±1.4 | 58.6% | 40.6 | 2.39 | 0 | 0 | 60.5 s |
| easy vs hard (1 vs 1) | easy/balanced | hard/balanced | 1824 | 3176 | 36.5% ±1.3 | 63.5% | 43.7 | 2.79 | 0 | 0 | 74.3 s |
| normal vs normal (1 vs 1) | normal/balanced | normal/balanced | 2475 | 2525 | 49.5% ±1.4 | 50.5% | 37.7 | 2.83 | 0 | 0 | 52.8 s |
| normal vs hard (1 vs 1) | normal/balanced | hard/balanced | 2387 | 2613 | 47.7% ±1.4 | 52.3% | 38.9 | 3.00 | 0 | 0 | 56.7 s |
| hard vs hard (1 vs 1) | hard/balanced | hard/balanced | 2513 | 2487 | 50.3% ±1.4 | 49.7% | 39.3 | 3.14 | 0 | 0 | 57.3 s |

| Configuration | Group | Profile | Win % | Cards left (losers) | Cards drawn/seat | Wilds/seat | Actions/seat | Number % | Action % | Wild % | Wild w/ alternative | Color change/play | Color fit | Attack % of plays | Hits threat | Draw w/ legal play | UNO call | UNO forget | Challenge | Consistency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| easy vs easy (1 vs 1) | A | easy/balanced | 48.7% | 5.2 | 12.2 | 1.36 | 3.66 | 69.9% | 22.0% | 8.1% | 28.7% | 0.27 | 0.28 | 26.0% | 61.4% | 0.0% | 54.3% | 45.1% | 24.4% | 75.0% |
|  | B | easy/balanced | 51.3% | 5.3 | 12.2 | 1.38 | 3.65 | 69.9% | 21.8% | 8.3% | 29.1% | 0.27 | 0.28 | 25.8% | 61.4% | 0.0% | 54.6% | 44.6% | 25.3% | 74.9% |
| easy vs normal (1 vs 1) | A | easy/balanced | 41.4% | 5.3 | 12.1 | 1.35 | 3.53 | 69.7% | 22.0% | 8.4% | 29.3% | 0.27 | 0.28 | 26.1% | 62.9% | 0.0% | 53.5% | 46.2% | 23.3% | 75.8% |
|  | B | normal/balanced | 58.6% | 5.1 | 11.4 | 1.32 | 3.62 | 69.8% | 22.1% | 8.1% | 6.8% | 0.29 | 0.30 | 26.1% | 85.3% | 0.0% | 83.4% | 15.1% | 59.5% | 82.5% |
| easy vs hard (1 vs 1) | A | easy/balanced | 36.5% | 5.3 | 13.4 | 1.43 | 3.77 | 69.7% | 22.0% | 8.3% | 30.0% | 0.28 | 0.28 | 26.0% | 64.8% | 0.0% | 54.0% | 45.8% | 23.0% | 75.8% |
|  | B | hard/balanced | 63.5% | 5.2 | 12.3 | 1.39 | 3.91 | 69.7% | 22.4% | 8.0% | 7.3% | 0.29 | 0.30 | 26.3% | 84.1% | 0.0% | 95.1% | 2.9% | 90.2% | 91.0% |
| normal vs normal (1 vs 1) | A | normal/balanced | 49.5% | 5.0 | 10.7 | 1.23 | 3.41 | 69.5% | 22.4% | 8.1% | 6.4% | 0.29 | 0.30 | 26.5% | 88.6% | 0.0% | 84.2% | 15.2% | 60.3% | 83.7% |
|  | B | normal/balanced | 50.5% | 5.2 | 10.7 | 1.26 | 3.40 | 69.4% | 22.3% | 8.3% | 7.2% | 0.29 | 0.30 | 26.4% | 88.8% | 0.0% | 84.9% | 14.5% | 57.5% | 83.6% |
| normal vs hard (1 vs 1) | A | normal/balanced | 47.7% | 5.0 | 11.2 | 1.27 | 3.53 | 69.3% | 22.6% | 8.1% | 7.4% | 0.29 | 0.30 | 26.7% | 90.5% | 0.0% | 84.8% | 15.1% | 56.8% | 84.1% |
|  | B | hard/balanced | 52.3% | 5.1 | 10.9 | 1.29 | 3.45 | 69.5% | 22.2% | 8.3% | 7.5% | 0.29 | 0.30 | 26.2% | 88.8% | 0.0% | 96.4% | 2.9% | 88.9% | 91.2% |
| hard vs hard (1 vs 1) | A | hard/balanced | 50.3% | 5.1 | 11.1 | 1.28 | 3.53 | 69.3% | 22.5% | 8.2% | 7.7% | 0.29 | 0.30 | 26.6% | 91.4% | 0.0% | 97.1% | 2.7% | 89.6% | 91.6% |
|  | B | hard/balanced | 49.7% | 5.1 | 11.2 | 1.29 | 3.48 | 69.5% | 22.2% | 8.3% | 7.3% | 0.29 | 0.30 | 26.3% | 90.4% | 0.0% | 96.7% | 3.2% | 89.9% | 91.5% |

## Difficulty — 4 players (2 seats each, alternating)
| Configuration | A | B | Wins A | Wins B | % A (95% CI) | % B | Avg turns | UNO calls/round | Unfinished | Errors | Time |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| easy ×2 vs easy ×2 (4 players, alternating seats) | easy/balanced | easy/balanced | 2492 | 2508 | 49.8% ±1.4 | 50.2% | 50.3 | 2.07 | 0 | 0 | 71.6 s |
| easy ×2 vs normal ×2 (4 players, alternating seats) | easy/balanced | normal/balanced | 1986 | 3014 | 39.7% ±1.4 | 60.3% | 50.4 | 2.78 | 0 | 0 | 75.0 s |
| easy ×2 vs hard ×2 (4 players, alternating seats) | easy/balanced | hard/balanced | 1746 | 3254 | 34.9% ±1.3 | 65.1% | 53.2 | 3.22 | 0 | 0 | 86.1 s |
| normal ×2 vs normal ×2 (4 players, alternating seats) | normal/balanced | normal/balanced | 2535 | 2465 | 50.7% ±1.4 | 49.3% | 47.9 | 3.16 | 0 | 0 | 65.3 s |
| normal ×2 vs hard ×2 (4 players, alternating seats) | normal/balanced | hard/balanced | 2385 | 2615 | 47.7% ±1.4 | 52.3% | 49.4 | 3.42 | 0 | 0 | 70.0 s |
| hard ×2 vs hard ×2 (4 players, alternating seats) | hard/balanced | hard/balanced | 2528 | 2472 | 50.6% ±1.4 | 49.4% | 50.9 | 3.71 | 0 | 0 | 74.3 s |

| Configuration | Group | Profile | Win % | Cards left (losers) | Cards drawn/seat | Wilds/seat | Actions/seat | Number % | Action % | Wild % | Wild w/ alternative | Color change/play | Color fit | Attack % of plays | Hits threat | Draw w/ legal play | UNO call | UNO forget | Challenge | Consistency |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| easy ×2 vs easy ×2 (4 players, alternating seats) | A | easy/balanced | 49.8% | 4.3 | 6.7 | 0.93 | 2.30 | 69.2% | 21.9% | 8.9% | 30.4% | 0.26 | 0.28 | 18.9% | 64.3% | 0.0% | 54.1% | 44.9% | 24.5% | 72.0% |
|  | B | easy/balanced | 50.2% | 4.3 | 6.7 | 0.94 | 2.30 | 69.1% | 21.9% | 9.0% | 29.7% | 0.26 | 0.28 | 18.8% | 65.0% | 0.0% | 54.6% | 44.4% | 24.8% | 72.0% |
| easy ×2 vs normal ×2 (4 players, alternating seats) | A | easy/balanced | 39.7% | 4.4 | 7.0 | 0.94 | 2.31 | 69.1% | 21.9% | 9.0% | 30.6% | 0.26 | 0.28 | 18.9% | 64.7% | 0.0% | 54.7% | 44.7% | 25.0% | 72.4% |
|  | B | normal/balanced | 60.3% | 4.2 | 6.5 | 0.90 | 2.38 | 69.2% | 22.3% | 8.4% | 6.8% | 0.28 | 0.31 | 19.3% | 87.9% | 0.0% | 83.5% | 14.4% | 61.1% | 80.8% |
| easy ×2 vs hard ×2 (4 players, alternating seats) | A | easy/balanced | 34.9% | 4.3 | 7.6 | 0.99 | 2.42 | 69.1% | 22.0% | 9.0% | 30.9% | 0.27 | 0.28 | 18.9% | 65.8% | 0.0% | 55.3% | 44.3% | 25.1% | 73.3% |
|  | B | hard/balanced | 65.1% | 4.1 | 6.9 | 0.94 | 2.50 | 69.2% | 22.4% | 8.4% | 7.7% | 0.28 | 0.30 | 19.2% | 87.5% | 0.0% | 94.7% | 2.7% | 89.8% | 91.0% |
| normal ×2 vs normal ×2 (4 players, alternating seats) | A | normal/balanced | 50.7% | 4.2 | 6.3 | 0.87 | 2.30 | 68.8% | 22.6% | 8.6% | 6.8% | 0.28 | 0.31 | 19.7% | 88.6% | 0.0% | 84.0% | 15.1% | 61.8% | 81.1% |
|  | B | normal/balanced | 49.3% | 4.2 | 6.3 | 0.88 | 2.29 | 68.8% | 22.5% | 8.6% | 6.9% | 0.28 | 0.31 | 19.5% | 89.2% | 0.0% | 84.4% | 14.7% | 59.7% | 82.0% |
| normal ×2 vs hard ×2 (4 players, alternating seats) | A | normal/balanced | 47.7% | 4.2 | 6.6 | 0.89 | 2.36 | 68.8% | 22.6% | 8.6% | 6.7% | 0.28 | 0.31 | 19.6% | 89.8% | 0.0% | 84.2% | 15.4% | 62.6% | 81.8% |
|  | B | hard/balanced | 52.3% | 4.2 | 6.5 | 0.89 | 2.34 | 68.9% | 22.5% | 8.6% | 7.4% | 0.28 | 0.30 | 19.4% | 89.2% | 0.0% | 95.8% | 3.2% | 90.2% | 90.8% |
| hard ×2 vs hard ×2 (4 players, alternating seats) | A | hard/balanced | 50.6% | 4.1 | 6.7 | 0.91 | 2.40 | 68.9% | 22.5% | 8.6% | 7.6% | 0.29 | 0.30 | 19.5% | 91.0% | 0.0% | 96.8% | 2.9% | 87.0% | 91.0% |
|  | B | hard/balanced | 49.4% | 4.1 | 6.7 | 0.91 | 2.40 | 68.9% | 22.5% | 8.6% | 7.4% | 0.29 | 0.30 | 19.3% | 89.9% | 0.0% | 96.6% | 3.1% | 92.5% | 91.0% |

## Personality — same difficulty, balanced ×2 vs personality ×2
| Configuration | A | B | Wins A | Wins B | % A (95% CI) | % B | Avg turns | UNO calls/round | Unfinished | Errors | Time |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| easy: balanced ×2 vs aggressive ×2 (4 players) | easy/balanced | easy/aggressive | 2509 | 2491 | 50.2% ±1.4 | 49.8% | 51.4 | 2.11 | 0 | 0 | 74.1 s |
| easy: balanced ×2 vs defensive ×2 (4 players) | easy/balanced | easy/defensive | 2488 | 2512 | 49.8% ±1.4 | 50.2% | 50.1 | 2.06 | 0 | 0 | 73.1 s |
| easy: balanced ×2 vs risky ×2 (4 players) | easy/balanced | easy/risky | 2555 | 2445 | 51.1% ±1.4 | 48.9% | 50.9 | 2.11 | 0 | 0 | 79.3 s |
| easy: balanced ×2 vs teamPlayer ×2 (4 players) | easy/balanced | easy/teamPlayer | 2496 | 2504 | 49.9% ±1.4 | 50.1% | 50.4 | 2.07 | 0 | 0 | 68.7 s |
| normal: balanced ×2 vs aggressive ×2 (4 players) | normal/balanced | normal/aggressive | 2534 | 2466 | 50.7% ±1.4 | 49.3% | 49.1 | 3.22 | 0 | 0 | 68.6 s |
| normal: balanced ×2 vs defensive ×2 (4 players) | normal/balanced | normal/defensive | 2520 | 2480 | 50.4% ±1.4 | 49.6% | 47.4 | 3.15 | 0 | 0 | 65.0 s |
| normal: balanced ×2 vs risky ×2 (4 players) | normal/balanced | normal/risky | 2657 | 2343 | 53.1% ±1.4 | 46.9% | 49.4 | 3.17 | 0 | 0 | 70.2 s |
| normal: balanced ×2 vs teamPlayer ×2 (4 players) | normal/balanced | normal/teamPlayer | 2522 | 2478 | 50.4% ±1.4 | 49.6% | 48.0 | 3.16 | 0 | 0 | 66.3 s |
| hard: balanced ×2 vs aggressive ×2 (4 players) | hard/balanced | hard/aggressive | 2629 | 2371 | 52.6% ±1.4 | 47.4% | 51.9 | 3.68 | 0 | 0 | 77.2 s |
| hard: balanced ×2 vs defensive ×2 (4 players) | hard/balanced | hard/defensive | 2427 | 2573 | 48.5% ±1.4 | 51.5% | 50.1 | 3.60 | 0 | 0 | 73.3 s |
| hard: balanced ×2 vs risky ×2 (4 players) | hard/balanced | hard/risky | 2696 | 2304 | 53.9% ±1.4 | 46.1% | 51.8 | 3.64 | 0 | 0 | 77.7 s |
| hard: balanced ×2 vs teamPlayer ×2 (4 players) | hard/balanced | hard/teamPlayer | 2550 | 2450 | 51.0% ±1.4 | 49.0% | 50.5 | 3.64 | 0 | 0 | 74.3 s |

| Configuration | Group | Profile | Win % | Cards left (losers) | Cards drawn/seat | Wilds/seat | Actions/seat | Number % | Action % | Wild % | Wild w/ alternative | Color change/play | Color fit | Attack % of plays | Hits threat | Draw w/ legal play | UNO call | UNO forget | Challenge | Consistency | Same decision as balanced |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| easy: balanced ×2 vs aggressive ×2 (4 players) | A | easy/balanced | 50.2% | 4.3 | 6.9 | 0.94 | 2.35 | 69.2% | 21.9% | 8.8% | 30.4% | 0.26 | 0.28 | 18.9% | 64.9% | 0.0% | 53.7% | 45.2% | 24.7% | — | — |
|  | B | easy/aggressive | 49.8% | 4.3 | 6.9 | 0.96 | 2.38 | 68.8% | 22.2% | 8.9% | 32.9% | 0.26 | 0.28 | 19.1% | 76.4% | 0.0% | 54.7% | 44.2% | 25.4% | — | 99.07% |
| easy: balanced ×2 vs defensive ×2 (4 players) | A | easy/balanced | 49.8% | 4.3 | 6.7 | 0.93 | 2.30 | 69.1% | 22.0% | 8.9% | 30.4% | 0.26 | 0.28 | 19.0% | 64.3% | 0.0% | 53.5% | 45.4% | 24.7% | — | — |
|  | B | easy/defensive | 50.2% | 4.3 | 6.7 | 0.93 | 2.29 | 69.2% | 21.9% | 8.9% | 24.8% | 0.26 | 0.29 | 18.7% | 63.9% | 0.0% | 54.6% | 44.3% | 24.9% | — | 99.53% |
| easy: balanced ×2 vs risky ×2 (4 players) | A | easy/balanced | 51.1% | 4.3 | 6.8 | 0.94 | 2.34 | 69.1% | 22.0% | 8.9% | 30.7% | 0.26 | 0.28 | 19.0% | 65.3% | 0.0% | 54.2% | 44.9% | 24.6% | — | — |
|  | B | easy/risky | 48.9% | 4.4 | 6.8 | 0.95 | 2.32 | 69.1% | 21.9% | 9.0% | 36.4% | 0.26 | 0.28 | 18.8% | 64.9% | 0.4% | 55.1% | 43.7% | 24.9% | — | 99.31% |
| easy: balanced ×2 vs teamPlayer ×2 (4 players) | A | easy/balanced | 49.9% | 4.3 | 6.7 | 0.93 | 2.31 | 69.2% | 22.0% | 8.9% | 30.5% | 0.26 | 0.28 | 18.9% | 64.4% | 0.0% | 54.2% | 44.9% | 24.5% | — | — |
|  | B | easy/teamPlayer | 50.1% | 4.3 | 6.7 | 0.94 | 2.31 | 69.1% | 21.9% | 9.0% | 29.7% | 0.26 | 0.28 | 18.8% | 65.2% | 0.0% | 54.6% | 44.4% | 24.8% | — | 99.95% |
| normal: balanced ×2 vs aggressive ×2 (4 players) | A | normal/balanced | 50.7% | 4.2 | 6.5 | 0.87 | 2.36 | 68.9% | 22.7% | 8.4% | 6.2% | 0.28 | 0.31 | 19.6% | 89.3% | 0.0% | 84.1% | 15.0% | 59.5% | — | — |
|  | B | normal/aggressive | 49.3% | 4.2 | 6.5 | 0.91 | 2.48 | 67.4% | 23.9% | 8.8% | 14.8% | 0.28 | 0.30 | 20.5% | 89.6% | 0.0% | 84.7% | 14.6% | 59.8% | — | 94.83% |
| normal: balanced ×2 vs defensive ×2 (4 players) | A | normal/balanced | 50.4% | 4.2 | 6.2 | 0.87 | 2.27 | 68.8% | 22.6% | 8.6% | 7.0% | 0.28 | 0.31 | 19.7% | 88.6% | 0.0% | 84.4% | 14.8% | 58.0% | — | — |
|  | B | normal/defensive | 49.6% | 4.2 | 6.2 | 0.86 | 2.15 | 70.0% | 21.4% | 8.6% | 4.3% | 0.28 | 0.31 | 18.5% | 87.5% | 0.1% | 84.5% | 14.5% | 59.0% | — | 96.11% |
| normal: balanced ×2 vs risky ×2 (4 players) | A | normal/balanced | 53.1% | 4.2 | 6.5 | 0.89 | 2.37 | 68.9% | 22.6% | 8.5% | 6.4% | 0.28 | 0.31 | 19.7% | 89.3% | 0.0% | 84.0% | 15.0% | 60.1% | — | — |
|  | B | normal/risky | 46.9% | 4.3 | 6.6 | 0.93 | 2.44 | 67.5% | 23.5% | 9.0% | 38.1% | 0.28 | 0.29 | 20.3% | 89.0% | 0.0% | 84.3% | 14.9% | 59.7% | — | 94.59% |
| normal: balanced ×2 vs teamPlayer ×2 (4 players) | A | normal/balanced | 50.4% | 4.2 | 6.3 | 0.87 | 2.30 | 68.8% | 22.6% | 8.6% | 6.6% | 0.28 | 0.31 | 19.6% | 88.7% | 0.0% | 84.3% | 14.9% | 61.6% | — | — |
|  | B | normal/teamPlayer | 49.6% | 4.2 | 6.3 | 0.88 | 2.30 | 68.7% | 22.7% | 8.7% | 6.9% | 0.28 | 0.31 | 19.6% | 89.3% | 0.0% | 84.5% | 14.7% | 59.1% | — | 99.66% |
| hard: balanced ×2 vs aggressive ×2 (4 players) | A | hard/balanced | 52.6% | 4.0 | 6.8 | 0.92 | 2.46 | 68.9% | 22.7% | 8.5% | 7.5% | 0.29 | 0.30 | 19.5% | 91.1% | 0.0% | 96.8% | 3.0% | 90.2% | — | — |
|  | B | hard/aggressive | 47.4% | 4.1 | 6.9 | 0.95 | 2.56 | 67.6% | 23.6% | 8.7% | 17.6% | 0.29 | 0.29 | 20.2% | 91.0% | 0.0% | 96.7% | 3.1% | 90.7% | — | 94.03% |
| hard: balanced ×2 vs defensive ×2 (4 players) | A | hard/balanced | 48.5% | 4.1 | 6.5 | 0.90 | 2.36 | 68.9% | 22.5% | 8.6% | 8.2% | 0.29 | 0.30 | 19.4% | 90.6% | 0.0% | 96.6% | 3.1% | 89.6% | — | — |
|  | B | hard/defensive | 51.5% | 4.2 | 6.5 | 0.88 | 2.31 | 69.5% | 22.1% | 8.5% | 3.8% | 0.28 | 0.31 | 18.8% | 90.0% | 2.4% | 96.6% | 3.2% | 90.8% | — | 97.28% |
| hard: balanced ×2 vs risky ×2 (4 players) | A | hard/balanced | 53.9% | 4.1 | 6.8 | 0.91 | 2.46 | 68.9% | 22.7% | 8.4% | 7.6% | 0.29 | 0.30 | 19.5% | 90.9% | 0.0% | 96.8% | 2.9% | 89.1% | — | — |
|  | B | hard/risky | 46.1% | 4.2 | 7.0 | 0.98 | 2.54 | 67.3% | 23.6% | 9.1% | 46.8% | 0.29 | 0.28 | 20.3% | 90.4% | 0.0% | 96.7% | 3.2% | 88.7% | — | 90.69% |
| hard: balanced ×2 vs teamPlayer ×2 (4 players) | A | hard/balanced | 51.0% | 4.1 | 6.6 | 0.91 | 2.38 | 68.9% | 22.5% | 8.6% | 7.5% | 0.29 | 0.30 | 19.5% | 90.7% | 0.0% | 96.7% | 2.9% | 87.9% | — | — |
|  | B | hard/teamPlayer | 49.0% | 4.1 | 6.7 | 0.90 | 2.40 | 68.7% | 22.7% | 8.5% | 7.2% | 0.29 | 0.30 | 19.5% | 90.2% | 0.0% | 96.5% | 3.1% | 91.9% | — | 99.47% |

## Team mode
| Configuration | A | B | Wins A | Wins B | % A (95% CI) | % B | Avg turns | UNO calls/round | Unfinished | Errors | Time |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| normal 2v2, partners across: team A teamPlayer ×2 vs team B balanced ×2 | normal/teamPlayer | normal/balanced | 2456 | 2544 | 49.1% ±1.4 | 50.9% | 47.9 | 3.06 | 0 | 0 | 69.3 s |
| normal 2v2, partners across: balanced ×2 vs balanced ×2 (baseline) | normal/balanced | normal/balanced | 2504 | 2496 | 50.1% ±1.4 | 49.9% | 47.7 | 3.03 | 0 | 0 | 67.4 s |
| normal 2v2, partners adjacent: team A teamPlayer ×2 vs team B balanced ×2 | normal/teamPlayer | normal/balanced | 2669 | 2331 | 53.4% ±1.4 | 46.6% | 44.6 | 2.98 | 0 | 0 | 68.7 s |
| normal 2v2, partners adjacent: balanced ×2 vs balanced ×2 (baseline) | normal/balanced | normal/balanced | 2530 | 2470 | 50.6% ±1.4 | 49.4% | 44.3 | 2.99 | 0 | 0 | 57.2 s |
| hard 2v2, partners across: team A teamPlayer ×2 vs team B balanced ×2 | hard/teamPlayer | hard/balanced | 2521 | 2479 | 50.4% ±1.4 | 49.6% | 48.8 | 3.49 | 0 | 0 | 72.6 s |
| hard 2v2, partners across: balanced ×2 vs balanced ×2 (baseline) | hard/balanced | hard/balanced | 2510 | 2490 | 50.2% ±1.4 | 49.8% | 48.8 | 3.52 | 0 | 0 | 67.8 s |
| hard 2v2, partners adjacent: team A teamPlayer ×2 vs team B balanced ×2 | hard/teamPlayer | hard/balanced | 2584 | 2416 | 51.7% ±1.4 | 48.3% | 45.5 | 3.38 | 0 | 0 | 66.5 s |
| hard 2v2, partners adjacent: balanced ×2 vs balanced ×2 (baseline) | hard/balanced | hard/balanced | 2494 | 2506 | 49.9% ±1.4 | 50.1% | 44.6 | 3.38 | 0 | 0 | 61.1 s |

| Configuration | Group | Profile | Win % | Cards left (losers) | Cards drawn/seat | Wilds/seat | Actions/seat | Number % | Action % | Wild % | Wild w/ alternative | Color change/play | Color fit | Attack % of plays | Hits threat | Draw w/ legal play | UNO call | UNO forget | Challenge | Consistency | Same decision as balanced | Turn → mate | Mate ≤2: turn → mate | Attacks on mate /1000 dec. | Mate color fit (wilds) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| normal 2v2, partners across: team A teamPlayer ×2 vs team B balanced ×2 | A | normal/teamPlayer | 49.1% | 4.2 | 6.3 | 0.88 | 2.41 | 67.7% | 23.7% | 8.6% | 7.9% | 0.28 | 0.31 | 20.9% | 90.4% | 0.0% | 83.9% | 15.5% | 60.4% | — | 98.60% | 17.9% | 14.1% | 0.0 | 0.27 |
|  | B | normal/balanced | 50.9% | 4.3 | 6.3 | 0.88 | 2.39 | 67.8% | 23.5% | 8.6% | 6.9% | 0.28 | 0.31 | 20.5% | 88.9% | 0.0% | 84.5% | 14.8% | 60.0% | — | — | 17.6% | 14.8% | 0.0 | 0.27 |
| normal 2v2, partners across: balanced ×2 vs balanced ×2 (baseline) | A | normal/balanced | 50.1% | 4.2 | 6.3 | 0.87 | 2.38 | 68.0% | 23.4% | 8.6% | 6.9% | 0.28 | 0.31 | 20.6% | 90.2% | 0.0% | 83.8% | 15.6% | 59.9% | — | — | 17.6% | 15.4% | 0.0 | 0.27 |
|  | B | normal/balanced | 49.9% | 4.3 | 6.3 | 0.87 | 2.38 | 67.8% | 23.5% | 8.6% | 6.7% | 0.28 | 0.31 | 20.6% | 89.6% | 0.0% | 84.8% | 14.5% | 58.5% | — | — | 17.6% | 14.6% | 0.0 | 0.27 |
| normal 2v2, partners adjacent: team A teamPlayer ×2 vs team B balanced ×2 | A | normal/teamPlayer | 53.4% | 4.5 | 5.5 | 0.77 | 1.75 | 72.7% | 18.9% | 8.4% | 9.8% | 0.28 | 0.31 | 13.3% | 84.5% | 19.3% | 84.7% | 13.8% | 58.5% | — | 94.29% | 46.6% | 61.5% | 12.4 | 0.29 |
|  | B | normal/balanced | 46.6% | 4.7 | 5.7 | 0.80 | 1.88 | 70.8% | 20.5% | 8.8% | 9.5% | 0.28 | 0.31 | 11.5% | 85.2% | 1.3% | 85.2% | 14.2% | 59.4% | — | — | 43.4% | 51.0% | 42.4 | 0.29 |
| normal 2v2, partners adjacent: balanced ×2 vs balanced ×2 (baseline) | A | normal/balanced | 50.6% | 4.4 | 5.6 | 0.82 | 1.92 | 70.6% | 20.6% | 8.8% | 10.0% | 0.28 | 0.30 | 11.3% | 86.6% | 1.1% | 84.0% | 15.4% | 58.7% | — | — | 44.0% | 50.2% | 45.3 | 0.28 |
|  | B | normal/balanced | 49.4% | 4.4 | 5.6 | 0.81 | 1.93 | 70.6% | 20.7% | 8.7% | 9.9% | 0.28 | 0.30 | 11.4% | 85.4% | 1.2% | 84.8% | 14.5% | 61.9% | — | — | 44.1% | 50.6% | 45.1 | 0.29 |
| hard 2v2, partners across: team A teamPlayer ×2 vs team B balanced ×2 | A | hard/teamPlayer | 50.4% | 4.1 | 6.4 | 0.88 | 2.46 | 67.6% | 23.9% | 8.6% | 8.3% | 0.29 | 0.30 | 20.8% | 90.3% | 0.0% | 96.6% | 3.2% | 88.8% | — | 99.32% | 17.8% | 14.1% | 0.0 | 0.28 |
|  | B | hard/balanced | 49.6% | 4.2 | 6.4 | 0.88 | 2.43 | 67.8% | 23.7% | 8.6% | 7.7% | 0.29 | 0.30 | 20.5% | 90.3% | 0.0% | 96.6% | 3.1% | 84.5% | — | — | 17.5% | 14.3% | 0.0 | 0.28 |
| hard 2v2, partners across: balanced ×2 vs balanced ×2 (baseline) | A | hard/balanced | 50.2% | 4.1 | 6.4 | 0.88 | 2.46 | 67.7% | 23.8% | 8.5% | 7.9% | 0.29 | 0.30 | 20.7% | 90.7% | 0.0% | 96.5% | 3.2% | 89.9% | — | — | 17.6% | 14.4% | 0.0 | 0.27 |
|  | B | hard/balanced | 49.8% | 4.2 | 6.4 | 0.89 | 2.44 | 67.7% | 23.6% | 8.6% | 7.8% | 0.29 | 0.30 | 20.5% | 90.1% | 0.0% | 96.4% | 3.3% | 85.7% | — | — | 17.5% | 14.1% | 0.0 | 0.28 |
| hard 2v2, partners adjacent: team A teamPlayer ×2 vs team B balanced ×2 | A | hard/teamPlayer | 51.7% | 4.5 | 5.5 | 0.74 | 1.61 | 74.3% | 17.6% | 8.1% | 11.1% | 0.29 | 0.31 | 13.6% | 84.9% | 24.8% | 97.0% | 2.6% | 87.7% | — | 95.79% | 47.5% | 71.2% | 1.2 | 0.29 |
|  | B | hard/balanced | 48.3% | 4.8 | 5.7 | 0.78 | 1.74 | 72.4% | 19.0% | 8.5% | 9.4% | 0.29 | 0.31 | 11.9% | 87.0% | 10.7% | 96.9% | 2.8% | 90.4% | — | — | 44.6% | 63.7% | 27.1 | 0.29 |
| hard 2v2, partners adjacent: balanced ×2 vs balanced ×2 (baseline) | A | hard/balanced | 49.9% | 4.5 | 5.5 | 0.78 | 1.74 | 72.4% | 19.1% | 8.6% | 9.5% | 0.29 | 0.31 | 11.9% | 85.5% | 11.4% | 96.7% | 2.9% | 88.3% | — | — | 45.4% | 62.1% | 26.1 | 0.29 |
|  | B | hard/balanced | 50.1% | 4.6 | 5.5 | 0.78 | 1.75 | 72.3% | 19.2% | 8.5% | 9.8% | 0.29 | 0.31 | 12.0% | 85.3% | 11.5% | 96.9% | 2.8% | 94.0% | — | — | 45.3% | 63.1% | 26.7 | 0.29 |

## Column definitions
- **Cards left (losers):** average cards in a losing seat’s hand when the round ends.
- **Cards drawn/seat, Wilds/seat, Actions/seat:** per seat per round.
- **Number/Action/Wild %:** share of the group’s card plays.
- **Wild w/ alternative:** of the turns where both a wild and a non-wild card were legal, how often a wild was played (lower = conserves wilds).
- **Color change/play:** plays that changed the active color. **Color fit:** after its play, the share of the bot’s remaining hand matching the new color (wilds count as matching).
- **Attack % of plays:** plays that skipped or made an opponent draw. **Hits threat:** when the next player was an opponent with ≤2 cards and an attack card was legal, how often one was played.
- **Draw w/ legal play:** draws taken although a card was playable.
- **UNO call / forget:** on turns with 2 cards, a legal play and no UNO declared yet. **Challenge:** when an opponent could be caught.
- **Consistency:** every 10th decision re-asked with 4 other bot seeds; share of identical answers (100% = no randomness in that decision).
- **Same decision as balanced:** for the personality group, every decision was also computed with the balanced profile on the same state and seed.
- **Turn → mate:** turn-passing decisions after which the teammate acts next. **Mate ≤2:** same, restricted to when the teammate had 1–2 cards. **Mate color fit:** after the bot chose a wild color, the share of the teammate’s real hand matching it (measured with full information; the bot never sees it).
