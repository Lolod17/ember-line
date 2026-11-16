// Seeded randomness. All gameplay randomness flows through createRng; per-cell looks use
// cellHash, a stateless hash of the cell index, so the forest's look never depends on draw order.

/** mulberry32: small, fast, and good enough for a forest. Returns floats in [0, 1). */
export function createRng(seed) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int(n) {
      return Math.floor(next() * n);
    },
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
  };
}

/** Stateless hash of an integer (plus an optional salt) to a float in [0, 1). */
export function cellHash(index, salt = 0) {
  let h = (index * 374761393 + salt * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Derive a fresh seed for wave `wave` of the run seeded `seed`. */
export function waveSeed(seed, wave) {
  return (Math.imul(seed ^ 0x9e3779b9, 2654435761) + wave * 40503) >>> 0;
}
