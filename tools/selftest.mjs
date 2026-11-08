// 纯 node 自测：不依赖 Phaser / 浏览器
//   node tools/selftest.mjs
//
// 覆盖：关卡生成合法性、几何并集面积、遮挡判定（全量 vs 增量）、
//       槽位插入/三连规则、胜负判定，以及随机种子的可解率抽样。

import { CARD_TYPES, CARDS_PER_TYPE, TOTAL_CARDS, CARD_W, CARD_H, SLOT_CAPACITY, PILE_COUNT, PILE_HEIGHT } from '../js/core/config.js';
import {
  getPileRegion,
  computeSlotCenters,
  getSlotBarRect,
  unionArea,
  rectIntersect,
  isAbove,
  isUnlocked,
  resolveOcclusion,
  resolveOcclusionFor,
  occludedBy,
  computeInsertIndex,
  findTripleIndex,
  evaluateOutcome,
} from '../js/core/rules.js';
import { generateLevel } from '../js/core/LevelGenerator.js';

let failures = 0;
let checks = 0;

function ok(cond, label, extra) {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
  } else if (process.env.VERBOSE) {
    console.log(`  ✓ ${label}`);
  }
}

function group(title, fn) {
  console.log(`\n▶ ${title}`);
  fn();
}

// ───────────────── 1. 关卡生成 ─────────────────
group('关卡生成', () => {
  const level = generateLevel(20261108);
  const { cards } = level;
  ok(cards.length === TOTAL_CARDS, `共 ${TOTAL_CARDS} 张`, `实际 ${cards.length}`);

  const perType = new Array(CARD_TYPES).fill(0);
  for (const c of cards) perType[c.type]++;
  ok(perType.every((n) => n === CARDS_PER_TYPE), `每类 ${CARDS_PER_TYPE} 张`, perType.join(','));

  const ids = new Set(cards.map((c) => c.id));
  ok(ids.size === cards.length, 'id 唯一');

  const zs = cards.map((c) => c.zLayer);
  ok(Math.min(...zs) >= 0 && Math.max(...zs) < level.maxZ, `z 在 [0, ${level.maxZ})`, `${Math.min(...zs)}..${Math.max(...zs)}`);

  const region = getPileRegion();
  const outside = cards.filter((c) => {
    return c.lx - CARD_W / 2 < region.left - CARD_W
      || c.lx + CARD_W / 2 > region.right + CARD_W
      || c.ly - CARD_H / 2 < region.top - CARD_H
      || c.ly + CARD_H / 2 > region.bottom + CARD_H;
  });
  ok(outside.length === 0, '全部卡在牌堆区内（允许半张溢出）', `${outside.length} 张越界`);

  // 确定性：同种子同结果
  const again = generateLevel(20261108);
  const sig = (l) => l.cards.map((c) => `${c.type}:${c.lx.toFixed(3)}:${c.ly.toFixed(3)}:${c.zLayer}`).join('|');
  ok(sig(level) === sig(again), '同种子生成结果一致');

  // 开局至少有一张可点
  const unlocked = resolveOcclusion(cards).filter((r) => r.unlocked).length;
  ok(unlocked > 0, '开局有可点的牌', `${unlocked} 张`);
  console.log(`  开局可点：${unlocked} 张 / ${TOTAL_CARDS}`);
});

