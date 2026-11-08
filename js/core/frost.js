// 糖霜机制（纯函数，可在 node 里跑）
//
// 霜是牌自己的属性（frostLayers 0..3），与遮挡无关：
//   - 带霜的牌不能点，点它只有抖动反馈；
//   - 一张牌被取走时，它的「原位置」周围的牌各融一层（接触受热）。
//
// 关键性质：热源只由几何决定、与牌型无关，
// 所以生成器可以沿清空顺序 T 预先算出每张牌的受热次数，
// 再强制 frostLayers ≤ heatBudget —— 保证照 T 走时霜一定在轮到它之前化完。

import { FROST_HEAT_GAP, FROST_LAYER_MIX } from './config.js';

// 两个 AABB（中心点 + 宽高）的最近距离；相交返回 0
export function rectGap(a, b) {
  const dx = Math.abs(a.lx - b.lx) - (a.lw + b.lw) / 2;
  const dy = Math.abs(a.ly - b.ly) - (a.lh + b.lh) / 2;
  if (dx <= 0 && dy <= 0) return 0;
  if (dx <= 0) return dy;
  if (dy <= 0) return dx;
  return Math.hypot(dx, dy);
}

// 被 source 取走时会受热的牌（仍在牌堆上、且不是自己）
export function heatTargets(cards, source, gap = FROST_HEAT_GAP) {
  const out = [];
  for (const c of cards) {
    if (c.state !== 'on_pile') continue;
    if (c.id === source.id) continue;
    if (rectGap(source, c) <= gap) out.push(c);
  }
  return out;
}

// 扣层：返回实际发生变化的列表（供动画用）
export function applyHeat(cards, ids) {
  const wanted = new Set(ids);
  const changes = [];
  for (const c of cards) {
    if (!wanted.has(c.id)) continue;
    if (!c.frostLayers) continue;
    const from = c.frostLayers;
    c.frostLayers = Math.max(0, from - 1);
    changes.push({ id: c.id, from, to: c.frostLayers });
  }
  return changes;
}

// 沿清空顺序模拟受热，得到每张牌「轮到它之前会被加热几次」
export function computeHeatBudget(cards, order, gap = FROST_HEAT_GAP) {
  const byId = new Map(cards.map((c) => [c.id, c]));
  const live = new Set(cards.map((c) => c.id));
  const budget = new Map(cards.map((c) => [c.id, 0]));

  for (const id of order) {
    const source = byId.get(id);
    if (!source) continue;
    live.delete(id);
    for (const oid of live) {
      const other = byId.get(oid);
      if (rectGap(source, other) <= gap) budget.set(oid, budget.get(oid) + 1);
    }
  }
  return budget;
}

// 按 T 顺序挑牌：把数组就地打乱后取用，保证可复现
function takeWhere(pool, budget, minBudget, count, taken) {
  const picked = [];
  for (let i = 0; i < pool.length && picked.length < count; i++) {
    const card = pool[i];
    if (taken.has(card.id)) continue;
    if ((budget.get(card.id) || 0) < minBudget) continue;
    picked.push(card);
  }
  return picked;
}

// 发霜：层数 3 → 2 → 1 逐档分配，预算不够就顺延到下一档
export function assignFrost(cards, order, rng, { mix = FROST_LAYER_MIX } = {}) {
  for (const c of cards) c.frostLayers = 0;

  const budget = computeHeatBudget(cards, order);
  const pool = cards.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = pool[i];
    pool[i] = pool[j];
    pool[j] = t;
  }

  const taken = new Set();
  // [层数, 配额]，从高到低；不够的顺延
  const tiers = [[3, mix[2] || 0], [2, mix[1] || 0], [1, mix[0] || 0]];
  let carry = 0;
  for (let t = 0; t < tiers.length; t++) {
    const [layers, quota] = tiers[t];
    const want = quota + carry;
    const picked = takeWhere(pool, budget, layers, want, taken);
    for (const card of picked) {
      card.frostLayers = layers;
      taken.add(card.id);
    }
    carry = want - picked.length; // 本档没发完的顺延到下一档
  }

  return { budget, frosted: cards.filter((c) => c.frostLayers > 0).length };
}

// 统计：带霜牌数 / 总层数 / 层级分布
export function frostStats(cards) {
  const live = cards.filter((c) => c.state === 'on_pile');
  const dist = [0, 0, 0, 0];
  let layers = 0;
  for (const c of live) {
    const n = c.frostLayers || 0;
    dist[n]++;
    layers += n;
  }
  return { frosted: live.length - dist[0], layers, dist };
}

// 该牌此刻能不能点：未被压住 且 无霜
export function isPlayable(card) {
  return !!card.unlocked && (card.frostLayers || 0) === 0;
}
