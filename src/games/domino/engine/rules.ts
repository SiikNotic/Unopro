// Domino — rules that need no hidden information. Used by the engine AND by a player's view (bots, UI),
// so legality is decided in exactly one place.
import type { DominoAction, End, PlacedTile, Pip, Tile } from './types';

export const MAX_PIP = 6;
export const PLAYERS_MIN = 2;
export const PLAYERS_MAX = 4;
export const HAND_SIZE = 7;
export const DEFAULT_TARGET = 100;

export function tileId(a: number, b: number): string {
  return a <= b ? `${a}-${b}` : `${b}-${a}`;
}

/** The 28 tiles of a double-six set, in a fixed order (0-0, 0-1 … 6-6). */
export function fullSet(): Tile[] {
  const out: Tile[] = [];
  for (let a = 0; a <= MAX_PIP; a++) for (let b = a; b <= MAX_PIP; b++) out.push({ id: tileId(a, b), a: a as Pip, b: b as Pip });
  return out;
}

export const isDouble = (t: Tile) => t.a === t.b;
export const pipsOf = (t: Tile) => t.a + t.b;
export const handPips = (hand: readonly Tile[]) => hand.reduce((s, t) => s + pipsOf(t), 0);

export function openEnds(line: readonly PlacedTile[]): { left: Pip; right: Pip } | null {
  if (line.length === 0) return null;
  return { left: line[0].left, right: line[line.length - 1].right };
}

export const fits = (t: Tile, pip: Pip) => t.a === pip || t.b === pip;

/** Where a tile may go: both ends when the line is empty (the UI treats that as one placement). */
export function endsFor(t: Tile, line: readonly PlacedTile[]): End[] {
  const ends = openEnds(line);
  if (!ends) return ['right'];
  const out: End[] = [];
  if (fits(t, ends.left)) out.push('left');
  if (fits(t, ends.right)) out.push('right');
  return out;
}

export interface MoveContext {
  playerId: string;
  hand: readonly Tile[];
  line: readonly PlacedTile[];
  boneyardCount: number;
  mustLead: string | null;
}

/**
 * Every legal action for the player whose turn it is:
 * - a play for each tile/end that matches (only the required tile when opening round 1);
 * - otherwise DRAW while the boneyard has tiles, and PASS only when it is empty.
 * Two placements that give the same line (same open pips on both ends) are both listed; that is harmless.
 */
export function legalMoves(ctx: MoveContext): DominoAction[] {
  const { playerId, hand, line, boneyardCount, mustLead } = ctx;
  const plays: DominoAction[] = [];
  for (const t of hand) {
    if (line.length === 0 && mustLead && t.id !== mustLead) continue;
    for (const end of endsFor(t, line)) plays.push({ type: 'PLAY_TILE', playerId, tileId: t.id, end });
  }
  if (plays.length > 0) return plays;
  return [boneyardCount > 0 ? { type: 'DRAW', playerId } : { type: 'PASS', playerId }];
}

/** Orientation of a tile laid at an end: the matching pip faces the line. */
export function placeAt(t: Tile, end: End, line: readonly PlacedTile[], by: string, seq: number): PlacedTile {
  const ends = openEnds(line);
  if (!ends) return { tile: t, left: t.a, right: t.b, by, seq };
  if (end === 'right') {
    const join = ends.right;
    return { tile: t, left: join, right: (t.a === join ? t.b : t.a) as Pip, by, seq };
  }
  const join = ends.left;
  return { tile: t, left: (t.a === join ? t.b : t.a) as Pip, right: join, by, seq };
}

/** Opener of round 1: highest double, else the highest tile (by pips, then by its higher half). */
export function openingTile(hands: readonly (readonly Tile[])[]): { seat: number; tile: Tile } {
  let best: { seat: number; tile: Tile; rank: number } | null = null;
  hands.forEach((hand, seat) => {
    for (const t of hand) {
      const rank = isDouble(t) ? 1000 + t.a : pipsOf(t) * 10 + Math.max(t.a, t.b);
      if (!best || rank > best.rank) best = { seat, tile: t, rank };
    }
  });
  if (!best) throw new Error('no tiles dealt');
  const b = best as { seat: number; tile: Tile };
  return { seat: b.seat, tile: b.tile };
}
