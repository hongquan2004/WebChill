// A repeatable landscape keeps tree placement stable across React mounts.
export function random(seed = 1847) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let n = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

const fract = (v) => v - Math.floor(v);
const hash = (x, z) => fract(Math.sin(x * 127.1 + z * 311.7) * 43758.5453);
const mix = (a, b, t) => a + (b - a) * t;
export function noise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = fract(x), fz = fract(z);
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  return mix(mix(hash(ix, iz), hash(ix + 1, iz), u), mix(hash(ix, iz + 1), hash(ix + 1, iz + 1), u), v);
}

export const riverCenter = (z) => 5 + Math.sin(z * .035) * 11 + Math.sin(z * .074) * 2;
export const riverWidth = (z) => 5.2 + Math.sin(z * .024 + 1) * 1.5 + Math.max(0, z + 8) * .042;
export function groundHeight(x, z) {
  const bank = Math.abs(x - riverCenter(z)) - riverWidth(z);
  if (bank < 0) return -.8 + bank * .09;
  const rise = 1 - Math.exp(-bank * .055);
  return -.15 + Math.min(bank, 3) * .24 + rise * (3 + noise(x * .025, z * .023) * 15)
    + noise(x * .19, z * .19) * Math.min(bank * .15, .6);
}
