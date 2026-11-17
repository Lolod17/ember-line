// Text and panels: the HUD band, the title card, the wave-cleared, game-over and win
// breakdowns, and the pause card. System fonts only.
import { VIEW, GRID, COLORS, FONT, SCORE, WIN_WAVES } from './config.js';
import { veil } from './render.js';

const W = VIEW.width;
const DIM = 'rgba(242,237,227,0.55)';

function text(ctx, str, x, y, size, color, align = 'left', weight = 600, spacing = 0) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
  ctx.fillText(str, x, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}

/** The wordmark: EMBER LINE with a break-coloured stroke and a flame riding on it. */
function wordmark(ctx, cx, y, size, anim) {
  text(ctx, 'EMBER LINE', cx, y, size, COLORS.hud, 'center', 800, size * 0.12);
  ctx.font = `800 ${size}px ${FONT}`;
  const half = Math.min(ctx.measureText('EMBER LINE').width * 0.62, 420);
  const ly = y + size * 0.28;
  ctx.fillStyle = COLORS.brk;
  ctx.fillRect(cx - half, ly, half * 2, Math.max(4, size * 0.07));
  const flick = (Math.floor(anim / 5) % 3) * 0.08;
  const fx = cx - half + half * 0.18;
  ctx.fillStyle = COLORS.fire;
  ctx.beginPath();
  ctx.moveTo(fx - size * 0.16, ly);
  ctx.quadraticCurveTo(fx - size * 0.1, ly - size * (0.4 + flick), fx, ly - size * (0.55 + flick));
  ctx.quadraticCurveTo(fx + size * 0.12, ly - size * 0.3, fx + size * 0.16, ly);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COLORS.fireCore;
  ctx.beginPath();
  ctx.moveTo(fx - size * 0.07, ly);
  ctx.quadraticCurveTo(fx - size * 0.03, ly - size * 0.22, fx, ly - size * (0.3 + flick));
  ctx.quadraticCurveTo(fx + size * 0.06, ly - size * 0.15, fx + size * 0.07, ly);
  ctx.closePath();
  ctx.fill();
}

/** The HUD band across the top and the hint line below the board. */
export function drawHud(ctx, h) {
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, W, GRID.y - 4);
  text(ctx, 'EMBER LINE', GRID.x, 46, 22, COLORS.hud, 'left', 800, 3);
  text(ctx, 'WAVE', 360, 30, 12, DIM, 'left', 700, 2);
  text(ctx, String(h.wave), 360, 58, 28, COLORS.hud, 'left', 800);
  ctx.font = `800 28px ${FONT}`;
  text(ctx, `/${h.waves}`, 362 + ctx.measureText(String(h.wave)).width, 58, 15, DIM, 'left', 700);

  // Water: a bar that drains as breaks are painted.
  const bx = 440;
  const bw = 250;
  text(ctx, 'WATER', bx, 30, 12, DIM, 'left', 700, 2);
  text(ctx, `${h.water} / ${h.budget}`, bx + bw, 30, 12, COLORS.hud, 'right', 700);
  ctx.fillStyle = '#26221E';
  ctx.fillRect(bx, 40, bw, 14);
  const frac = h.budget > 0 ? h.water / h.budget : 0;
  ctx.fillStyle = frac > 0.25 ? '#6FA8C8' : '#C8705A';
  ctx.fillRect(bx, 40, Math.round(bw * frac), 14);
  ctx.strokeStyle = '#3A352F';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, 40.5, bw - 1, 13);

  text(ctx, 'TREES', 720, 30, 12, DIM, 'left', 700, 2);
  text(ctx, String(h.trees), 720, 58, 24, COLORS.hud, 'left', 700);

  // Houses standing, counted by the same test that ends the run (fire on a village cell).
  const houseColor = h.houses === 0 ? COLORS.danger : h.houses * 2 < h.housesTotal ? COLORS.accent : COLORS.hud;
  text(ctx, 'HOUSES', 806, 30, 12, DIM, 'left', 700, 2);
  text(ctx, `${h.houses}/${h.housesTotal}`, 806, 58, 24, houseColor, 'left', 700);

  const chipX = 916;
  ctx.fillStyle = h.erase ? '#5A2A1E' : '#2A2722';
  ctx.fillRect(chipX, 34, 84, 26);
  text(ctx, h.erase ? 'ERASE' : 'PAINT', chipX + 42, 52, 13, h.erase ? '#FFB89A' : COLORS.hud, 'center', 800, 2);
  // Sound state, always shown: off by default, M toggles it.
  text(ctx, h.sound ? 'M · SOUND ON' : 'M · SOUND OFF', chipX, 26, 10, h.sound ? COLORS.accent : DIM, 'left', 700, 1);

  text(ctx, 'SCORE', GRID.x + GRID.cols * GRID.cell, 30, 12, DIM, 'right', 700, 2);
  text(ctx, h.score.toLocaleString('en-US'), GRID.x + GRID.cols * GRID.cell, 60, 30, COLORS.accent, 'right', 800);

  const hint = 'drag: paint firebreak (not in the fields)   ·   X: erase   ·   P: pause   ·   M: sound   ·   R: restart run';
  text(ctx, hint, W / 2, VIEW.height - 6, 13, DIM, 'center', 500);
}

