// 确定性随机数（自测用）

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// seed 为空时退回 Math.random（正式运行），否则返回可复现的伪随机
export function makeRng(seed) {
  if (seed === undefined || seed === null) return Math.random;
  return mulberry32(seed);
}
