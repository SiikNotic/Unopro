// AIR HOCKEY: the table's measurements, shared by the simulation, the AI and the drawing.
export const W = 1000;
export const H = 1700;
export const MID = H / 2;
export const PUCK_R = 46;
export const MALLET_R = 60;
/** The goal mouth, centred on each short side. */
export const GOAL_W = 400;
export const GOAL_X0 = (W - GOAL_W) / 2;
export const GOAL_X1 = (W + GOAL_W) / 2;

export const PLAYER_HOME = { x: W / 2, y: H - 170 };
export const AI_HOME = { x: W / 2, y: 170 };

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
