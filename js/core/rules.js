// 纯函数规则层：不依赖 Phaser，可在 node 里直接跑（tools/selftest.mjs）
//
// 遮挡判定、插入位、三连检测、槽位中心、牌堆区域都在这里，
// GameScene 只负责把这里的结论落到 sprite 与 tween 上。

import {
  LEVEL_LOGICAL_W,
  LEVEL_LOGICAL_H,
  CARD_W,
  CARD_H,
  OCCLUSION_THRESHOLD,
  SLOT_CAPACITY,
  SLOT_CELL_W,
  SLOT_CELL_H,
  SLOT_CELL_GAP,
  SLOT_BAR_W,
  SLOT_BAR_H,
  SLOT_BAR_MARGIN_BOTTOM,
  HUD_HEIGHT,
  PILE_MARGIN_X,
  PILE_TOP_GAP,
  PILE_BOTTOM_GAP,
  TRIPLE_COUNT,
} from './config.js';

// ───────────────── 区域 ─────────────────

// 牌堆区（逻辑坐标）：HUD 之下、卡槽之上
export function getPileRegion() {
  const barTop = LEVEL_LOGICAL_H - SLOT_BAR_MARGIN_BOTTOM - SLOT_BAR_H;
  return {
    left: PILE_MARGIN_X,
    right: LEVEL_LOGICAL_W - PILE_MARGIN_X,
    top: HUD_HEIGHT + PILE_TOP_GAP,
    bottom: barTop - PILE_BOTTOM_GAP,
  };
}

// 7 个槽位中心（逻辑坐标），托盘水平居中、竖直中心与凹槽中线一致
export function computeSlotCenters() {
  const step = SLOT_CELL_W + SLOT_CELL_GAP;
  const totalW = SLOT_CAPACITY * SLOT_CELL_W + (SLOT_CAPACITY - 1) * SLOT_CELL_GAP;
  const left = LEVEL_LOGICAL_W / 2 - totalW / 2;
  const ly = LEVEL_LOGICAL_H - SLOT_BAR_MARGIN_BOTTOM - SLOT_BAR_H / 2;
  const centers = [];
  for (let i = 0; i < SLOT_CAPACITY; i++) {
    centers.push({ lx: left + SLOT_CELL_W / 2 + i * step, ly });
  }
  return centers;
}

// 7 个凹槽整体的宽度（逻辑像素）
export function getSlotCellsWidth() {
  return SLOT_CAPACITY * SLOT_CELL_W + (SLOT_CAPACITY - 1) * SLOT_CELL_GAP; // 584
}

// 卡槽托盘矩形（逻辑坐标），供 art 层烘焙贴图
export function getSlotBarRect() {
  return {
    w: SLOT_BAR_W,
    h: SLOT_BAR_H,
    padX: (SLOT_BAR_W - getSlotCellsWidth()) / 2, // (662 - 584) / 2 = 39
    cx: LEVEL_LOGICAL_W / 2,
    cy: LEVEL_LOGICAL_H - SLOT_BAR_MARGIN_BOTTOM - SLOT_BAR_H / 2,
  };
}

// ───────────────── 几何 ─────────────────

// 两个 AABB 的相交矩形（中心点 + 宽高）；不相交返回 null
export function rectIntersect(ax, ay, aw, ah, bx, by, bw, bh) {
  const left = Math.max(ax - aw / 2, bx - bw / 2);
  const right = Math.min(ax + aw / 2, bx + bw / 2);
  const top = Math.max(ay - ah / 2, by - bh / 2);
  const bottom = Math.min(ay + ah / 2, by + bh / 2);
  if (right <= left || bottom <= top) return null;
  return { left, right, top, bottom };
}

