// The board: a grid of cells and the fire that moves through it. Fire spreads only to the four
// orthogonal neighbours, only on a fire tick, and never into a break, a clearing or ash.
import { GRID, VILLAGE_SHAPE, HOUSES, FIRE, CLEARING_CHANCE } from './config.js';
import { createRng } from './rng.js';

export const GROUND = 0;   // bare clearing, never burns
export const TREE = 1;
export const FIRE_CELL = 2;
export const BURNT = 3;
export const BREAK = 4;
export const VILLAGE = 5;

export const EVENT_VILLAGE = 'village';
export const EVENT_CLEAR = 'clear';

const { cols, rows } = GRID;
const centreCol = Math.floor(cols / 2);
const centreRow = Math.floor(rows / 2);

export function index(c, r) {
  return r * cols + c;
}

export function inBounds(c, r) {
  return c >= 0 && r >= 0 && c < cols && r < rows;
}

/** Calls fn(neighbourIndex) for each in-bounds orthogonal neighbour of cell i. */
function eachNeighbour(i, fn) {
  const c = i % cols;
  const r = (i - c) / cols;
  if (c > 0) fn(i - 1);
  if (c < cols - 1) fn(i + 1);
  if (r > 0) fn(i - cols);
  if (r < rows - 1) fn(i + cols);
}

/** Village cell indices, fixed for every board. */
export const VILLAGE_CELLS = VILLAGE_SHAPE.map(([dc, dr]) => index(centreCol + dc, centreRow + dr));

/** Each house's village cell indices, in HOUSES order. */
export const HOUSE_CELLS = HOUSES.map((h) => h.cells.map(([dc, dr]) => index(centreCol + dc, centreRow + dr)));

/** Village bounding box in cells, inclusive. */
export const VILLAGE_BOX = (() => {
  const cs = VILLAGE_SHAPE.map(([dc]) => centreCol + dc);
  const rs = VILLAGE_SHAPE.map(([, dr]) => centreRow + dr);
  return { c0: Math.min(...cs), c1: Math.max(...cs), r0: Math.min(...rs), r1: Math.max(...rs) };
})();

/** A fresh forest for one wave: trees everywhere, a few clearings, the village at the centre. */
export function createBoard(seed) {
  const rng = createRng(seed);
  const type = new Uint8Array(cols * rows);
  const age = new Int16Array(cols * rows);
  for (let i = 0; i < type.length; i += 1) {
    const c = i % cols;
    const r = (i - c) / cols;
    const nearVillage = Math.abs(c - centreCol) <= 4 && Math.abs(r - centreRow) <= 4;
    const edge = c === 0 || r === 0 || c === cols - 1 || r === rows - 1;
    type[i] = !nearVillage && !edge && rng.next() < CLEARING_CHANCE ? GROUND : TREE;
  }
  for (const i of VILLAGE_CELLS) type[i] = VILLAGE;
  return { type, age, tick: 0, ignitions: [], breach: null };
}

/**
 * Light `count` fires on random edges. Each ignition is a short run of edge cells that smoulders
 * for FIRE.kindleTicks before it can spread. Ignitions keep apart so they read as separate fires.
 */
export function ignite(board, rng, count) {
  const placed = [];
  let guard = 0;
  while (placed.length < count && guard < 200) {
    guard += 1;
    const side = rng.int(4); // 0 top, 1 right, 2 bottom, 3 left
    const along = side % 2 === 0 ? cols : rows;
    const u = 3 + rng.int(along - 6);
    const cell = edgeCell(side, u, 0);
    if (placed.some((p) => Math.abs(p.c - cell.c) + Math.abs(p.r - cell.r) < 10)) continue;
    placed.push({ side, u, c: cell.c, r: cell.r });
    const half = Math.floor(FIRE.ignitionLen / 2);
    for (let k = -half; k <= half; k += 1) {
      const { c, r } = edgeCell(side, u + k, 0);
      const i = index(c, r);
      if (board.type[i] === TREE) {
        board.type[i] = FIRE_CELL;
        board.age[i] = -FIRE.kindleTicks;
      }
    }
  }
  board.ignitions = placed;
  return placed;
}

/** Map edge-local coordinates (side, u along the edge, v inward) to a cell. */
export function edgeCell(side, u, v) {
  if (side === 0) return { c: u, r: v };
  if (side === 1) return { c: cols - 1 - v, r: u };
  if (side === 2) return { c: u, r: rows - 1 - v };
  return { c: v, r: u };
}