export function drawTitle(ctx, anim) {
  veil(ctx, 0.62);
  ctx.fillStyle = 'rgba(18,16,14,0.7)';
  ctx.fillRect(0, 200, W, 330);
  wordmark(ctx, W / 2, 330, 112, anim);
  text(ctx, 'Fire spreads tick by tick. Paint firebreaks with a fixed ration of water — keep it from the village.',
    W / 2, 410, 20, COLORS.hud, 'center', 500);
  text(ctx, 'Hold the line for 8 waves. The fields around the houses cannot be dug.',
    W / 2, 436, 16, DIM, 'center', 500);
  ctx.globalAlpha = 0.6 + 0.4 * Math.abs(Math.sin(anim / 30));
  text(ctx, 'press space to start', W / 2, 478, 26, COLORS.accent, 'center', 800, 4);
  ctx.globalAlpha = 1;
  text(ctx, 'drag to paint  ·  X erase  ·  Space next wave  ·  P pause  ·  M sound  ·  R restart', W / 2, 512, 14, DIM, 'center', 500);
}

function panel(ctx, w, h) {
  const x = (W - w) / 2;
  const y = (VIEW.height - h) / 2 + 10;
  ctx.fillStyle = 'rgba(22,19,16,0.94)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#3A342D';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
  ctx.fillStyle = COLORS.fire;
  ctx.fillRect(x, y, w, 4);
  return { x, y };
}

function breakdownRows(ctx, x, y, w, rows) {
  rows.forEach((row, k) => {
    const ry = y + k * 40;
    text(ctx, row.label, x, ry, 20, COLORS.hud, 'left', 500);
    text(ctx, `${row.count.toLocaleString('en-US')} × ${row.each}`, x + w * 0.58, ry, 20, DIM, 'right', 500);
    text(ctx, row.total.toLocaleString('en-US'), x + w, ry, 22, COLORS.accent, 'right', 700);
  });
  ctx.fillStyle = '#3A342D';
  ctx.fillRect(x, y + rows.length * 40 - 22, w, 2);
}

function rowsFor(trees, waves, water) {
  return [
    { label: 'Trees saved', count: trees, each: SCORE.tree, total: trees * SCORE.tree },
    { label: 'Waves survived', count: waves, each: SCORE.wave, total: waves * SCORE.wave },
    { label: 'Water left', count: water, each: SCORE.water, total: water * SCORE.water },
  ];
}

/** Wave cleared: this wave's breakdown and the run total. */
export function drawCleared(ctx, s) {
  veil(ctx, 0.45);
  const { x, y } = panel(ctx, 560, 360);
  text(ctx, `WAVE ${s.wave} HELD`, W / 2, y + 62, 40, COLORS.hud, 'center', 800, 4);
  const left = s.waves - s.wave;
  text(ctx, `the fire is out — ${left === 1 ? 'one wave' : `${left} waves`} to go`, W / 2, y + 94, 16, DIM, 'center', 500);
  breakdownRows(ctx, x + 50, y + 150, 460, rowsFor(s.trees, 1, s.water));
  text(ctx, 'RUN SCORE', x + 50, y + 290, 16, DIM, 'left', 700, 2);
  text(ctx, s.total.toLocaleString('en-US'), x + 510, y + 292, 30, COLORS.accent, 'right', 800);
  const next = left === 1 ? 'the last wave' : 'next wave';
  text(ctx, `Space or click: ${next}   ·   R: restart run`, W / 2, y + 336, 15, COLORS.hud, 'center', 600);
}

/**
 * Game over: a narrow, see-through card at the right of the board so the burning village at the
 * centre stays in view over a dimmed field that keeps animating behind it.
 */
