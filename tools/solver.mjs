// 可解性评估用求解器（不参与运行时）：策略是「最多同时开 4 种，优先收尾」。
//   node tools/solver.mjs [seeds]
import { CARD_W, CARD_H, SLOT_CAPACITY } from '../js/core/config.js';
import { isUnlocked, computeInsertIndex, findTripleIndex, resolveOcclusion } from '../js/core/rules.js';
import { generateLevel } from '../js/core/LevelGenerator.js';

const MAX_OPEN_TYPES = Number(process.env.MAX_OPEN || 4);

export function solve(seed, { rollouts = 1, maxOpen = MAX_OPEN_TYPES } = {}) {
  let bestLeft = 1e9;
  for (let r = 0; r < rollouts; r++) {
    const { cards } = generateLevel(seed + r * 100003);
    const live = cards.map((c) => ({ ...c }));
    const rng = makeRng(seed * 31 + r);
    let slot = [];
    let guard = 0;
    let left = live.length;

    while (guard++ < 400) {
      const onPile = live.filter((c) => c.state === 'on_pile');
      if (onPile.length === 0) return { won: true, left: 0, slot };
      const unlocked = onPile.filter((c) => isUnlocked(c, onPile));
      if (unlocked.length === 0) break;

      const cnt = new Map();
      for (const s of slot) cnt.set(s.type, (cnt.get(s.type) || 0) + 1);
      const openTypes = cnt.size;

      // 候选优先级
      const scored = [];
      for (const c of unlocked) {
        const n = cnt.get(c.type) || 0;
        const accessible = unlocked.filter((u) => u.type === c.type).length;
        let score;
        if (n === 2) score = 1000;                       // 立刻消
        else if (n === 1) score = 500 + accessible;      // 收尾中
        else if (openTypes < maxOpen) score = 100 + accessible * 10; // 开新类，挑同类型可见多的
        else score = -100 + accessible;                  // 被迫
        scored.push({ c, score, n, accessible });
      }
      scored.sort((a, b) => b.score - a.score || (rng() - 0.5));
      const pick = scored[0];

      const idx = computeInsertIndex(slot, pick.c.type);
      pick.c.state = 'removed';
      slot.splice(idx, 0, { type: pick.c.type });
      const tri = findTripleIndex(slot);
      if (tri >= 0) slot.splice(tri, 3);
      left = onPile.length - 1;
      if (slot.length >= SLOT_CAPACITY) break;
    }
    if (left < bestLeft) bestLeft = left;
    if (left === 0) return { won: true, left: 0, slot };
  }
  return { won: false, left: bestLeft, slot: [] };
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

if (process.argv[1] && process.argv[1].endsWith('solver.mjs')) {
  const N = Number(process.argv[2] || 20);
  let wins = 0;
  for (let i = 0; i < N; i++) {
    const r = solve(2000 + i, { rollouts: 3 });
    if (r.won) wins++;
    else console.log(`seed ${2000 + i}: 差 ${r.left} 张`);
  }
  console.log(`\n胜 ${wins}/${N} = ${((wins / N) * 100).toFixed(0)}%  (maxOpen=${MAX_OPEN_TYPES})`);
}
