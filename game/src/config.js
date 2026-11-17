// EMBER LINE tuning constants. Every number the rules or the look depend on lives here.

export const VIEW = { width: 1280, height: 720 };

export const GRID = {
  cols: 40,
  rows: 24,
  cell: 26,
  // Board placement inside the 1280x720 view: a HUD band above, a hint line below.
  x: 120,
  y: 74,
};

// The village: a cluster around the centre of the board, given as [col, row] offsets
// from the centre cell (20, 12). Rounded corners so it reads as a settlement, not a box.
export const VILLAGE_SHAPE = [
  [-1, -2], [0, -2],
  [-2, -1], [-1, -1], [0, -1], [1, -1],
  [-2, 0], [-1, 0], [0, 0], [1, 0],
  [-1, 1], [0, 1],
];

// The houses drawn on that footprint: nine of them, each owning one or more village cells (as
// offsets from the centre cell, like VILLAGE_SHAPE). A house is lost the moment fire takes any
// cell it owns; that is the same test the rules use to end the run (fire reaching a village
// cell). Eight cottages ring a larger hall that owns the four inner cells.
export const HOUSES = [
  { cells: [[-1, -2]], w: 20, h: 12 },
  { cells: [[0, -2]], w: 18, h: 11 },
  { cells: [[-2, -1]], w: 19, h: 12 },
  { cells: [[1, -1]], w: 20, h: 11 },
  { cells: [[-1, -1], [0, -1], [-1, 0], [0, 0]], w: 34, h: 17 },
  { cells: [[-2, 0]], w: 18, h: 12 },
  { cells: [[1, 0]], w: 19, h: 12 },
  { cells: [[-1, 1]], w: 20, h: 11 },
  { cells: [[0, 1]], w: 18, h: 12 },
];

// Fire within this many cells (orthogonal steps) of a standing house raises smoke on that side.
export const SMOKE_RANGE = 3;

// The fields: every cell within this Euclidean distance (in cells) of a village cell is a
// field. Fields burn like forest but cannot be dug, so no break can hug the houses: the tightest
// ring that closes around the fields costs RING_MIN water (see rampTable in this file).
export const FIELD_RADIUS = 3;
export const RING_MIN = 28;

// Screen shake, in simulation steps (60 = 1 s) and peak amplitude in view pixels.
//  - breach: fire reaches the cells beside a house (once per wave).
//  - touch: fire stands on the far side of a painted break, i.e. a line has just stopped working.
//    Softer and shorter, at most once per `cooldown` steps.
export const SHAKE = { steps: 15, amp: 6 };
export const SHAKE_TOUCH = { steps: 9, amp: 2.5, cooldown: 45 };

// Dust kicked up when a firebreak stroke completes: 8 to 14 grey motes along the drawn line,
// each living `life` simulation steps (40 = 0.67 s). Motion is a pure function of the tick.
export const DUST = { min: 8, max: 14, life: 40 };

// Simulation timing.
export const STEP = 1 / 60;            // fixed simulation step (seconds)
export const MAX_STEPS_PER_FRAME = 6;  // capped catch-up after a slow frame
export const MAX_FRAME = 0.25;         // a longer stall is dropped, not replayed

// Fire behaviour, counted in fire ticks. How many simulation steps a fire tick lasts is the
// per-wave `tickSteps` in RAMP below.
export const FIRE = {
  spreadAge: 2,        // a burning cell spreads once it has burned this many ticks
  burnTicks: 16,       // then it burns out and becomes ash
  kindleTicks: 8,      // fresh ignitions smoulder this long before they can spread
  ignitionLen: 3,      // each ignition lights a short run of cells
  innerDistance: 8,    // an inland ignition lands at least this far (cells) from every house
};

// A run is won by holding the line through this many waves. There is no wave WIN_WAVES + 1.
export const WIN_WAVES = 8;

// The difficulty ramp, one row per wave. This table is the whole curve.
//  edge     fires lit on the board's edge (a 3-cell run)
//  inner    fires lit anywhere inland, at least FIRE.innerDistance from the houses: they skip
//           the long walk in from the edge, so they are the panic
//  water    units of break the player may draw this wave (1 unit = 1 break cell)
//  tickSteps simulation steps per fire tick. A front advances one cell every
//           (FIRE.spreadAge + 1) fire ticks, so the spread interval is 3 * tickSteps steps and
//           the front moves 60 / (3 * tickSteps) cells per second.
// Caps, and why:
//  - water never drops below 32 = RING_MIN + 4: the cheapest guaranteed defence (a ring around
//    the fields) always fits, with four cells of slack for a hand-drawn, imperfect ring.
//  - tickSteps never drops below 7 (2.9 cells/s): an inland fire 8 cells out then needs at least
//    2.3 s to reach the ring's line, enough for a fast hand to close a 28-cell ring. Any faster
//    and the last waves would be lost before a human could finish drawing.
//  - at most 6 fires: ignitions keep 10 cells apart so each reads as its own fire.
export const RAMP = [
  { edge: 2, inner: 0, water: 110, tickSteps: 12 }, // 1  calm: two edge fires, plenty of water
  { edge: 2, inner: 0, water: 92, tickSteps: 11 },  // 2
  { edge: 2, inner: 1, water: 70, tickSteps: 9 },   // 3  first inland fire
  { edge: 3, inner: 1, water: 50, tickSteps: 8 },   // 4
  { edge: 3, inner: 2, water: 34, tickSteps: 8 },   // 5  a hand-drawn ring takes nearly all of it
  { edge: 3, inner: 2, water: 33, tickSteps: 7 },   // 6
  { edge: 4, inner: 2, water: 32, tickSteps: 7 },   // 7
  { edge: 4, inner: 2, water: 32, tickSteps: 7 },   // 8  last wave
];

export function rampFor(wave) {
  return RAMP[Math.max(0, Math.min(RAMP.length, wave) - 1)];
}

export function ignitionsFor(wave) {
  const w = rampFor(wave);
  return w.edge + w.inner;
}

export function waterFor(wave) {
  return rampFor(wave).water;
}

/** Simulation steps per fire tick on this wave. */
export function tickStepsFor(wave) {
  return rampFor(wave).tickSteps;
}

/** Front speed on this wave in cells per second (one direction). */
export function frontSpeedFor(wave) {
  return 60 / ((FIRE.spreadAge + 1) * tickStepsFor(wave));
}

// Scoring.
export const SCORE = { tree: 10, wave: 250, water: 2 };

// Board generation: a few bare clearings that do not burn.
export const CLEARING_CHANCE = 0.035;

// Palette (art direction).
export const COLORS = {
  ground: '#12100E',
  tree: '#2E4A32',
  burning: '#7A3B1E',
  burnt: '#1A1512',
  fire: '#FF7A2F',
  fireCore: '#FFD24A',
  brk: '#6E6A62',
  field: '#3A3422',
  fieldTuft: '#7A6C3C',
  dust: '#A8A196',
  village: '#E8E2D4',
  hud: '#F2EDE3',
  accent: '#FFB03A',
  danger: '#E8503A',
  rim: '#FFE7A0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
