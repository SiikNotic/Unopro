// How each machine looks, moves and sounds. The math lives in src/casino/premium/machines.ts; this file
// only decides presentation. See docs/slots-design.md for the design plan behind these choices.
import type { LucideIcon } from 'lucide-react';
import {
  Anchor, Banana, Bell, Bird, Cherry, Citrus, Compass, Crown, Fish, Flag, Flame, Flower2, Grape, Hourglass, Map as MapIcon,
  Orbit, Sailboat, Shell, Shield, Ship, Skull, Sparkle, Sun, TreePalm, Wand, Wine, Hexagon,
} from 'lucide-react';
import type { MachineId } from '@/casino/premium/engine';
import type { MotionProfile } from '@/casino/premium/reelMotion';

export type SymbolStyle = 'printed' | 'gem' | 'coin' | 'ember' | 'bubble' | 'ink' | 'neon' | 'enamel';
export type ParticleKind = 'coins' | 'sparkles' | 'gold' | 'embers' | 'petals' | 'doubloons' | 'stars' | 'confetti';
export type LineStyle = 'bulb' | 'light' | 'gold' | 'fire' | 'tide' | 'route' | 'neon' | 'deco';

export interface SymbolArtDef {
  /** A glyph from glyphs.tsx, a lucide icon, printed text, or a classic BAR plate. */
  glyph?: string;
  icon?: LucideIcon;
  text?: string;
  bars?: 1 | 2 | 3;
  c1: string;
  c2: string;
  ink?: string;
  /** i18n key under slotsPremium.sym */
  label: string;
}

export interface MachinePresentation {
  id: MachineId;
  emoji: string;
  /** Display face (self-hosted, see premiumSlots.css) and its fallback stack. */
  font: { family: string; stack: string };
  style: SymbolStyle;
  /** CSS custom properties that paint the cabinet. */
  palette: Record<string, string>;
  symbols: Record<string, SymbolArtDef>;
  motion: MotionProfile;
  /** Seconds between reel stops, and extra hold of reels 4 and 5 when a big hit is possible. */
  stagger: number;
  tease: [number, number];
  lineStyle: LineStyle;
  celebration: { particle: ParticleKind; colors: string[]; shake: boolean };
}

const L = (c1: string, c2: string, text: string, label: string, ink?: string): SymbolArtDef => ({ text, c1, c2, label, ink });