// 多个矩形的并集面积：x 方向扫描线 + y 区间合并，精确且 O(K log K + K²)
export function unionArea(rects) {
  if (rects.length === 0) return 0;
  if (rects.length === 1) {
    const r = rects[0];
    return (r.right - r.left) * (r.bottom - r.top);
  }

  const events = [];
  for (const r of rects) {
    events.push({ x: r.left, add: true, r });
    events.push({ x: r.right, add: false, r });
  }
  events.sort((a, b) => (a.x - b.x) || (a.add === b.add ? 0 : a.add ? 1 : -1));

  const active = new Set();
  let area = 0;
  let prevX = events[0].x;
  let i = 0;

  while (i < events.length) {
    const x = events[i].x;
    if (x > prevX && active.size > 0) {
      // 当前 slab [prevX, x) 内所有活跃矩形在 y 方向的并集长度
      const spans = [];
      for (const r of active) spans.push([r.top, r.bottom]);
      spans.sort((a, b) => a[0] - b[0]);
      let height = 0;
      let curStart = spans[0][0];
      let curEnd = spans[0][1];
      for (let k = 1; k < spans.length; k++) {
        if (spans[k][0] > curEnd) {
          height += curEnd - curStart;
          curStart = spans[k][0];
          curEnd = spans[k][1];
        } else if (spans[k][1] > curEnd) {
          curEnd = spans[k][1];
        }
      }
      height += curEnd - curStart;
      area += height * (x - prevX);
    }
    // 同一 x 上的所有事件一起处理（先算面积，再更新活跃集）
    while (i < events.length && events[i].x === x) {
      const e = events[i];
      if (e.add) active.add(e.r);
      else active.delete(e.r);
      i++;
    }
    prevX = x;
  }
  return area;
}

// 「a 是否绘制在 b 之上」——与 buildCards 的 depth 排序严格对齐
export function isAbove(a, b) {
  if (a.zLayer !== b.zLayer) return a.zLayer > b.zLayer;
  return a.id > b.id;
}

// 单张卡被多少面积压住（others 中只统计在它上层的）
export function coveredArea(card, others) {
  const rects = [];
  for (const o of others) {
    if (o === card || o.id === card.id) continue;
    if (!isAbove(o, card)) continue;
    const inter = rectIntersect(card.lx, card.ly, card.lw, card.lh, o.lx, o.ly, o.lw, o.lh);
    if (inter) rects.push(inter);
  }
  return unionArea(rects);
}

// 未被遮挡（可点击）判定
export function isUnlocked(card, others) {
  const threshold = OCCLUSION_THRESHOLD * CARD_W * CARD_H;
  return coveredArea(card, others) < threshold;
}

// 全量计算：给每张卡写 unlocked（纯函数版本，自测对拍用）
export function resolveOcclusion(cards) {
  const live = cards.filter((c) => c.state === 'on_pile');
  return live.map((card) => ({ id: card.id, unlocked: isUnlocked(card, live) }));
}

// 增量计算：只重算给定卡片（一次动作后只有被移走卡的下层卡会变化）
export function resolveOcclusionFor(cards, dirtyIds) {
  const live = cards.filter((c) => c.state === 'on_pile');
  const wanted = new Set(dirtyIds);
  const out = [];
  for (const card of live) {
    if (!wanted.has(card.id)) continue;
    out.push({ id: card.id, unlocked: isUnlocked(card, live) });
  }
  return out;
}

// 与被移除卡片相交、且位于其下层的存活卡片（增量重算的目标集合）
export function occludedBy(cards, removed) {
  const out = [];
  for (const c of cards) {
    if (c.state !== 'on_pile') continue;
    if (c.id === removed.id) continue;
    if (isAbove(c, removed)) continue; // 只看它下面的卡
    const inter = rectIntersect(removed.lx, removed.ly, removed.lw, removed.lh, c.lx, c.ly, c.lw, c.lh);
    if (inter) out.push(c.id);
  }
  return out;
}

// ───────────────── 卡槽逻辑 ─────────────────

// 新卡插入位：槽内最后一张同类型的下标 K → 插到 K+1；没有同类则追加末尾
export function computeInsertIndex(slot, type) {
  for (let i = slot.length - 1; i >= 0; i--) {
    if (slot[i].type === type) return i + 1;
  }
  return slot.length;
}

// 槽内连续 3 张同类型：返回起始下标或 -1
export function findTripleIndex(slot, tripleCount = TRIPLE_COUNT) {
  for (let i = 0; i + tripleCount - 1 < slot.length; i++) {
    let same = true;
    for (let k = 1; k < tripleCount; k++) {
      if (slot[i + k].type !== slot[i].type) {
        same = false;
        break;
      }
    }
    if (same) return i;
  }
  return -1;
}

// ───────────────── 胜负 ─────────────────

export function evaluateOutcome(cards, slotLength) {
  const onPile = cards.filter((c) => c.state === 'on_pile').length;
  if (onPile === 0) return 'win';
  if (slotLength >= SLOT_CAPACITY) return 'lose';
  return 'playing';
}