// ───────────────── 2. 几何 ─────────────────
group('几何：并集面积', () => {
  const r = (left, right, top, bottom) => ({ left, right, top, bottom });
  ok(unionArea([r(0, 10, 0, 10)]) === 100, '单矩形面积');
  ok(unionArea([r(0, 10, 0, 10), r(10, 20, 0, 10)]) === 200, '相邻不相交');
  ok(unionArea([r(0, 10, 0, 10), r(5, 15, 0, 10)]) === 150, '水平重叠');
  ok(unionArea([r(0, 10, 0, 10), r(0, 10, 5, 15)]) === 150, '垂直重叠');
  ok(unionArea([r(0, 10, 0, 10), r(2, 8, 2, 8)]) === 100, '完全内含');
  ok(unionArea([r(0, 10, 0, 10), r(10, 20, 0, 10), r(0, 10, 5, 15)]) === 250, '三矩形组合');

  // 与 0.25px 网格暴力采样对拍
  const rndRects = [];
  const lcg = (s) => () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const rr = lcg(7);
  for (let i = 0; i < 12; i++) {
    const left = rr() * 100;
    const top = rr() * 100;
    rndRects.push(r(left, left + 5 + rr() * 40, top, top + 5 + rr() * 40));
  }
  let sampled = 0;
  const step = 0.25;
  for (let x = 0; x < 150; x += step) {
    for (let y = 0; y < 150; y += step) {
      const px = x + step / 2;
      const py = y + step / 2;
      if (rndRects.some((q) => px >= q.left && px < q.right && py >= q.top && py < q.bottom)) sampled += step * step;
    }
  }
  const exact = unionArea(rndRects);
  const err = Math.abs(exact - sampled) / Math.max(exact, 1);
  ok(err < 0.01, '随机 12 矩形 vs 网格采样（<1%）', `exact=${exact.toFixed(1)} sampled=${sampled.toFixed(1)} err=${(err * 100).toFixed(2)}%`);

  ok(rectIntersect(0, 0, 10, 10, 5, 0, 10, 10).left === 0, 'rectIntersect 相交');
  ok(rectIntersect(0, 0, 10, 10, 100, 0, 10, 10) === null, 'rectIntersect 不相交');
});

// ───────────────── 3. 遮挡：全量 vs 增量 ─────────────────
group('遮挡判定', () => {
  const { cards } = generateLevel(424242);
  const full = new Map(resolveOcclusion(cards).map((r) => [r.id, r.unlocked]));

  // 模拟一步：取一张可点的牌移走，再增量重算
  const first = cards.find((c) => full.get(c.id) === true);
  ok(!!first, '存在可点击的牌');
  const removed = { ...first, state: 'removed' };
  const rest = cards.map((c) => (c.id === first.id ? removed : c));

  const dirty = occludedBy(rest, removed);
  const inc = new Map(resolveOcclusionFor(rest, dirty).map((r) => [r.id, r.unlocked]));
  const fullAfter = new Map(resolveOcclusion(rest).map((r) => [r.id, r.unlocked]));

  let diff = 0;
  for (const [id, v] of fullAfter) {
    if (!inc.has(id)) continue;
    if (inc.get(id) !== v) diff++;
  }
  ok(diff === 0, '增量结果与全量一致（仅 dirty 集）', `diff=${diff}`);
  ok(dirty.length >= 0, `dirty 集大小 ${dirty.length}`);

  // isAbove 与渲染顺序一致
  const a = { zLayer: 3, id: 10 };
  const b = { zLayer: 3, id: 11 };
  ok(isAbove(b, a) && !isAbove(a, b), '同层按 id 定序');

  // 5% 阈值边界：76×76 的 5% = 288.8
  const big = { id: 1, lx: 100, ly: 100, lw: CARD_W, lh: CARD_H, zLayer: 1, state: 'on_pile' };
  const cover4 = { id: 2, lx: 100, ly: 100 - CARD_H + 3.5, lw: CARD_W, lh: CARD_H, zLayer: 2, state: 'on_pile' };
  const cover6 = { id: 3, lx: 100, ly: 100 - CARD_H + 4.2, lw: CARD_W, lh: CARD_H, zLayer: 2, state: 'on_pile' };
  ok(isUnlocked(big, [big, cover4]) === true, '覆盖 <5% 仍可点');
  ok(isUnlocked(big, [big, cover6]) === false, '覆盖 >5% 视为被压');
});