export const PRESENTATION: Record<MachineId, MachinePresentation> = {
  lucky7s: {
    id: 'lucky7s',
    emoji: '🎰',
    font: { family: 'Bungee', stack: "'Bungee', 'Arial Black', sans-serif" },
    style: 'printed',
    palette: { '--m-bg': '#141012', '--m-metal1': '#f4f6f8', '--m-metal2': '#8d949c', '--m-accent': '#ffb547', '--m-accent2': '#c8102e', '--m-reel': '#f1e6cf', '--m-reel-edge': '#b9a784', '--m-glow': 'rgba(255, 181, 71, 0.55)', '--m-text': '#fff4dc' },
    symbols: {
      seven: { glyph: 'seven', c1: '#ff4a4a', c2: '#b0001a', ink: '#1a0003', label: 'seven' },
      bar3: { bars: 3, c1: '#111', c2: '#000', label: 'bar3' },
      bar2: { bars: 2, c1: '#111', c2: '#000', label: 'bar2' },
      bar: { bars: 1, c1: '#111', c2: '#000', label: 'bar' },
      coin: { glyph: 'coin', c1: '#ffe27a', c2: '#c98a00', label: 'coins' },
      cherry: { icon: Cherry, c1: '#e0102f', c2: '#1f7a2e', label: 'cherry' },
      lemon: { icon: Citrus, c1: '#f5c400', c2: '#8a6d00', label: 'lemon' },
      wild7: { glyph: 'seven', c1: '#ffe27a', c2: '#c98a00', ink: '#3b2600', label: 'wild' },
      bell: { icon: Bell, c1: '#e8a800', c2: '#7a5200', label: 'bell' },
    },
    motion: { vmax: 24, windupS: 0.08, windupCells: 0.18, accelS: 0.22, brakeCells: 6, overshootCells: 0.32, bounceS: 0.22 },
    stagger: 0.3,
    tease: [0.5, 1.2],
    lineStyle: 'bulb',
    celebration: { particle: 'coins', colors: ['#ffd24a', '#f2b400', '#fff3c4'], shake: false },
  },

  diamondRoyale: {
    id: 'diamondRoyale',
    emoji: '💎',
    font: { family: 'Cormorant Garamond', stack: "'Cormorant Garamond', Georgia, serif" },
    style: 'gem',
    palette: { '--m-bg': '#07080c', '--m-metal1': '#f3f5f9', '--m-metal2': '#9aa3b5', '--m-accent': '#e8cf9a', '--m-accent2': '#bfe6ff', '--m-reel': '#0b0c12', '--m-reel-edge': '#1d2030', '--m-glow': 'rgba(191, 230, 255, 0.45)', '--m-text': '#eef3ff' },
    symbols: {
      diamond: { glyph: 'brilliant', c1: '#f4fbff', c2: '#8fc7ee', label: 'diamond' },
      crown: { icon: Crown, c1: '#f6e2b0', c2: '#b8913e', label: 'crown' },
      ruby: { glyph: 'ovalCut', c1: '#ff8aa0', c2: '#9b0a2b', label: 'ruby' },
      sapphire: { glyph: 'cushionCut', c1: '#8fb4ff', c2: '#1a3a9c', label: 'sapphire' },
      emerald: { glyph: 'emeraldCut', c1: '#8af0c4', c2: '#07684a', label: 'emerald' },
      ring: { glyph: 'ring', c1: '#fbe7b2', c2: '#b8913e', label: 'goldRing' },
      A: L('#f4f6fb', '#8e98ad', 'A', 'ace'),
      K: L('#f4f6fb', '#8e98ad', 'K', 'king'),
      Q: L('#f4f6fb', '#8e98ad', 'Q', 'queen'),
      J: L('#f4f6fb', '#8e98ad', 'J', 'jack'),
      crystal: { glyph: 'brilliant', c1: '#ffffff', c2: '#c9b6ff', label: 'wild' },
    },
    motion: { vmax: 17, windupS: 0.12, windupCells: 0.12, accelS: 0.42, brakeCells: 7.5, overshootCells: 0.06, bounceS: 0.3 },
    stagger: 0.24,
    tease: [0.6, 1.3],
    lineStyle: 'light',
    celebration: { particle: 'sparkles', colors: ['#ffffff', '#bfe6ff', '#e8cf9a'], shake: false },
  },

  goldenFortune: {
    id: 'goldenFortune',
    emoji: '🪙',
    font: { family: 'Cinzel', stack: "'Cinzel', 'Trajan Pro', Georgia, serif" },
    style: 'coin',
    palette: { '--m-bg': '#1b1712', '--m-metal1': '#ffe08a', '--m-metal2': '#8c6414', '--m-accent': '#ffe08a', '--m-accent2': '#2e8b6f', '--m-reel': '#221b12', '--m-reel-edge': '#3a2e1d', '--m-glow': 'rgba(255, 200, 80, 0.55)', '--m-text': '#fff3cf' },
    symbols: {
      idol: { glyph: 'idol', c1: '#fff0a8', c2: '#b5820f', label: 'idol' },
      ingot: { glyph: 'ingot', c1: '#fff0a8', c2: '#c08a12', label: 'ingot' },
      scarab: { glyph: 'scarab', c1: '#6fe0b8', c2: '#1d6e55', label: 'scarab' },
      sundisk: { icon: Sun, c1: '#ffd66b', c2: '#b0700a', label: 'sunDisk' },
      hourglass: { icon: Hourglass, c1: '#f0d49a', c2: '#8a6414', label: 'hourglass' },
      A: L('#ffe9a8', '#a8781c', 'A', 'ace'),
      K: L('#ffe9a8', '#a8781c', 'K', 'king'),
      Q: L('#ffe9a8', '#a8781c', 'Q', 'queen'),
      J: L('#ffe9a8', '#a8781c', 'J', 'jack'),
      T: L('#ffe9a8', '#a8781c', '10', 'ten'),
      mask: { glyph: 'mask', c1: '#fff0a8', c2: '#b5820f', label: 'wild' },
      coin: { glyph: 'coin', c1: '#fff0a8', c2: '#c08a12', label: 'coins' },
    },
    motion: { vmax: 19, windupS: 0.14, windupCells: 0.26, accelS: 0.38, brakeCells: 7, overshootCells: 0.16, bounceS: 0.26 },
    stagger: 0.27,
    tease: [0.6, 1.3],
    lineStyle: 'gold',
    celebration: { particle: 'gold', colors: ['#ffe08a', '#f5b73b', '#fff6d6'], shake: false },
  },

  inferno: {
    id: 'inferno',
    emoji: '🔥',
    font: { family: 'Anton', stack: "'Anton', Impact, 'Arial Narrow', sans-serif" },
    style: 'ember',
    palette: { '--m-bg': '#120807', '--m-metal1': '#ff8a3d', '--m-metal2': '#3a1206', '--m-accent': '#ffb020', '--m-accent2': '#ff4d00', '--m-reel': '#0d0605', '--m-reel-edge': '#2a120c', '--m-glow': 'rgba(255, 77, 0, 0.6)', '--m-text': '#fff1c1' },
    symbols: {
      dragon: { glyph: 'dragon', c1: '#ffb020', c2: '#b3200a', label: 'dragon' },
      phoenix: { icon: Bird, c1: '#ffd166', c2: '#ff4d00', label: 'phoenix' },
      skull: { icon: Skull, c1: '#ffe0cc', c2: '#ff4d00', label: 'flameSkull' },
      lava: { glyph: 'lava', c1: '#ff7a1a', c2: '#8a1400', label: 'lava' },
      A: L('#fff1c1', '#ff4d00', 'A', 'ace'),
      K: L('#fff1c1', '#ff4d00', 'K', 'king'),
      Q: L('#fff1c1', '#ff4d00', 'Q', 'queen'),
      J: L('#fff1c1', '#ff4d00', 'J', 'jack'),
      T: L('#fff1c1', '#ff4d00', '10', 'ten'),
      fire: { icon: Flame, c1: '#fff1c1', c2: '#ff4d00', label: 'wild' },
      volcano: { glyph: 'volcano', c1: '#fff1c1', c2: '#ff4d00', label: 'volcano' },
    },
    motion: { vmax: 32, windupS: 0.05, windupCells: 0.1, accelS: 0.15, brakeCells: 6, overshootCells: 0.05, bounceS: 0.09 },
    stagger: 0.15,
    tease: [0.7, 1.6],
    lineStyle: 'fire',
    celebration: { particle: 'embers', colors: ['#ffb300', '#ff5a1f', '#ffe08a'], shake: true },
  },

  tropical: {
    id: 'tropical',
    emoji: '🌴',
    font: { family: 'Lilita One', stack: "'Lilita One', 'Arial Rounded MT Bold', sans-serif" },
    style: 'bubble',
    palette: { '--m-bg': '#083d4f', '--m-metal1': '#d9a86c', '--m-metal2': '#6d4a24', '--m-accent': '#ffb74a', '--m-accent2': '#ff6f59', '--m-reel': '#dff6f2', '--m-reel-edge': '#9fd9d0', '--m-glow': 'rgba(255, 183, 74, 0.5)', '--m-text': '#ffffff' },
    symbols: {
      parrot: { icon: Bird, c1: '#ff6f59', c2: '#1f7a4d', label: 'parrot' },
      sailboat: { icon: Sailboat, c1: '#6fb6ff', c2: '#1d4ed8', label: 'sailboat' },
      fish: { icon: Fish, c1: '#ffb74a', c2: '#ff6f59', label: 'fish' },
      shell: { icon: Shell, c1: '#ffc2d1', c2: '#e0527a', label: 'shell' },
      hibiscus: { icon: Flower2, c1: '#ff8fb1', c2: '#d6245a', label: 'hibiscus' },
      banana: { icon: Banana, c1: '#fff176', c2: '#d4a300', label: 'banana' },
      citrus: { icon: Citrus, c1: '#c6f26b', c2: '#4d8a0f', label: 'lime' },
      grape: { icon: Grape, c1: '#c9a2ff', c2: '#6a2bb5', label: 'grape' },
      cherry: { icon: Cherry, c1: '#ff7a8a', c2: '#c0122e', label: 'cherry' },
      palm: { icon: TreePalm, c1: '#6fe3a0', c2: '#1f7a4d', label: 'wild' },
      island: { glyph: 'island', c1: '#6fe3a0', c2: '#1f7a4d', label: 'island' },
    },
    motion: { vmax: 16, windupS: 0.12, windupCells: 0.22, accelS: 0.36, brakeCells: 6.5, overshootCells: 0.28, bounceS: 0.34 },
    stagger: 0.22,
    tease: [0.55, 1.2],
    lineStyle: 'tide',
    celebration: { particle: 'petals', colors: ['#ff6f59', '#ffb74a', '#0fb5ae', '#ff8fb1'], shake: false },
  },

  pirates: {
    id: 'pirates',
    emoji: '🏴‍☠️',
    font: { family: 'Pirata One', stack: "'Pirata One', 'Old English Text MT', Georgia, serif" },
    style: 'ink',
    palette: { '--m-bg': '#2a1a10', '--m-metal1': '#c89a52', '--m-metal2': '#4a2e14', '--m-accent': '#e0a83a', '--m-accent2': '#9b1b1b', '--m-reel': '#e9d3a5', '--m-reel-edge': '#b8955a', '--m-glow': 'rgba(224, 168, 58, 0.5)', '--m-text': '#f6e7c4' },
    symbols: {
      captain: { glyph: 'captain', c1: '#3a2415', c2: '#1a0f08', ink: '#2b1d14', label: 'captain' },
      ship: { icon: Ship, c1: '#2b1d14', c2: '#2b1d14', label: 'ship' },
      compass: { icon: Compass, c1: '#2b1d14', c2: '#2b1d14', label: 'compass' },
      anchor: { icon: Anchor, c1: '#1e4e5a', c2: '#1e4e5a', label: 'anchor' },
      map: { icon: MapIcon, c1: '#6b4423', c2: '#6b4423', label: 'map' },
      A: L('#9b1b1b', '#5a0d0d', 'A', 'ace', '#2b1d14'),
      K: L('#2b1d14', '#2b1d14', 'K', 'king'),
      Q: L('#9b1b1b', '#5a0d0d', 'Q', 'queen', '#2b1d14'),
      J: L('#2b1d14', '#2b1d14', 'J', 'jack'),
      T: L('#1e4e5a', '#1e4e5a', '10', 'ten'),
      flag: { icon: Flag, c1: '#9b1b1b', c2: '#9b1b1b', label: 'wild' },
      chest: { glyph: 'chest', c1: '#ffd66b', c2: '#b07a14', label: 'chest' },
    },
    motion: { vmax: 19, windupS: 0.2, windupCells: 0.36, accelS: 0.4, brakeCells: 7, overshootCells: 0.26, bounceS: 0.34 },
    stagger: 0.3,
    tease: [0.6, 1.4],
    lineStyle: 'route',
    celebration: { particle: 'doubloons', colors: ['#e0a83a', '#f6d27a', '#b07a14'], shake: false },
  },

  cosmic: {
    id: 'cosmic',
    emoji: '🚀',
    font: { family: 'Orbitron', stack: "'Orbitron', 'Eurostile', sans-serif" },
    style: 'neon',
    palette: { '--m-bg': '#05040f', '--m-metal1': '#35e0ff', '--m-metal2': '#6b2bd9', '--m-accent': '#35e0ff', '--m-accent2': '#ff3dcb', '--m-reel': 'rgba(10, 8, 30, 0.72)', '--m-reel-edge': '#1d1846', '--m-glow': 'rgba(53, 224, 255, 0.55)', '--m-text': '#f4f2ff' },
    symbols: {
      alien: { glyph: 'alien', c1: '#9dff8a', c2: '#1f9e5a', label: 'alien' },
      planet: { glyph: 'planet', c1: '#ffb3f0', c2: '#6b2bd9', label: 'planet' },
      galaxy: { icon: Orbit, c1: '#ff3dcb', c2: '#ff3dcb', label: 'galaxy' },
      crystal: { icon: Hexagon, c1: '#35e0ff', c2: '#35e0ff', label: 'cosmicCrystal' },
      comet: { glyph: 'comet', c1: '#ffe27a', c2: '#ff3dcb', label: 'comet' },
      A: L('#35e0ff', '#35e0ff', 'A', 'ace'),
      K: L('#ff3dcb', '#ff3dcb', 'K', 'king'),
      Q: L('#9d7bff', '#9d7bff', 'Q', 'queen'),
      J: L('#35e0ff', '#35e0ff', 'J', 'jack'),
      T: L('#ff3dcb', '#ff3dcb', '10', 'ten'),
      star: { icon: Sparkle, c1: '#ffffff', c2: '#ffffff', label: 'wild' },
      portal: { glyph: 'portal', c1: '#35e0ff', c2: '#6b2bd9', label: 'portal' },
    },
    motion: { vmax: 36, windupS: 0.06, windupCells: 0.08, accelS: 0.2, brakeCells: 8, overshootCells: 0.12, bounceS: 0.2 },
    stagger: 0.18,
    tease: [0.6, 1.5],
    lineStyle: 'neon',
    celebration: { particle: 'stars', colors: ['#35e0ff', '#ff3dcb', '#f4f2ff'], shake: false },
  },

  royal: {
    id: 'royal',
    emoji: '👑',
    font: { family: 'Limelight', stack: "'Limelight', 'Broadway', Georgia, serif" },
    style: 'enamel',
    palette: { '--m-bg': '#0b0b0d', '--m-metal1': '#f1dfae', '--m-metal2': '#8a6a24', '--m-accent': '#c9a24a', '--m-accent2': '#5a0f1e', '--m-reel': '#101012', '--m-reel-edge': '#26221a', '--m-glow': 'rgba(201, 162, 74, 0.55)', '--m-text': '#f7f3ea' },
    symbols: {
      crown: { icon: Crown, c1: '#f1dfae', c2: '#c9a24a', label: 'crown' },
      scepter: { icon: Wand, c1: '#f1dfae', c2: '#c9a24a', label: 'scepter' },
      chalice: { icon: Wine, c1: '#f1dfae', c2: '#c9a24a', label: 'chalice' },
      ring: { glyph: 'ring', c1: '#f1dfae', c2: '#c9a24a', label: 'royalRing' },
      shield: { icon: Shield, c1: '#f1dfae', c2: '#c9a24a', label: 'shield' },
      A: L('#f1dfae', '#c9a24a', 'A', 'ace'),
      K: L('#f1dfae', '#c9a24a', 'K', 'king'),
      Q: L('#f1dfae', '#c9a24a', 'Q', 'queen'),
      J: L('#f1dfae', '#c9a24a', 'J', 'jack'),
      seal: { glyph: 'seal', c1: '#b3243c', c2: '#5a0f1e', label: 'wild' },
      crest: { glyph: 'crest', c1: '#f1dfae', c2: '#c9a24a', label: 'crest' },
    },
    motion: { vmax: 20, windupS: 0.12, windupCells: 0.16, accelS: 0.36, brakeCells: 7, overshootCells: 0.12, bounceS: 0.28 },
    stagger: 0.32,
    tease: [0.7, 1.6],
    lineStyle: 'deco',
    celebration: { particle: 'confetti', colors: ['#c9a24a', '#f1dfae', '#5a0f1e'], shake: false },
  },
};
