// EMBER LINE: boot, the fixed-timestep loop and the state machine.
// States: title -> play -> (cleared -> play ...) -> over -> play. `paused` holds play still.
// The game always boots into the title; every later state is reached by playing.
import {
  STEP, MAX_STEPS_PER_FRAME, MAX_FRAME, SCORE, COLORS, HOUSES, SHAKE,
  ignitionsFor, tpsFor, waterFor,
} from './config.js';
import { createRng, waveSeed, cellHash } from './rng.js';
import {
  createBoard, ignite, tick, countTrees, countHouses, fireIsOut, EVENT_CLEAR, EVENT_VILLAGE,
} from './grid.js';
import { createWater, strokeCells, cellAt, cellClamped } from './paint.js';
import { createInput, fitCanvas } from './input.js';
import { drawBoard } from './render.js';
import { drawHud, drawTitle, drawCleared, drawOver, drawPaused } from './hud.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

// ?seed=N fixes the run seed, for replaying a particular forest.
const seedParam = Number.parseInt(new URLSearchParams(window.location.search).get('seed') ?? '', 10);
const fixedSeed = Number.isInteger(seedParam) ? seedParam : null;

// Screen shake is skipped entirely for players who ask for reduced motion.
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const game = {
  state: 'title',
  paused: false,
  erase: false,
  runs: 0,
  seed: fixedSeed ?? 1,
  wave: 0,
  board: null,
  water: null,
  tps: 6,
  tickAcc: 0,
  anim: 0,
  banked: { trees: 0, waves: 0, water: 0 },
  last: null,
  stroke: null,
  titleBoard: null,
  titleTick: 0,
  shake: 0,        // simulation steps of screen shake left
  breached: false, // this wave's line has already been breached (shake once per wave)
};

function announce(message) {
  status.textContent = message;
}

function score() {
  const b = game.banked;
  return b.trees * SCORE.tree + b.waves * SCORE.wave + b.water * SCORE.water;
}

function startWave(n) {
  const s = waveSeed(game.seed, n);
  game.wave = n;
  game.board = createBoard(s);
  ignite(game.board, createRng(s ^ 0x5bd1e995), ignitionsFor(n));
  game.water = createWater(waterFor(n));
  game.tps = tpsFor(n);
  game.tickAcc = 0;
  game.stroke = null;
  game.paused = false;
  game.shake = 0;
  game.breached = false;
  game.state = 'play';
  announce(`Wave ${n}: ${game.board.ignitions.length} fires. Water ${game.water.budget}. Score ${score()}.`);
}

function startRun(seed) {
  game.runs += 1;
  game.seed = seed ?? fixedSeed ?? waveSeed(game.anim + 1, game.runs);
  game.banked = { trees: 0, waves: 0, water: 0 };
  game.last = null;
  startWave(1);
}

function fireTick() {
  const event = tick(game.board);
  if (game.state !== 'play') return;
  // First breach of the wave (see breachOf in grid.js for the exact condition): shake once.
  if (game.board.breach && !game.breached) {
    game.breached = true;
    if (!reducedMotion?.matches) game.shake = SHAKE.steps;
    if (game.board.breach === 'house') announce(`Fire is at the houses on wave ${game.wave}.`);
    else announce(`The fire is past your line on wave ${game.wave}.`);
  }
  if (event === EVENT_VILLAGE) {
    // Bank the water still on the bar, once, at the only transition into `over`.
    game.banked.water += game.water.left;
    game.state = 'over';
    game.stroke = null;
    announce(`The village burns on wave ${game.wave}. Final score ${score()}. Press R to start again.`);
  } else if (event === EVENT_CLEAR) {
    const trees = countTrees(game.board);
    const water = game.water.left;
    game.banked.trees += trees;
    game.banked.waves += 1;
    game.banked.water += water;
    game.last = { wave: game.wave, trees, water };
    game.state = 'cleared';
    game.stroke = null;
    announce(`Wave ${game.wave} held. ${trees} trees saved, ${water} water left. Score ${score()}. Press Space for the next wave.`);
  }
}

// The title's backdrop is a live forest: three fires burn in slowly from the edges, and a fresh
// forest replaces it once they are out. Nothing is staged; it is the rules running unattended.
function makeTitleBoard(n) {
  const s = waveSeed(game.seed, 1000 + n);
  const board = createBoard(s);
  ignite(board, createRng(s ^ 0x5bd1e995), 3);
  return board;
}

// --- input -----------------------------------------------------------------------------------

function advance() {
  if (game.state === 'title' || game.state === 'over') startRun();
  else if (game.state === 'cleared') startWave(game.wave + 1);
}

