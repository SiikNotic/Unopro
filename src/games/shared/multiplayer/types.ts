// Multiplayer contracts shared by Domino and Bingo (Carta has its own in src/game/multiplayer).
//
//   engine (pure rules) → state → actions → validation → seat drivers (local human / bot / remote) → UI
//
// The authority (LocalHost today, a server later) is the only thing that applies actions. Clients only
// ever *propose* serialisable actions and receive the view their seat is allowed to see.

export type SeatKind = 'human' | 'bot' | 'remote';

export interface Seat {
  id: string;
  name: string;
  kind: SeatKind;
}

/** Every action names the seat that proposes it; the authority checks it against the real sender. */
export interface SeatAction {
  type: string;
  playerId: string;
}

export type ApplyResult<S, E> = { ok: true; state: S; events: E[] } | { ok: false; error: string };

/** What an authority needs from a game: pure rules, per-seat views, strict action parsing. */
export interface GameRules<S, A extends { type: string }, V, E> {
  id: string;
  apply(state: S, action: A): ApplyResult<S, E>;
  /** What one seat may know: no hidden hands, no undealt tiles/balls, no RNG state. */
  viewFor(state: S, playerId: string): V;
  /** Accepts untrusted JSON (from a socket, storage, a test) and returns a well-formed action or null. */
  parseAction(raw: unknown): A | null;
  /** Actions only the authority itself may issue (e.g. Bingo's number caller). */
  isHouseAction?(action: A): boolean;
}

/** A bot (or any automated seat): decides from its view only. `delayMs` paces it like a person. */
export interface SeatDriver<V, A> {
  decide(view: V, playerId: string): { action: A; delayMs: number } | null;
}

/**
 * Transport for online play (not connected yet). A server implementation would hold the authoritative
 * state, run GameRules.apply on received actions and push each seat its own view.
 */
export interface RoomTransport<V, A> {
  createRoom(game: string, seats: number): Promise<{ code: string }>;
  joinRoom(code: string, name: string): Promise<{ seatId: string }>;
  setReady(ready: boolean): Promise<void>;
  sendAction(action: A): Promise<void>;
  onView(handler: (view: V) => void): () => void;
  leave(): Promise<void>;
}
