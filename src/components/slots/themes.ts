// The eight premium machines: palette and symbol art per theme. The math is shared (engine.ts), so a
// theme only decides how each abstract symbol looks. Symbol keys follow the original reel strip:
// seven = top symbol, star = wild, gold/eagle = high, bison/wagon/revolver/moneybag = mid,
// hat/horseshoe/cactus = low.
import type { LucideIcon } from 'lucide-react';
import {
  Anchor, Apple, Atom, Banana, Bell, Castle, Cherry, Citrus, Club, Coins, Compass, Crown, Diamond, Dice5, Earth, Fish, Flame,
  FlameKindling, Flower2, Gem, Grape, Heart, Hexagon, Key, Landmark, Map as MapIcon, Moon, Orbit, PiggyBank, Rocket, Sailboat, Satellite, Scroll,
  Shell, Shield, Ship, Skull, Spade, Sparkles, Star, Sun, Swords, Telescope, TreePalm, Trophy, Wine, Zap,
} from 'lucide-react';
import type { MachineId } from '@/casino/premium/engine';
import type { SlotSymbol } from '@/casino/slots';

export interface SymbolSkin {
  icon?: LucideIcon;
  /** Printed instead of an icon ('7', 'A'…). */
  text?: string;
  /** Classic BAR symbol with this many bars. */
  bars?: 1 | 2 | 3;
  c1: string;
  c2: string;
  /** i18n key under slotsPremium.sym */
  label: string;
}

export interface MachineTheme {
  id: MachineId;
  emoji: string;
  /** Background gradient, metal frame, accents. */
  bg: [string, string];
  metal: [string, string];
  accent: string;
  accent2: string;
  glow: string;
  particles: string[];
  symbols: Record<SlotSymbol, SymbolSkin>;
}

const s = (label: string, c1: string, c2: string, icon?: LucideIcon, text?: string): SymbolSkin => ({ label, c1, c2, icon, text });
const letters = (c1: string, c2: string) => ({
  hat: s('ace', c1, c2, undefined, 'A'),
  horseshoe: s('king', c1, c2, undefined, 'K'),
  cactus: s('queen', c1, c2, undefined, 'Q'),
});

