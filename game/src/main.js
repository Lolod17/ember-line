// EMBER LINE: boot, the fixed-timestep loop and the state machine.
// States: title -> play -> (cleared -> play ...) -> over | won -> play. `paused` holds play still.
// Clearing wave WIN_WAVES goes to `won`, never to a wave WIN_WAVES + 1.
// The game always boots into the title; every later state is reached by playing.
import {
  GRID, STEP, MAX_STEPS_PER_FRAME, MAX_FRAME, SCORE, COLORS, HOUSES, SHAKE, SHAKE_TOUCH, DUST, WIN_WAVES,
  rampFor, waterFor, tickStepsFor,
} from './config.js';
import { createRng, waveSeed, cellHash } from './rng.js';
import {
  createBoard, ignite, tick, countTrees, countHouses, fireIsOut, EVENT_CLEAR, EVENT_VILLAGE,
} from './grid.js';
import { createWater, strokeCells, cellAt, cellClamped } from './paint.js';
import { createInput, fitCanvas } from './input.js';
import { drawBoard, drawDust } from './render.js';
import { drawHud, drawTitle, drawCleared, drawOver, drawWon, drawPaused } from './hud.js';
import { createAudio } from './audio.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');

// ?seed=N fixes the run seed, for replaying a particular forest.
const seedParam = Number.parseInt(new URLSearchParams(window.location.search).get('seed') ?? '', 10);
const fixedSeed = Number.isInteger(seedParam) ? seedParam : null;

// Screen shake is skipped entirely for players who ask for reduced motion.
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
const sound = createAudio();

const game = {
  state: 'title',
  paused: false,
  erase: false,
  runs: 0,
  seed: fixedSeed ?? 1,
  wave: 0,
  board: null,
  water: null,
  tickSteps: 12,   // simulation steps per fire tick on this wave
  fireClock: 0,    // steps since the last fire tick
  anim: 0,
  banked: { trees: 0, waves: 0, water: 0 },
  last: null,
  stroke: null,
  strokePainted: [], // cells newly painted by the stroke in progress
  dust: [],          // dust bursts: { born, motes: [{ x, y, vx, vy, shade }] }
  titleBoard: null,
  titleTick: 0,
  shake: 0,        // simulation steps of screen shake left
  shakeKind: SHAKE, // which shake is running (SHAKE or SHAKE_TOUCH)
  lastTouch: -1e9, // anim tick of the last line-touch shake, for its cooldown
  breached: false, // fire has reached the houses' doorsteps this wave (big shake once per wave)
  lineBroken: false, // fire has got round a painted line this wave (announced once per wave)
  flanked: new Set(), // break cells fire has reached the far side of, this wave
  lineTouches: 0,  // line-touch events this wave (for play-testing)
};

function announce(message) {
  status.textContent = message;
}

function score() {
  const b = game.banked;
  return b.trees * SCORE.tree + b.waves * SCORE.wave + b.water * SCORE.water;
}

function startWave(n) {
  if (n > WIN_WAVES) return; // there is no wave after the last one: the run is won
  const s = waveSeed(game.seed, n);
  const ramp = rampFor(n);
  game.wave = n;
  game.board = createBoard(s);
  ignite(game.board, createRng(s ^ 0x5bd1e995), ramp.edge, ramp.inner);
  game.water = createWater(waterFor(n));
  game.tickSteps = tickStepsFor(n);
  game.fireClock = 0;
  game.stroke = null;
  game.strokePainted = [];
  game.dust = [];
  game.paused = false;
  game.shake = 0;
  game.breached = false;
  game.lineBroken = false;
  game.flanked = new Set();
  game.lineTouches = 0;
  game.state = 'play';
  const inland = game.board.ignitions.filter((g) => g.inner).length;
  announce(`Wave ${n} of ${WIN_WAVES}: ${game.board.ignitions.length} fires${inland ? `, ${inland} inland` : ''}. Water ${game.water.budget}. Score ${score()}.`);
}

function shake(kind) {
  if (reducedMotion?.matches) return;
  // A touch never cuts short a stronger shake already running.
  if (kind === SHAKE_TOUCH && game.shake > 0 && game.shakeKind === SHAKE) return;
  game.shakeKind = kind;
  game.shake = kind.steps;
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
  // Fire on the far side of a painted break (see breachOf in grid.js): the line has stopped
  // working there. A soft shake, rate-limited, for each newly flanked stretch of break.
  const fresh = game.board.flanked.filter((i) => !game.flanked.has(i));
  for (const i of fresh) game.flanked.add(i);
  if (fresh.length && game.anim - game.lastTouch >= SHAKE_TOUCH.cooldown) {
    game.lastTouch = game.anim;
    game.lineTouches += 1;
    shake(SHAKE_TOUCH);
    sound.play('touch');
    if (!game.lineBroken && game.board.breach !== 'house') {
      game.lineBroken = true;
      announce(`The fire is past your line on wave ${game.wave}.`);
    }
  }
  // Fire at the houses' doorsteps: the full shake, once per wave.
  if (game.board.breach === 'house' && !game.breached) {
    game.breached = true;
    shake(SHAKE);
    sound.play('breach');
    announce(`Fire is at the houses on wave ${game.wave}.`);
  }
  if (event === EVENT_VILLAGE) {
    // Bank the water still on the bar, once, at the only transition into `over`.
    game.banked.water += game.water.left;
    game.state = 'over';
    endStroke();
    sound.play('lost');
    announce(`The village burns on wave ${game.wave}. Final score ${score()}. Press R to start again.`);
  } else if (event === EVENT_CLEAR) {
    const trees = countTrees(game.board);
    const water = game.water.left;
    game.banked.trees += trees;
    game.banked.waves += 1;
    game.banked.water += water;
    game.last = { wave: game.wave, trees, water };
    endStroke();
    if (game.wave >= WIN_WAVES) {
      game.state = 'won';
      sound.play('won');
      const b = game.banked;
      announce(`The line held. All ${WIN_WAVES} waves survived: ${b.trees} trees saved, ${b.water} water banked. Final score ${score()}. Press R to play again.`);
    } else {
      game.state = 'cleared';
      sound.play('held');
      announce(`Wave ${game.wave} held. ${trees} trees saved, ${water} water left. Score ${score()}. Press Space for the next wave.`);
    }
  }
}