export function drawOver(ctx, s) {
  veil(ctx, 0.4);

  const w = 330;
  const h = 392;
  const x = GRID.x + GRID.cols * GRID.cell - w - 24;
  const y = (VIEW.height - h) / 2 + 14;
  ctx.fillStyle = 'rgba(20,17,14,0.86)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.fire;
  ctx.fillRect(x, y, 4, h);
  const lx = x + 30;
  text(ctx, 'THE VILLAGE', lx, y + 54, 32, COLORS.fire, 'left', 800, 3);
  text(ctx, 'BURNS', lx, y + 90, 32, COLORS.fire, 'left', 800, 3);
  text(ctx, `the line broke on wave ${s.wave}`, lx, y + 118, 15, DIM, 'left', 500);
  const lines = [
    [`${s.trees.toLocaleString('en-US')} trees saved`, s.trees * SCORE.tree],
    [`${s.waves} ${s.waves === 1 ? 'wave' : 'waves'} survived`, s.waves * SCORE.wave],
    [`${s.water.toLocaleString('en-US')} water banked`, s.water * SCORE.water],
  ];
  lines.forEach(([label, pts], k) => {
    const ly = y + 160 + k * 30;
    text(ctx, label, lx, ly, 18, COLORS.hud, 'left', 500);
    text(ctx, `+${pts.toLocaleString('en-US')}`, x + w - 30, ly, 16, DIM, 'right', 600);
  });
  text(ctx, 'FINAL SCORE', lx, y + 270, 13, DIM, 'left', 700, 2);
  text(ctx, s.total.toLocaleString('en-US'), lx, y + 312, 44, COLORS.accent, 'left', 800);
  text(ctx, 'R, Space or click: new run', lx, y + 360, 15, COLORS.hud, 'left', 700, 1);
}

/**
 * The run is won: the game-over card's twin, in gold. Same place, same see-through card over
 * the live field, so the village that held stays in view, glowing, beside it.
 */
export function drawWon(ctx, s) {
  veil(ctx, 0.3);

  const w = 330;
  const h = 432;
  const x = GRID.x + GRID.cols * GRID.cell - w - 24;
  const y = (VIEW.height - h) / 2 + 14;
  ctx.fillStyle = 'rgba(20,17,14,0.86)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = COLORS.accent;
  ctx.fillRect(x, y, 4, h);
  const lx = x + 30;
  // The title glows: a soft warm halo that breathes with the village's lights.
  ctx.save();
  ctx.shadowColor = 'rgba(255,176,58,0.55)';
  ctx.shadowBlur = 14 + 6 * Math.sin((s.anim / 90) * Math.PI * 2);
  text(ctx, 'THE LINE', lx, y + 54, 34, COLORS.accent, 'left', 800, 3);
  text(ctx, 'HELD', lx, y + 92, 34, COLORS.accent, 'left', 800, 3);
  ctx.restore();
  text(ctx, `all ${s.waves} waves survived — the village stands`, lx, y + 120, 15, DIM, 'left', 500);
  // One pip per wave held.
  for (let k = 0; k < s.waves; k += 1) {
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(lx + k * 34, y + 138, 26, 6);
  }
  const lines = [
    [`${s.trees.toLocaleString('en-US')} trees saved`, s.trees * SCORE.tree],
    [`${s.waves} waves survived`, s.waves * SCORE.wave],
    [`${s.water.toLocaleString('en-US')} water banked`, s.water * SCORE.water],
  ];
  lines.forEach(([label, pts], k) => {
    const ly = y + 188 + k * 30;
    text(ctx, label, lx, ly, 18, COLORS.hud, 'left', 500);
    text(ctx, `+${pts.toLocaleString('en-US')}`, x + w - 30, ly, 16, DIM, 'right', 600);
  });
  // Every wave was completed, so the bank is exactly the leftovers of WIN_WAVES waves.
  text(ctx, `across ${WIN_WAVES} waves`, lx, y + 188 + 2 * 30 + 18, 12, DIM, 'left', 500);
  text(ctx, 'FINAL SCORE', lx, y + 298, 13, DIM, 'left', 700, 2);
  text(ctx, s.total.toLocaleString('en-US'), lx, y + 346, 50, COLORS.accent, 'left', 800);
  text(ctx, 'R, Space or click: new run', lx, y + 398, 15, COLORS.hud, 'left', 700, 1);
}

export function drawPaused(ctx) {
  veil(ctx, 0.4);
  panel(ctx, 380, 140);
  text(ctx, 'PAUSED', W / 2, VIEW.height / 2 + 14, 38, COLORS.hud, 'center', 800, 6);
  text(ctx, 'P to resume', W / 2, VIEW.height / 2 + 48, 15, DIM, 'center', 500);
}
