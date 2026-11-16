// Drawing the board: forest, fire, ash, breaks and the village, all with canvas primitives.
// Per-cell variation is a hash of the cell index; flicker is a hash of the animation tick,
// so the same state always draws the same picture.
import { GRID, COLORS, FIRE, VIEW, HOUSES, SMOKE_RANGE } from './config.js';
import { cellHash } from './rng.js';
import {
  GROUND, TREE, FIRE_CELL, BURNT, BREAK, VILLAGE_CELLS, VILLAGE_BOX, HOUSE_CELLS,
  isHolding, isFront, houseStanding,
} from './grid.js';

const S = GRID.cell;

/**
 * A round glow sprite, drawn once, reused for every fire. It is stepped (flat concentric rings)
 * rather than a smooth gradient: it reads as light spill, suits the flat art, and keeps frames
 * cheap to encode.
 */
function makeGlow(radius, color, steps = 4) {
  const c = document.createElement('canvas');
  c.width = c.height = radius * 2;
  const g = c.getContext('2d');
  g.fillStyle = color;
  for (let k = 0; k < steps; k += 1) {
    g.beginPath();
    g.arc(radius, radius, radius * (1 - k / steps), 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

let glow = null;
let warm = null;

/** Shift a #rrggbb colour lighter (k > 0) or darker (k < 0). */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(v + k * 255)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const TREE_SHADES = [-0.03, 0, 0.035].map((k) => shade(COLORS.tree, k));
const BURN_SHADES = [shade(COLORS.burning, 0.04)];

function triangle(ctx, cx, base, w, h) {
  ctx.beginPath();
  ctx.moveTo(cx, base - h);
  ctx.lineTo(cx + w / 2, base);
  ctx.lineTo(cx - w / 2, base);
  ctx.closePath();
  ctx.fill();
}

/** The tree in cell i at (x, y): one or two triangles, size and offset from the cell's hash. */
function drawTree(ctx, i, x, y, palette) {
  // Variation is quantised (3 heights, 3 offsets, 2 widths) so the forest reads as varied
  // without per-pixel noise.
  const a = Math.floor(cellHash(i, 1) * 3);
  const b = Math.floor(cellHash(i, 2) * 3);
  const h = 15 + a * 3;
  const w = h * (cellHash(i, 6) < 0.5 ? 0.64 : 0.74);
  const cx = x + 13 + (b - 1) * 2;
  const base = y + S - 3;
  ctx.fillStyle = palette[Math.floor(cellHash(i, 3) * palette.length)];
  triangle(ctx, cx, base, Math.round(w), h);
  if (cellHash(i, 4) < 0.3) {
    ctx.fillStyle = palette[Math.floor(cellHash(i, 5) * palette.length)];
    triangle(ctx, x + (a < 1 ? 20 : 6), y + S - 2, 6, 9);
  }
}

function drawGround(ctx, i, x, y) {
  ctx.fillStyle = '#1C1916';
  for (let k = 0; k < 3; k += 1) {
    const px = x + 4 + cellHash(i, 10 + k) * (S - 8);
    const py = y + 4 + cellHash(i, 20 + k) * (S - 8);
    ctx.fillRect(px, py, 3, 2);
  }
}

function drawBurnt(ctx, i, x, y) {
  ctx.fillStyle = COLORS.burnt;
  ctx.fillRect(x, y, S, S);
  ctx.strokeStyle = '#2A221C';
  ctx.lineWidth = 2;
  const cx = x + S / 2 + (cellHash(i, 2) - 0.5) * 5;
  ctx.beginPath();
  ctx.moveTo(cx, y + S - 4);
  ctx.lineTo(cx + (cellHash(i, 6) - 0.5) * 4, y + 9 + cellHash(i, 1) * 5);
  ctx.stroke();
}

// Fire animates on a 3-frame cycle from the tick counter: flame height and core brightness
// step through these, offset per cell so neighbouring flames do not move in lockstep.
const FLAME_HEIGHT = [1, 0.7, 0.86];
const FLAME_CORE = ['#FFD24A', '#FFF3B8', '#FFAE2A'];
const FLAME_LEAN = [0, 2, -2];
const GLOW_ALPHA = [0.6, 0.8, 1];

function flameFrame(i, anim) {
  return (Math.floor(anim / 6) + (i % 3)) % 3;
}

/**
 * A burning cell: scorched tree, licking flames with hot cores; embers while it smoulders.
 * `bare` draws the flames alone (over a burning house).
 */
function drawFire(ctx, i, x, y, age, anim, bare = false) {
  const frame = flameFrame(i, anim);
  const pulse = frame === 1 ? 1 : frame === 2 ? 0.55 : 0.2;
  if (age < 0) {
    // Kindling: the fire has landed but not yet taken hold.
    if (!bare) drawTree(ctx, i, x, y, BURN_SHADES);
    ctx.fillStyle = COLORS.fire;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.beginPath();
    ctx.arc(x + S / 2, y + S - 7, 3 + 3 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const life = 1 - age / FIRE.burnTicks; // 1 fresh .. 0 spent
  if (!bare) {
    ctx.fillStyle = COLORS.burning;
    ctx.fillRect(x, y, S, S);
    drawTree(ctx, i, x, y, [shade(COLORS.burning, -0.12)]);
  }
  const strength = Math.min(1, 0.35 + life * 1.1);
  const h = S * 0.95 * FLAME_HEIGHT[frame] * strength;
  const cx = x + S / 2 + (cellHash(i, 37) - 0.5) * 4 + FLAME_LEAN[frame];
  const base = y + S - 2;
  ctx.fillStyle = COLORS.fire;
  triangle(ctx, cx, base, S * 0.62 * strength + 4, h + 6);
  triangle(ctx, cx - 6, base, S * 0.3, h * FLAME_HEIGHT[(frame + 1) % 3] * 0.7 + 3);
  triangle(ctx, cx + 6, base, S * 0.3, h * FLAME_HEIGHT[(frame + 2) % 3] * 0.6 + 3);
  ctx.fillStyle = FLAME_CORE[frame];
  triangle(ctx, cx, base, S * 0.28 * strength + 2, h * 0.55 + 2);
}

/** The advancing front: a rim that brightens and fades about once a second. */
function drawFrontRim(ctx, x, y, anim) {
  const beat = 0.5 + 0.5 * Math.sin((anim / 60) * Math.PI * 2);
  ctx.strokeStyle = COLORS.rim;
  ctx.globalAlpha = 0.25 + 0.6 * beat;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, S - 2, S - 2);
  ctx.globalAlpha = 1;
}

function drawBreak(ctx, i, x, y, holding, anim) {
  ctx.fillStyle = COLORS.brk;
  ctx.fillRect(x, y, S, S);
  ctx.strokeStyle = '#5C5952';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < 3; k += 1) {
    const off = 5 + k * 8 + Math.floor(cellHash(i, 40 + k) * 3);
    ctx.moveTo(x + 2, y + off);
    ctx.lineTo(x + S - 2, y + off + (cellHash(i, 50 + k) - 0.5) * 3);
  }
  ctx.stroke();
  if (holding) {
    ctx.strokeStyle = COLORS.accent;
    ctx.globalAlpha = 0.45 + 0.35 * cellHash(Math.floor(anim / 6) + i, 61);
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, S - 2, S - 2);
    ctx.globalAlpha = 1;
  }
}

const VILLAGE_SET = new Set(VILLAGE_CELLS);

/** Pixel placement of each house: centred on the cells it owns, standing on their bottom edge. */
const HOUSE_SPOTS = HOUSES.map((house, k) => {
  const cells = HOUSE_CELLS[k];
  let sx = 0;
  let maxR = 0;
  for (const i of cells) {
    const c = i % GRID.cols;
    sx += c;
    maxR = Math.max(maxR, (i - c) / GRID.cols);
  }
  return {
    x: Math.round(GRID.x + (sx / cells.length + 0.5) * S),
    base: GRID.y + (maxR + 1) * S - 3,
    w: house.w,
    h: house.h,
    roof: Math.round(house.w * 0.48),
    chimney: k % 2 === 0 ? 1 : -1,
  };
});

/** The village's footprint drawn as a packed-earth yard. */
function drawYard(ctx, x, y) {
  ctx.fillStyle = '#211D19';
  ctx.fillRect(x, y, S, S);
}

function houseShape(ctx, p) {
  const l = p.x - p.w / 2;
  const top = p.base - p.h;
  ctx.beginPath();
  ctx.moveTo(l, p.base);
  ctx.lineTo(l, top);
  ctx.lineTo(l - 2, top);
  ctx.lineTo(p.x, top - p.roof);
  ctx.lineTo(l + p.w + 2, top);
  ctx.lineTo(l + p.w, top);
  ctx.lineTo(l + p.w, p.base);
  ctx.closePath();
}

/** One house: a pale silhouette with a pitched roof, a chimney and one warm window; once fire
 * has taken it, a charred shell with embers. */
function drawHouse(ctx, p, k, standing, anim) {
  const top = p.base - p.h;
  const chx = p.x + p.chimney * p.w * 0.28 - 2;
  const chTop = top - p.roof * 0.55 - 5;
  ctx.fillStyle = standing ? COLORS.village : COLORS.burnt;
  ctx.fillRect(chx, chTop, 4, p.roof);
  houseShape(ctx, p);
  ctx.fill();
  ctx.strokeStyle = standing ? '#9C9384' : '#4A3426';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (standing) {
    // The roof line, so the pitch reads against the wall.
    ctx.strokeStyle = '#B4AB9B';
    ctx.beginPath();
    ctx.moveTo(p.x - p.w / 2, top + 0.5);
    ctx.lineTo(p.x + p.w / 2, top + 0.5);
    ctx.stroke();
    const wx = p.x - p.chimney * p.w * 0.22 - 2.5;
    ctx.fillStyle = '#FFC45E';
    ctx.fillRect(wx, top + 3, 5, 5);
    ctx.fillStyle = '#4A4038';
    ctx.fillRect(p.x + p.chimney * p.w * 0.18 - 1.5, p.base - 6, 4, 6);
    return;
  }
  // Embers glowing in the shell and drifting up off it.
  for (let e = 0; e < 4; e += 1) {
    const t = ((anim + e * 23 + k * 11) % 50) / 50;
    const ex = p.x + (cellHash(k * 7 + e, 81) - 0.5) * p.w + Math.sin(t * 6 + e) * 2;
    const ey = p.base - 3 - t * (p.h + p.roof + 10);
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = e % 2 ? COLORS.fire : COLORS.fireCore;
    ctx.fillRect(ex, ey, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = COLORS.fire;
  for (let e = 0; e < 3; e += 1) {
    if (cellHash(Math.floor(anim / 8) + e * 5 + k, 83) < 0.35) continue;
    ctx.fillRect(p.x + (e - 1) * p.w * 0.3 - 1, p.base - 2 - e % 2 * 3, 3, 2);
  }
}

/** One smoke column: puffs rising from (x, y), drifting sideways and fading. */
function smokeColumn(ctx, x, y, anim, seed, height) {
  for (let k = 0; k < 6; k += 1) {
    const t = ((anim * 0.7 + k * 15 + seed * 29) % 90) / 90;
    const px = x + Math.sin(t * 5 + seed) * 3 + t * 10;
    const py = y - t * height;
    ctx.globalAlpha = 0.5 * (1 - t) * Math.min(1, t * 6);
    ctx.fillStyle = '#B4AA9E';
    ctx.beginPath();
    ctx.arc(px, py, 2 + t * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const VB = {
  x0: GRID.x + VILLAGE_BOX.c0 * S,
  x1: GRID.x + (VILLAGE_BOX.c1 + 1) * S,
  y0: GRID.y + VILLAGE_BOX.r0 * S,
  y1: GRID.y + (VILLAGE_BOX.r1 + 1) * S,
};
const VCX = (VILLAGE_BOX.c0 + VILLAGE_BOX.c1) / 2;
const VCY = (VILLAGE_BOX.r0 + VILLAGE_BOX.r1) / 2;

/** Which sides of the village have fire within SMOKE_RANGE cells of a standing house. */
function smokeSides(board, standing) {
  const live = [];
  HOUSE_CELLS.forEach((cells, k) => {
    if (standing[k]) for (const i of cells) live.push([i % GRID.cols, Math.floor(i / GRID.cols)]);
  });
  const sides = { top: false, right: false, bottom: false, left: false };
  if (!live.length) return sides;
  const { type } = board;
  for (let i = 0; i < type.length; i += 1) {
    if (type[i] !== FIRE_CELL || VILLAGE_SET.has(i)) continue;
    const c = i % GRID.cols;
    const r = (i - c) / GRID.cols;
    if (!live.some(([hc, hr]) => Math.abs(hc - c) + Math.abs(hr - r) <= SMOKE_RANGE)) continue;
    const dx = c - VCX;
    const dy = r - VCY;
    if (Math.abs(dx) > Math.abs(dy)) sides[dx > 0 ? 'right' : 'left'] = true;
    else sides[dy > 0 ? 'bottom' : 'top'] = true;
  }
  return sides;
}

/** The village: warm light under standing houses, the houses, flames on burning ones, smoke. */
function drawVillage(ctx, board, anim) {
  const standing = houseStanding(board);
  ctx.globalCompositeOperation = 'lighter';
  HOUSE_SPOTS.forEach((p, k) => {
    if (!standing[k]) return;
    ctx.globalAlpha = 0.5;
    ctx.drawImage(warm, p.x - 30, p.base - 34, 60, 50);
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  HOUSE_SPOTS.forEach((p, k) => drawHouse(ctx, p, k, standing[k], anim));
  for (const i of VILLAGE_CELLS) {
    if (board.type[i] !== FIRE_CELL) continue;
    const c = i % GRID.cols;
    const r = (i - c) / GRID.cols;
    drawFire(ctx, i, GRID.x + c * S, GRID.y + r * S, board.age[i], anim, true);
  }
  return standing;
}

/** Smoke over everything: from each side under threat, and from every lost house. */
function drawSmoke(ctx, board, standing, anim) {
  const sides = smokeSides(board, standing);
  const span = (a, b, k) => a + ((b - a) * (k + 1)) / 4;
  for (let k = 0; k < 3; k += 1) {
    if (sides.top) smokeColumn(ctx, span(VB.x0, VB.x1, k), VB.y0 - 4, anim, k, 64);
    if (sides.bottom) smokeColumn(ctx, span(VB.x0, VB.x1, k), VB.y1 - 4, anim, k + 3, 64);
    if (sides.left) smokeColumn(ctx, VB.x0 - 2, span(VB.y0, VB.y1, k), anim, k + 6, 64);
    if (sides.right) smokeColumn(ctx, VB.x1 + 2, span(VB.y0, VB.y1, k), anim, k + 9, 64);
  }
  HOUSE_SPOTS.forEach((p, k) => {
    if (!standing[k]) smokeColumn(ctx, p.x, p.base - p.h - 4, anim, k + 12, 80);
  });
}

/**
 * Draw the whole board. `opts.anim` is the animation tick, `opts.hover` an optional
 * {c, r, erase} brush highlight.
 */
export function drawBoard(ctx, board, opts) {
  if (!glow) glow = makeGlow(28, 'rgba(255,140,50,0.085)');
  if (!warm) warm = makeGlow(30, 'rgba(255,176,80,0.12)');
  const { type, age } = board;
  const anim = opts.anim;
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(GRID.x, GRID.y, GRID.cols * S, GRID.rows * S);
  for (let i = 0; i < type.length; i += 1) {
    const c = i % GRID.cols;
    const r = (i - c) / GRID.cols;
    const x = GRID.x + c * S;
    const y = GRID.y + r * S;
    const t = type[i];
    if (VILLAGE_SET.has(i)) drawYard(ctx, x, y);
    else if (t === TREE) drawTree(ctx, i, x, y, TREE_SHADES);
    else if (t === GROUND) drawGround(ctx, i, x, y);
    else if (t === BURNT) drawBurnt(ctx, i, x, y);
    else if (t === BREAK) drawBreak(ctx, i, x, y, isHolding(board, i), anim);
    else if (t === FIRE_CELL) drawFire(ctx, i, x, y, age[i], anim);
  }
  const standing = drawVillage(ctx, board, anim);
  // Light from the flames spills over neighbouring cells.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < type.length; i += 1) {
    if (type[i] !== FIRE_CELL || age[i] < 0) continue;
    const c = i % GRID.cols;
    const r = (i - c) / GRID.cols;
    // Three glow levels, stepping with the flame's 3-frame cycle; spent fires glow less.
    const level = (age[i] < FIRE.burnTicks / 2 ? 2 : 1) - (flameFrame(i, anim) === 1 ? 0 : 1);
    ctx.globalAlpha = GLOW_ALPHA[Math.max(0, level)];
    ctx.drawImage(glow, GRID.x + c * S + S / 2 - 28, GRID.y + r * S + S / 2 - 28);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  for (let i = 0; i < type.length; i += 1) {
    if (!isFront(board, i)) continue;
    const c = i % GRID.cols;
    drawFrontRim(ctx, GRID.x + c * S, GRID.y + ((i - c) / GRID.cols) * S, anim);
  }
  drawSmoke(ctx, board, standing, anim);
  ctx.strokeStyle = '#2C2824';
  ctx.lineWidth = 2;
  ctx.strokeRect(GRID.x - 1, GRID.y - 1, GRID.cols * S + 2, GRID.rows * S + 2);
  if (opts.hover) {
    ctx.strokeStyle = opts.hover.erase ? '#E0603A' : COLORS.hud;
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2;
    ctx.strokeRect(GRID.x + opts.hover.c * S + 1, GRID.y + opts.hover.r * S + 1, S - 2, S - 2);
    ctx.globalAlpha = 1;
  }
}

/** Darken everything behind an overlay. */
export function veil(ctx, alpha) {
  ctx.fillStyle = `rgba(18,16,14,${alpha})`;
  ctx.fillRect(0, 0, VIEW.width, VIEW.height);
}
