// Drawing the board: forest, fire, ash, breaks and the village, all with canvas primitives.
// Per-cell variation is a hash of the cell index; flicker is a hash of the animation tick,
// so the same state always draws the same picture.
import { GRID, COLORS, FIRE, VIEW } from './config.js';
import { cellHash } from './rng.js';
import { GROUND, TREE, FIRE_CELL, BURNT, BREAK, VILLAGE, isHolding } from './grid.js';

const S = GRID.cell;

/** A soft round glow sprite, drawn once, reused for every fire. */
function makeGlow(radius, color) {
  const c = document.createElement('canvas');
  c.width = c.height = radius * 2;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, color);
  grad.addColorStop(1, 'rgba(255,122,47,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, radius * 2, radius * 2);
  return c;
}

let glow = null;

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

/** A burning cell: scorched tree, licking flames with hot cores; embers while it smoulders. */
function drawFire(ctx, i, x, y, age, anim) {
  const phase = Math.floor(anim / 4) + i * 7;
  const f1 = cellHash(phase, 31);
  const f2 = cellHash(phase, 37);
  if (age < 0) {
    // Kindling: the fire has landed but not yet taken hold.
    drawTree(ctx, i, x, y, BURN_SHADES);
    const pulse = 0.5 + 0.5 * f1;
    ctx.fillStyle = COLORS.fire;
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    ctx.beginPath();
    ctx.arc(x + S / 2, y + S - 7, 3 + 3 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    return;
  }
  const life = 1 - age / FIRE.burnTicks; // 1 fresh .. 0 spent
  ctx.fillStyle = COLORS.burning;
  ctx.fillRect(x, y, S, S);
  drawTree(ctx, i, x, y, [shade(COLORS.burning, -0.12)]);
  const strength = Math.min(1, 0.35 + life * 1.1);
  const h = S * (0.5 + 0.45 * f1) * strength;
  const cx = x + S / 2 + (f2 - 0.5) * 6;
  const base = y + S - 2;
  ctx.fillStyle = COLORS.fire;
  triangle(ctx, cx, base, S * 0.62 * strength + 4, h + 6);
  triangle(ctx, cx - 6 + f1 * 4, base, S * 0.3, h * 0.7 + 3);
  triangle(ctx, cx + 6 - f2 * 4, base, S * 0.3, h * 0.6 + 3);
  ctx.fillStyle = COLORS.fireCore;
  triangle(ctx, cx, base, S * 0.28 * strength + 2, h * 0.55 + 2);
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

function drawHouse(ctx, i, x, y) {
  ctx.fillStyle = '#1F1C18';
  ctx.fillRect(x, y, S, S);
  const w = 14 + Math.floor(cellHash(i, 70) * 4);
  const hx = x + (S - w) / 2;
  const by = y + S - 4;
  ctx.fillStyle = COLORS.village;
  ctx.fillRect(hx, by - 9, w, 9);
  ctx.fillStyle = '#B9B1A2';
  ctx.beginPath();
  ctx.moveTo(hx - 2, by - 9);
  ctx.lineTo(hx + w / 2, by - 18);
  ctx.lineTo(hx + w + 2, by - 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(hx + 3, by - 6, 3, 3);
  ctx.fillStyle = '#4A4038';
  ctx.fillRect(hx + w - 7, by - 6, 3, 6);
}

/**
 * Draw the whole board. `opts.anim` is the animation tick, `opts.hover` an optional
 * {c, r, erase} brush highlight.
 */
export function drawBoard(ctx, board, opts) {
  if (!glow) glow = makeGlow(28, 'rgba(255,150,60,0.55)');
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
    if (t === TREE) drawTree(ctx, i, x, y, TREE_SHADES);
    else if (t === GROUND) drawGround(ctx, i, x, y);
    else if (t === BURNT) drawBurnt(ctx, i, x, y);
    else if (t === BREAK) drawBreak(ctx, i, x, y, isHolding(board, i), anim);
    else if (t === VILLAGE) drawHouse(ctx, i, x, y);
    else if (t === FIRE_CELL) drawFire(ctx, i, x, y, age[i], anim);
  }
  // Light from the flames spills over neighbouring cells.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < type.length; i += 1) {
    if (type[i] !== FIRE_CELL || age[i] < 0) continue;
    const c = i % GRID.cols;
    const r = (i - c) / GRID.cols;
    const life = 1 - age[i] / FIRE.burnTicks;
    ctx.globalAlpha = 0.25 + 0.3 * life * (0.7 + 0.3 * cellHash(Math.floor(anim / 5) + i, 3));
    ctx.drawImage(glow, GRID.x + c * S + S / 2 - 28, GRID.y + r * S + S / 2 - 28);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
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