export const THEMES: Record<MachineId, MachineTheme> = {
  lucky7s: {
    id: 'lucky7s',
    emoji: '🎰',
    bg: ['#2a0a0c', '#0b0506'],
    metal: ['#f3d27a', '#7a5a1c'],
    accent: '#ffcf4a',
    accent2: '#ff4d4d',
    glow: 'rgba(255, 90, 70, 0.55)',
    particles: ['#ffd24a', '#ff5d5d', '#fff3c4'],
    symbols: {
      seven: s('seven', '#ff6b6b', '#b00012', undefined, '7'),
      star: s('wild', '#ffe28a', '#c08400', Star),
      gold: { ...s('bar3', '#ffffff', '#9aa0a6'), bars: 3 },
      eagle: { ...s('bar2', '#ffffff', '#9aa0a6'), bars: 2 },
      bison: { ...s('bar', '#ffffff', '#9aa0a6'), bars: 1 },
      wagon: s('bell', '#ffe07a', '#b7791f', Bell),
      revolver: s('grape', '#c4a1ff', '#5b21b6', Grape),
      moneybag: s('lemon', '#d9f99d', '#65a30d', Citrus),
      hat: s('cherry', '#ff8a8a', '#be123c', Cherry),
      horseshoe: s('apple', '#a7f3a0', '#15803d', Apple),
      cactus: s('banana', '#fff59d', '#ca8a04', Banana),
    },
  },
  diamondRoyale: {
    id: 'diamondRoyale',
    emoji: '💎',
    bg: ['#0c1024', '#05060d'],
    metal: ['#e8edf7', '#6b7489'],
    accent: '#bfe3ff',
    accent2: '#c4b5fd',
    glow: 'rgba(150, 200, 255, 0.5)',
    particles: ['#e0f2ff', '#a5d8ff', '#d8b4fe'],
    symbols: {
      seven: s('diamond', '#bff0ff', '#1d6fe0', Gem),
      star: s('wild', '#f5e8ff', '#7c3aed', Sparkles),
      gold: s('crown', '#efe3ff', '#7e4ad6', Crown),
      eagle: s('emerald', '#9af0c8', '#047857', Hexagon),
      bison: s('spade', '#eef1f6', '#3b4252', Spade),
      wagon: s('heart', '#ffc0cb', '#be123c', Heart),
      revolver: s('club', '#e3e6ec', '#2b303b', Club),
      moneybag: s('diamondSuit', '#b8d8ff', '#1d4ed8', Diamond),
      ...letters('#f3f6fb', '#8fa3c0'),
    },
  },
  goldenFortune: {
    id: 'goldenFortune',
    emoji: '🪙',
    bg: ['#1f1606', '#080603'],
    metal: ['#ffe8a3', '#8a6417'],
    accent: '#ffd666',
    accent2: '#34d399',
    glow: 'rgba(255, 200, 80, 0.55)',
    particles: ['#ffd666', '#fff1b8', '#f5b73b'],
    symbols: {
      seven: s('trophy', '#fff3b0', '#b7791f', Trophy),
      star: s('wild', '#fff7c2', '#d97706', Sun),
      gold: s('coins', '#ffe79a', '#a16207', Coins),
      eagle: s('ruby', '#ffb4b4', '#b91c1c', Gem),
      bison: s('piggy', '#ffd1e3', '#be185d', PiggyBank),
      wagon: s('bank', '#efeae4', '#57534e', Landmark),
      revolver: s('key', '#ffe7a0', '#92400e', Key),
      moneybag: s('scroll', '#fff3d1', '#a16207', Scroll),
      ...letters('#ffe9a8', '#b8862b'),
    },
  },
  inferno: {
    id: 'inferno',
    emoji: '🔥',
    bg: ['#2b0703', '#090201'],
    metal: ['#ffb36b', '#6e1d06'],
    accent: '#ff8a1f',
    accent2: '#ff3d00',
    glow: 'rgba(255, 90, 20, 0.6)',
    particles: ['#ffb300', '#ff5a1f', '#ffe08a'],
    symbols: {
      seven: s('fireSeven', '#ffd166', '#e62e00', undefined, '7'),
      star: s('wild', '#ffe08a', '#ea580c', Flame),
      gold: s('skull', '#ffd9d9', '#7f1d1d', Skull),
      eagle: s('lightning', '#fff176', '#ea580c', Zap),
      bison: s('bonfire', '#ffc58a', '#c2410c', FlameKindling),
      wagon: s('dice', '#ffb3b3', '#991b1b', Dice5),
      revolver: s('heart', '#ff9bab', '#9f1239', Heart),
      moneybag: s('swords', '#ffd98a', '#b45309', Swords),
      ...letters('#ffcf8a', '#d9480f'),
    },
  },
  tropical: {
    id: 'tropical',
    emoji: '🌴',
    bg: ['#04232a', '#02100f'],
    metal: ['#b8f5e8', '#1c6b62'],
    accent: '#5eead4',
    accent2: '#fb7185',
    glow: 'rgba(80, 230, 200, 0.5)',
    particles: ['#5eead4', '#fde68a', '#fb7185'],
    symbols: {
      seven: s('sun', '#fff59d', '#f59e0b', Sun),
      star: s('wild', '#b9f6ca', '#15803d', TreePalm),
      gold: s('shell', '#ffd5dc', '#e11d48', Shell),
      eagle: s('fish', '#b6f4ff', '#0891b2', Fish),
      bison: s('hibiscus', '#ffc2e2', '#db2777', Flower2),
      wagon: s('sailboat', '#cfe3ff', '#1d4ed8', Sailboat),
      revolver: s('banana', '#fff59d', '#ca8a04', Banana),
      moneybag: s('lime', '#d9f99d', '#4d7c0f', Citrus),
      ...letters('#b4fff0', '#14b8a6'),
    },
  },
  pirates: {
    id: 'pirates',
    emoji: '🏴‍☠️',
    bg: ['#1c120a', '#070504'],
    metal: ['#e7c27d', '#5c3b16'],
    accent: '#e7b54a',
    accent2: '#dc2626',
    glow: 'rgba(230, 170, 70, 0.5)',
    particles: ['#f2c14e', '#fff0c2', '#c0841a'],
    symbols: {
      seven: s('jollyRoger', '#f5f5f4', '#292524', Skull),
      star: s('wild', '#ffe4a8', '#b45309', Compass),
      gold: s('ship', '#e8d5b5', '#6b4423', Ship),
      eagle: s('doubloons', '#ffe08a', '#a16207', Coins),
      bison: s('anchor', '#cfd8e3', '#334155', Anchor),
      wagon: s('swords', '#e5e7eb', '#4b5563', Swords),
      revolver: s('map', '#f5e6c8', '#8b5e34', MapIcon),
      moneybag: s('key', '#ffe7a0', '#92400e', Key),
      ...letters('#f1d9a8', '#9a6b2f'),
    },
  },
  cosmic: {
    id: 'cosmic',
    emoji: '🚀',
    bg: ['#0d0826', '#03020b'],
    metal: ['#c7d2fe', '#3b3a7a'],
    accent: '#67e8f9',
    accent2: '#c084fc',
    glow: 'rgba(120, 140, 255, 0.55)',
    particles: ['#67e8f9', '#c084fc', '#f0abfc'],
    symbols: {
      seven: s('rocket', '#b5f4ff', '#6d28d9', Rocket),
      star: s('wild', '#e9d5ff', '#7e22ce', Atom),
      gold: s('planet', '#a5f3fc', '#0e7490', Earth),
      eagle: s('satellite', '#e0e7ff', '#4338ca', Satellite),
      bison: s('moon', '#fef9c3', '#a16207', Moon),
      wagon: s('orbit', '#fbcfe8', '#a21caf', Orbit),
      revolver: s('telescope', '#dbeafe', '#1e40af', Telescope),
      moneybag: s('energy', '#fef08a', '#ca8a04', Zap),
      ...letters('#a5f3fc', '#8b5cf6'),
    },
  },
  royal: {
    id: 'royal',
    emoji: '👑',
    bg: ['#1a0826', '#07030b'],
    metal: ['#f4d98b', '#6f4c12'],
    accent: '#f4c95d',
    accent2: '#a855f7',
    glow: 'rgba(200, 150, 255, 0.5)',
    particles: ['#f4c95d', '#e9d5ff', '#fff3c4'],
    symbols: {
      seven: s('crown', '#fff0b3', '#b7791f', Crown),
      star: s('wild', '#efe0ff', '#7e22ce', Shield),
      gold: s('castle', '#ece7f5', '#5b4b7a', Castle),
      eagle: s('jewel', '#ffc6d9', '#be185d', Gem),
      bison: s('goblet', '#ffe3a3', '#a16207', Wine),
      wagon: s('royalKey', '#ffe7a0', '#92400e', Key),
      revolver: s('decree', '#fff3d6', '#8a6a2a', Scroll),
      moneybag: s('swords', '#e7e9ee', '#4b5563', Swords),
      ...letters('#f7dc8f', '#9b6a14'),
    },
  },
};

/** Order of the art inside every reel cell; a cell shows child number `data-k`. */
export const SYMBOL_ORDER: SlotSymbol[] = ['seven', 'star', 'gold', 'eagle', 'bison', 'wagon', 'revolver', 'moneybag', 'hat', 'horseshoe', 'cactus'];

export const themeStyle = (t: MachineTheme): React.CSSProperties =>
  ({
    '--ps-bg1': t.bg[0],
    '--ps-bg2': t.bg[1],
    '--ps-metal1': t.metal[0],
    '--ps-metal2': t.metal[1],
    '--ps-accent': t.accent,
    '--ps-accent2': t.accent2,
    '--ps-glow': t.glow,
  }) as React.CSSProperties;