/**
 * End the stroke in progress. If it painted anything, kick up a burst of dust along it:
 * DUST.min..DUST.max motes spread evenly over the painted cells. Every mote's offset, drift and
 * shade comes from a hash of the stroke's start tick, so the burst is the same every replay.
 */
function endStroke() {
  const cells = game.strokePainted;
  game.stroke = null;
  game.strokePainted = [];
  if (!cells.length) return;
  const n = Math.max(DUST.min, Math.min(DUST.max, cells.length));
  const salt = game.anim;
  const motes = [];
  for (let k = 0; k < n; k += 1) {
    const cell = cells[Math.floor(((k + 0.5) * cells.length) / n)];
    const h = (s) => cellHash(salt * 31 + k, s);
    motes.push({
      x: GRID.x + (cell.c + 0.2 + 0.6 * h(1)) * GRID.cell,
      y: GRID.y + (cell.r + 0.4 + 0.5 * h(2)) * GRID.cell,
      vx: (h(3) - 0.5) * 1.6,
      vy: -0.5 - 0.8 * h(4),
      size: 2 + h(5) * 1.5,
      shade: Math.floor(h(6) * 3),
    });
  }
  game.dust.push({ born: game.anim, motes });
  sound.play('stroke');
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
  if (game.state === 'title' || game.state === 'over' || game.state === 'won') startRun();
  else if (game.state === 'cleared') startWave(game.wave + 1);
}

function handle(ev) {
  if (ev.type === 'key') {
    if (ev.action === 'advance') {
      if (game.state === 'play' && game.paused) game.paused = false;
      else advance();
    } else if (ev.action === 'erase') {
      game.erase = !game.erase;
    } else if (ev.action === 'sound') {
      const on = sound.toggle();
      announce(on ? 'Sound on.' : 'Sound off.');
    } else if (ev.action === 'restart') {
      startRun();
    } else if (ev.action === 'pause' && game.state === 'play') {
      game.paused = !game.paused;
      endStroke();
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
    game.strokePainted = [];
    strokeCells(game.board, game.water, cell, cell, game.erase, game.erase ? null : game.strokePainted);
    game.stroke = cell;
  } else if (ev.type === 'move') {
    if (!game.stroke || game.state !== 'play' || game.paused) return;
    const cell = cellClamped(ev.x, ev.y);
    strokeCells(game.board, game.water, game.stroke, cell, game.erase, game.erase ? null : game.strokePainted);
    game.stroke = cell;
  } else if (ev.type === 'up') {
    if (game.stroke) endStroke();
  }
}

// --- loop ------------------------------------------------------------------------------------

const TITLE_TICK_EVERY = 12; // simulation steps per title-backdrop fire tick (5 per second)

function step() {
  if (game.paused) return;
  game.anim += 1;
  if (game.shake > 0) game.shake -= 1;
  game.dust = game.dust.filter((d) => game.anim - d.born < DUST.life);
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
  game.fireClock += 1;
  if (game.fireClock >= game.tickSteps) {
    game.fireClock = 0;
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
    const k = game.shakeKind;
    const amp = k.amp * (game.shake / k.steps);
    ctx.translate((cellHash(game.shake, 91) * 2 - 1) * amp, (cellHash(game.shake, 97) * 2 - 1) * amp);
  }
  drawBoard(ctx, game.board, {
    anim: game.anim,
    hover: hoverCell && { ...hoverCell, erase: game.erase },
    won: game.state === 'won',
  });
  drawDust(ctx, game.dust, game.anim);
  ctx.restore();
  drawHud(ctx, {
    wave: game.wave,
    waves: WIN_WAVES,
    sound: sound.on,
    water: game.water.left,
    budget: game.water.budget,
    trees: countTrees(game.board),
    houses: countHouses(game.board),
    housesTotal: HOUSES.length,
    erase: game.erase,
    score: score(),
  });
  if (game.state === 'cleared') {
    drawCleared(ctx, { ...game.last, waves: WIN_WAVES, total: score() });
  } else if (game.state === 'over') {
    const b = game.banked;
    drawOver(ctx, { wave: game.wave, trees: b.trees, waves: b.waves, water: b.water, total: score() });
  } else if (game.state === 'won') {
    const b = game.banked;
    drawWon(ctx, { trees: b.trees, waves: b.waves, water: b.water, total: score(), anim: game.anim });
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
      shakeAmp: game.shake > 0 ? game.shakeKind.amp : 0,
      breached: game.breached,
      lineTouches: game.lineTouches,
      dust: game.dust.reduce((n, d) => n + d.motes.length, 0),
      sound: sound.on,
      banked: { ...game.banked },
      ignitions: b ? b.ignitions.map((g) => ({ ...g })) : [],
      cells: b ? Array.from(b.type) : [],
    };
  },
});
render();
requestAnimationFrame(frame);