/**
 * Did lighting the cells in `toLight` breach the player's line? Checked against the board as it
 * stands before those cells catch. Returns 'house', 'line' or null. The exact conditions:
 *  - 'house': a cell about to catch is orthogonally adjacent to a village cell (a fire cell is
 *    becoming a neighbour of a house).
 *  - 'line': a cell about to catch sits orthogonally next to a break cell B, and the cell
 *    directly across B from it (same row or column, two steps away) is already burning or burnt.
 *    Fire now stands on both sides of that painted break: it has gone around or past the line.
 */
function breachOf(type, toLight) {
  let line = false;
  for (const n of toLight) {
    if (type[n] !== TREE) continue;
    const c = n % cols;
    const r = (n - c) / cols;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!inBounds(c + dc, r + dr)) continue;
      const b = type[index(c + dc, r + dr)];
      if (b === VILLAGE) return 'house';
      if (b !== BREAK || !inBounds(c + 2 * dc, r + 2 * dr)) continue;
      const o = type[index(c + 2 * dc, r + 2 * dr)];
      if (o === FIRE_CELL || o === BURNT) line = true;
    }
  }
  return line ? 'line' : null;
}

/**
 * One fire tick. Burning cells old enough spread to neighbouring trees; every fire ages and
 * old fires burn out to ash. Returns EVENT_VILLAGE when fire reaches a house, EVENT_CLEAR when no
 * fire has anything left to spread into, else null. Sets board.breach to breachOf()'s verdict
 * for this tick.
 */
export function tick(board) {
  const { type, age } = board;
  const toLight = [];
  let villageHit = -1;
  for (let i = 0; i < type.length; i += 1) {
    if (type[i] !== FIRE_CELL || age[i] < FIRE.spreadAge) continue;
    eachNeighbour(i, (n) => {
      if (type[n] === TREE) toLight.push(n);
      else if (type[n] === VILLAGE && villageHit < 0) villageHit = n;
    });
  }
  for (let i = 0; i < type.length; i += 1) {
    if (type[i] !== FIRE_CELL) continue;
    age[i] += 1;
    if (age[i] >= FIRE.burnTicks) type[i] = BURNT;
  }
  board.breach = breachOf(type, toLight);
  for (const n of toLight) {
    if (type[n] === TREE) {
      type[n] = FIRE_CELL;
      age[n] = 0;
    }
  }
  board.tick += 1;
  if (villageHit >= 0) {
    type[villageHit] = FIRE_CELL;
    age[villageHit] = 0;
    return EVENT_VILLAGE;
  }
  return fireIsOut(board) ? EVENT_CLEAR : null;
}

/** True when no burning cell has a burnable neighbour (a tree or a house). */
export function fireIsOut(board) {
  const { type } = board;
  for (let i = 0; i < type.length; i += 1) {
    if (type[i] !== FIRE_CELL) continue;
    let live = false;
    eachNeighbour(i, (n) => {
      if (type[n] === TREE || type[n] === VILLAGE) live = true;
    });
    if (live) return false;
  }
  return true;
}

/** True when fire cell i can still spread: it has a tree or a house beside it (the front). */
export function isFront(board, i) {
  if (board.type[i] !== FIRE_CELL) return false;
  let live = false;
  eachNeighbour(i, (n) => {
    const t = board.type[n];
    if (t === TREE || t === VILLAGE) live = true;
  });
  return live;
}

/** Per house, true while every cell it owns is still a village cell (fire has not touched it). */
export function houseStanding(board) {
  return HOUSE_CELLS.map((cells) => cells.every((i) => board.type[i] === VILLAGE));
}

export function countHouses(board) {
  return houseStanding(board).filter(Boolean).length;
}

/** True when cell i is a break with a fire beside it: the line is holding there. */
export function isHolding(board, i) {
  if (board.type[i] !== BREAK) return false;
  let hot = false;
  eachNeighbour(i, (n) => {
    if (board.type[n] === FIRE_CELL) hot = true;
  });
  return hot;
}

export function countTrees(board) {
  let n = 0;
  for (let i = 0; i < board.type.length; i += 1) if (board.type[i] === TREE) n += 1;
  return n;
}

export function countFires(board) {
  let n = 0;
  for (let i = 0; i < board.type.length; i += 1) if (board.type[i] === FIRE_CELL) n += 1;
  return n;
}