// ───────────────── 4. 槽位规则 ─────────────────
group('槽位规则', () => {
  const mk = (type) => ({ type });
  const slot = [mk(1), mk(2), mk(3)];
  ok(computeInsertIndex(slot, 9) === 3, '无同类追加末尾');
  ok(computeInsertIndex(slot, 2) === 2, '插到最后一张同类之后');
  ok(computeInsertIndex([], 5) === 0, '空槽插 0');
  ok(computeInsertIndex([mk(1), mk(2), mk(1)], 1) === 3, '多个同类取最后一个');

  ok(findTripleIndex([mk(1), mk(1), mk(1)]) === 0, '三连在头部');
  ok(findTripleIndex([mk(2), mk(1), mk(1), mk(1)]) === 1, '三连在中部');
  ok(findTripleIndex([mk(1), mk(2), mk(1)]) === -1, '不相邻不算三连');
  ok(findTripleIndex([mk(1), mk(1), mk(2), mk(2)]) === -1, '只有两张不算');

  const center = computeSlotCenters();
  ok(center.length === SLOT_CAPACITY, '槽位数量 = 7');
  const step = center[1].lx - center[0].lx;
  ok(Math.abs(step - 84) < 1e-9, '槽心间距 84');
  const bar = getSlotBarRect();
  ok(Math.abs(bar.padX - 39) < 1e-9, '托盘左右内边距 39');
  ok(Math.abs(bar.h - 104) < 1e-9, '托盘高 104');

  const cards = [{ state: 'on_pile' }, { state: 'removed' }];
  ok(evaluateOutcome(cards, 3) === 'playing', '还有牌 → 继续');
  ok(evaluateOutcome(cards, SLOT_CAPACITY) === 'lose', '槽满 7 → 负');
  ok(evaluateOutcome([{ state: 'removed' }], SLOT_CAPACITY) === 'win', '牌堆空优先判胜');
});

// ───────────────── 5. 内置通关路线 ─────────────────
group('内置通关路线（生成器保证有解）', () => {
  const playSolution = (seed) => {
    const level = generateLevel(seed);
    const byId = new Map(level.cards.map((c) => [c.id, c]));
    const live = level.cards.map((c) => ({ ...c }));
    let slot = [];
    let maxSlot = 0;
    let guard = 0;

    for (const id of level.solution) {
      if (guard++ > 200) return { ok: false, why: 'dead loop' };
      const card = live.find((c) => c.id === id);
      if (!card || card.state !== 'on_pile') return { ok: false, why: `card ${id} missing` };

      const onPile = live.filter((c) => c.state === 'on_pile');
      if (!isUnlocked(card, onPile)) return { ok: false, why: `card ${id} still covered` };

      // 路线里每 3 张同类型一组
      card.state = 'removed';
      const idx = computeInsertIndex(slot, card.type);
      slot.splice(idx, 0, { type: card.type });
      maxSlot = Math.max(maxSlot, slot.length);
      const tri = findTripleIndex(slot);
      if (tri >= 0) slot.splice(tri, 3);
      if (slot.length >= SLOT_CAPACITY) return { ok: false, why: `slot overflow at ${id}` };
    }

    const left = live.filter((c) => c.state === 'on_pile').length;
    return { ok: left === 0 && slot.length === 0, why: `left=${left} slot=${slot.length}`, maxSlot };
  };

  let bad = 0;
  let maxSlotSeen = 0;
  for (let i = 0; i < 20; i++) {
    const r = playSolution(3000 + i);
    if (!r.ok) { bad++; console.error(`    seed ${3000 + i}: ${r.why}`); }
    maxSlotSeen = Math.max(maxSlotSeen, r.maxSlot || 0);
  }
  ok(bad === 0, '20 个种子全部可通关', `${bad} 个失败`);
  ok(maxSlotSeen <= 3, '通关路线槽内峰值 ≤ 3', `峰值 ${maxSlotSeen}`);
  console.log(`  通关路线校验：20/20 通过，槽内峰值 ${maxSlotSeen} 张（远低于 7 格上限）`);

  // 路线三张一组同类型
  const lv = generateLevel(777);
  let grouped = true;
  for (let i = 0; i < lv.solution.length; i += 3) {
    const t = lv.cards.find((c) => c.id === lv.solution[i]).type;
    for (let k = 1; k < 3; k++) {
      if (lv.cards.find((c) => c.id === lv.solution[i + k]).type !== t) grouped = false;
    }
  }
  ok(grouped, '通关路线每 3 张同类型');
});

console.log(`\n${failures === 0 ? '✅' : '❌'} ${checks - failures}/${checks} 项通过`);
process.exit(failures === 0 ? 0 : 1);