function handle(ev) {
  if (ev.type === 'key') {
    if (ev.action === 'advance') {
      if (game.state === 'play' && game.paused) game.paused = false;
      else advance();
    } else if (ev.action === 'erase') {
      game.erase = !game.erase;
    } else if (ev.action === 'restart') {
      startRun();
    } else if (ev.action === 'pause' && game.state === 'play') {
      game.paused = !game.paused;
      game.stroke = null;
      announce(game.paused ? 'Paused.' : `Wave ${game.wave} resumed.`);
    }
    return;
  }
  if (ev.type === 'down') {
    if (game.state !== 'play') {
      advance();
      return;
    }
    if (game.paused) return;
    const cell = cellAt(ev.x, ev.y);
    if (!cell) return;
    strokeCells(game.board, game.water, cell, cell, game.erase);
    game.stroke = cell;
  } else if (ev.type === 'move') {
    if (!game.stroke || game.state !== 'play' || game.paused) return;
    const cell = cellClamped(ev.x, ev.y);
    strokeCells(game.board, game.water, game.stroke, cell, game.erase);
    game.stroke = cell;
  } else if (ev.type === 'up') {
    game.stroke = null;
  }
}

// --- loop ------------------------------------------------------------------------------------

const TITLE_TICK_EVERY = 12; // simulation steps per title-backdrop fire tick (5 per second)

function step() {
  if (game.paused) return;
  game.anim += 1;
  if (game.shake > 0) game.shake -= 1;
  if (game.state === 'title') {
    if (game.anim % TITLE_TICK_EVERY === 0) {
      tick(game.titleBoard);
      if (fireIsOut(game.titleBoard)) {
        game.titleTick += 1;
        game.titleBoard = makeTitleBoard(game.titleTick);
      }
    }
    return;
  }
  game.tickAcc += game.tps * STEP;
  while (game.tickAcc >= 1) {
    game.tickAcc -= 1;
    if (game.state === 'play') fireTick();
    else tick(game.board); // after the wave ends the last flames keep burning, for show
  }
}

let viewport = fitCanvas(canvas);
const input = createInput(canvas, () => viewport);
window.addEventListener('resize', () => {
  viewport = fitCanvas(canvas);
  render();
});

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.ground;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = viewport.dpr * viewport.scale;
  ctx.setTransform(k, 0, 0, k, viewport.dpr * viewport.offsetX, viewport.dpr * viewport.offsetY);
  if (game.state === 'title') {
    drawBoard(ctx, game.titleBoard, { anim: game.anim });
    drawTitle(ctx, game.anim);
    return;
  }
  const p = input.pointer;
  const hoverCell = game.state === 'play' && !game.paused && p.inside ? cellAt(p.x, p.y) : null;
  // The board shakes; the HUD, drawn after it, stays put and covers any spill at the top.
  ctx.save();
  if (game.shake > 0) {
    const amp = SHAKE.amp * (game.shake / SHAKE.steps);
    ctx.translate((cellHash(game.shake, 91) * 2 - 1) * amp, (cellHash(game.shake, 97) * 2 - 1) * amp);
  }
  drawBoard(ctx, game.board, { anim: game.anim, hover: hoverCell && { ...hoverCell, erase: game.erase } });
  ctx.restore();
  drawHud(ctx, {
    wave: game.wave,
    water: game.water.left,
    budget: game.water.budget,
    trees: countTrees(game.board),
    houses: countHouses(game.board),
    housesTotal: HOUSES.length,
    erase: game.erase,
    score: score(),
  });
  if (game.state === 'cleared') {
    drawCleared(ctx, { ...game.last, total: score() });
  } else if (game.state === 'over') {
    const b = game.banked;
    drawOver(ctx, { wave: game.wave, trees: b.trees, waves: b.waves, water: b.water, total: score() });
  } else if (game.paused) {
    drawPaused(ctx);
  }
}

let last = null;
let acc = 0;
function frame(now) {
  if (last !== null) acc += Math.min(MAX_FRAME, (now - last) / 1000);
  last = now;
  for (const ev of input.drain()) handle(ev);
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
    step();
    acc -= STEP;
    steps += 1;
  }
  if (steps === MAX_STEPS_PER_FRAME) acc = 0; // capped catch-up: drop the rest
  render();
  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (game.state === 'play') game.paused = true;
  } else {
    last = null;
    acc = 0;
  }
});

// --- boot ------------------------------------------------------------------------------------

game.titleBoard = makeTitleBoard(0);
announce('EMBER LINE. Press Space or click to start.');

// A read-only view of what the screen shows, for automated play-testing. It returns copies and
// offers no way to change the game: every state change still has to come from input.
window.emberline = Object.freeze({
  snapshot() {
    const b = game.state === 'title' ? null : game.board;
    return {
      state: game.state,
      paused: game.paused,
      wave: game.wave,
      water: game.water ? game.water.left : 0,
      budget: game.water ? game.water.budget : 0,
      trees: b ? countTrees(b) : 0,
      houses: b ? countHouses(b) : HOUSES.length,
      score: score(),
      shake: game.shake,
      breached: game.breached,
      ignitions: b ? b.ignitions.map((g) => ({ ...g })) : [],
      cells: b ? Array.from(b.type) : [],
    };
  },
});
render();
requestAnimationFrame(frame);
