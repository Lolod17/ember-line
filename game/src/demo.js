// Staged scenes for ?state=title|play|over. Each scene plays the real rules forward from a fixed
// seed with scripted breaks (painted through the same paint functions a player's stroke uses),
// so a headless screenshot is a true, reproducible frame of the game.
import { edgeCell, inBounds, VILLAGE_BOX, tick } from './grid.js';
import { paintCell } from './paint.js';

/**
 * Paint a three-sided box of breaks around an edge ignition: `depth` cells inward and `depth`
 * cells either side along the edge. Returns the cells painted.
 */
export function boxAround(board, water, ignition, depth) {
  let painted = 0;
  for (let u = -depth; u <= depth; u += 1) {
    for (let v = 0; v <= depth; v += 1) {
      if (v !== depth && Math.abs(u) !== depth) continue;
      const { c, r } = edgeCell(ignition.side, ignition.u + u, v);
      if (inBounds(c, r) && paintCell(board, water, c, r)) painted += 1;
    }
  }
  return painted;
}

/** Paint a square ring of breaks `gap` cells outside the village's bounding box. */
export function ringVillage(board, water, gap) {
  const c0 = VILLAGE_BOX.c0 - gap;
  const c1 = VILLAGE_BOX.c1 + gap;
  const r0 = VILLAGE_BOX.r0 - gap;
  const r1 = VILLAGE_BOX.r1 + gap;
  for (let c = c0; c <= c1; c += 1) {
    paintCell(board, water, c, r0);
    paintCell(board, water, c, r1);
  }
  for (let r = r0 + 1; r < r1; r += 1) {
    paintCell(board, water, c0, r);
    paintCell(board, water, c1, r);
  }
}

/** Advance `n` fire ticks on a board with no events acted on (for scenery). */
export function burnFor(board, n) {
  for (let k = 0; k < n; k += 1) tick(board);
}

/**
 * Stage a scene. `api` is the main module's run control: { game, startRun, startWave, fireTick }.
 * The caller freezes the game afterwards.
 */
export function stageScene(name, seed, api) {
  const { game } = api;
  if (name === 'title') {
    game.state = 'title';
    return;
  }
  if (name === 'play') {
    api.startRun(seed);
    // The player boxes in the first fire early; the others run free toward the village.
    boxAround(game.board, game.water, game.board.ignitions[0], 5);
    for (let k = 0; k < 26 && game.state === 'play'; k += 1) api.fireTick();
    game.anim = 26 * 10;
    return;
  }
  if (name === 'over') {
    api.startRun(seed);
    // Wave 1: ring the village and let the forest outside burn out; the wave is held.
    ringVillage(game.board, game.water, 6);
    for (let k = 0; k < 4000 && game.state === 'play'; k += 1) api.fireTick();
    if (game.state !== 'cleared') return;
    // Wave 2: a hurried line in front of one fire only; another one reaches the houses.
    api.startWave(game.wave + 1);
    boxAround(game.board, game.water, game.board.ignitions[0], 4);
    for (let k = 0; k < 4000 && game.state === 'play'; k += 1) api.fireTick();
    // Let the flames take hold of the village for the picture.
    burnFor(game.board, 4);
    game.anim = 77;
  }
}

export const SCENES = ['title', 'play', 'over'];
