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

// Screen shake on the first breach of a wave: duration in simulation steps (15 = 250 ms) and
// peak amplitude in view pixels.
export const SHAKE = { steps: 15, amp: 6 };

// Simulation timing.
export const STEP = 1 / 60;            // fixed simulation step (seconds)
export const MAX_STEPS_PER_FRAME = 6;  // capped catch-up after a slow frame
export const MAX_FRAME = 0.25;         // a longer stall is dropped, not replayed

// Fire behaviour.
export const FIRE = {
  baseTps: 6,          // fire ticks per second on wave 1
  tpsPerWave: 0.45,    // each wave ticks a little faster ...
  maxTps: 9,           // ... up to this cap
  spreadAge: 2,        // a burning cell spreads once it has burned this many ticks
  burnTicks: 16,       // then it burns out and becomes ash
  kindleTicks: 8,      // fresh ignitions smoulder this long before they can spread
  ignitionLen: 3,      // each ignition lights a short run of edge cells
};

// Water: the only constraint. One unit of water paints one break cell along the drawn line;
// painting over an existing break is free. Budget is per wave and never refills inside it.
export const WATER = {
  base: 140,
  perWave: 8,
  min: 72,
};

// Ignitions per wave: 2 on wave 1, rising to 4.
export function ignitionsFor(wave) {
  return Math.min(4, 2 + Math.floor((wave - 1) / 2));
}

export function tpsFor(wave) {
  return Math.min(FIRE.maxTps, FIRE.baseTps + FIRE.tpsPerWave * (wave - 1));
}

export function waterFor(wave) {
  return Math.max(WATER.min, WATER.base - WATER.perWave * (wave - 1));
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
  village: '#E8E2D4',
  hud: '#F2EDE3',
  accent: '#FFB03A',
  danger: '#E8503A',
  rim: '#FFE7A0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
