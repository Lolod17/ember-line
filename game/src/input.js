// Pointer and keyboard input, collected as a queue the main loop drains once per frame.
// Pointer positions arrive already mapped from page pixels to the 1280x720 view.
import { VIEW } from './config.js';

export const KEY_ACTIONS = {
  Space: 'advance',
  Enter: 'advance',
  KeyX: 'erase',
  KeyR: 'restart',
  KeyP: 'pause',
  Escape: 'pause',
  KeyM: 'sound',
};

export function createInput(canvas, getViewport) {
  const queue = [];
  const pointer = { x: -1, y: -1, down: false, inside: false };

  function toView(event) {
    const rect = canvas.getBoundingClientRect();
    const vp = getViewport();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    return {
      x: (px - vp.offsetX) / vp.scale,
      y: (py - vp.offsetY) / vp.scale,
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    const p = toView(event);
    Object.assign(pointer, p, { down: true, inside: true });
    queue.push({ type: 'down', x: p.x, y: p.y });
  });

  canvas.addEventListener('pointermove', (event) => {
    const p = toView(event);
    Object.assign(pointer, p, { inside: true });
    if (pointer.down) queue.push({ type: 'move', x: p.x, y: p.y });
  });

  const release = (event) => {
    if (!pointer.down) return;
    pointer.down = false;
    const p = toView(event);
    queue.push({ type: 'up', x: p.x, y: p.y });
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('pointerleave', () => {
    pointer.inside = pointer.down;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('keydown', (event) => {
    const action = KEY_ACTIONS[event.code];
    if (!action) return;
    event.preventDefault();
    if (event.repeat) return;
    queue.push({ type: 'key', action });
  });

  window.addEventListener('blur', () => {
    if (pointer.down) {
      pointer.down = false;
      queue.push({ type: 'up', x: pointer.x, y: pointer.y });
    }
  });

  return {
    pointer,
    drain() {
      return queue.splice(0, queue.length);
    },
  };
}

/** Fit the fixed view into the window, letterboxed, at device-pixel resolution. */
export function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const scale = Math.min(w / VIEW.width, h / VIEW.height);
  return {
    dpr,
    scale,
    offsetX: (w - VIEW.width * scale) / 2,
    offsetY: (h - VIEW.height * scale) / 2,
  };
}
