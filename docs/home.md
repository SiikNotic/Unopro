# Home screen

`src/screens/HomeScreen.tsx` (+ `src/screens/home/`) is the luxury social-casino lobby:

1. Header: brand, player (opens Account, or Profile when accounts are off), coins (opens the Bank) and
   Settings.
2. Welcome hero with "Play now", which opens the game picker (`gameModes`).
3. Category rail. Every category filters the real games, and "All" shows the sections.
4. Popular games: Carta, Domino, Bingo, Poker.
5. Promo banner: Jewellery: Olympus, a real game.
6. Casino games: Roulette, Blackjack, Slots, Jewellery.
7. Extras. Each entry opens an existing feature:
   - online rooms, shown only when online play is configured;
   - the Bank's daily coins;
   - the tutorial.
8. Recommended rail: a static, configurable list (`RECOMMENDED`).
9. Bottom navigation: Home, Games, the Play orb, Bank, Profile, More (Settings).

## What the home screen does not show

Parts of the mockup that the app does not have are left out on purpose, so nothing pretends to work:

- gems / diamonds;
- player level and XP;
- VIP;
- notifications;
- tournaments;
- a jackpot banner;
- favourites;
- dice and darts.

When one of them is built, add its card or entry here.

## Changing the art

Each game's card is defined in `src/screens/home/homeGames.tsx`.

- `bg` and `accent` set its colours.
- `art` draws it from the project's own pieces: the lobby SVG art, playing cards, and the slot and Olympus
  images.
- To use painted art, add the image under `src/screens/home/art/`, import it and set `image` on that game;
  the card then shows it full-bleed.
- The hero art (`HERO_ART`) works the same way.

All text is in `home2.*` in `src/i18n/locales/{es,en}.json`.
