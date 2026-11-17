// Firebreaks and water. A break can only be cut through standing trees (never fields or clearings); each new break cell costs
// one unit of water, painting over an existing break is free, and erasing a break gives its water
// back. Strokes are rasterised as 8-connected lines, which a 4-way fire can never slip through.
import { GRID } from './config.js';
import { BREAK, TREE, index, inBounds } from './grid.js';

export function createWater(budget) {
  return { budget, left: budget };
}

/** Paint one cell. Returns true when the board changed. */
export function paintCell(board, water, c, r) {
  if (!inBounds(c, r)) return false;
  const i = index(c, r);
  if (board.type[i] === BREAK) return false; // already a break: free, nothing to do
  if (board.type[i] !== TREE || water.left < 1) return false;
  board.type[i] = BREAK;
  water.left -= 1;
  return true;
}

/** Erase one break cell back to forest and refund its water. */
export function eraseCell(board, water, c, r) {
  if (!inBounds(c, r)) return false;
  const i = index(c, r);
  if (board.type[i] !== BREAK) return false;
  board.type[i] = TREE;
  water.left = Math.min(water.budget, water.left + 1);
  return true;
}

/**
 * Apply a stroke segment between two cells (inclusive), painting or erasing along it. Cells
 * newly painted are appended to `out` (when given) as {c, r}.
 */
export function strokeCells(board, water, from, to, erase, out = null) {
  let x0 = from.c;
  let y0 = from.r;
  const x1 = to.c;
  const y1 = to.r;
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let changed = 0;
  for (let guard = 0; guard < 200; guard += 1) {
    const did = erase ? eraseCell(board, water, x0, y0) : paintCell(board, water, x0, y0);
    if (did) {
      changed += 1;
      if (out) out.push({ c: x0, r: y0 });
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
  return changed;
}

/** View coordinates to a board cell, or null when off the board. */
export function cellAt(x, y) {
  const c = Math.floor((x - GRID.x) / GRID.cell);
  const r = Math.floor((y - GRID.y) / GRID.cell);
  return inBounds(c, r) ? { c, r } : null;
}

/** Like cellAt, but clamps to the nearest edge cell so a fast stroke off the board still lands. */
export function cellClamped(x, y) {
  const c = Math.max(0, Math.min(GRID.cols - 1, Math.floor((x - GRID.x) / GRID.cell)));
  const r = Math.max(0, Math.min(GRID.rows - 1, Math.floor((y - GRID.y) / GRID.cell)));
  return { c, r };
}
