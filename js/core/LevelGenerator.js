// 关卡生成：12 类 × 9 张 = 108 张，随机分到「6 摞 × 10 张」+「48 张散卡」
//
// 与 day-04 的混合堆叠参数 1:1（见 config.js），但多做一步「保证有解」：
//   1. 先按几何随机摆牌（位置 + z 层），此时只决定「谁会压住谁」；
//   2. 用遮挡关系推演出一条合法的「全部取走」顺序 T；
//   3. 沿 T 以三张一组分配牌型 T[0..2]=A、T[3..5]=B …
//      于是照着 T 玩必定清空（槽里同时最多 3 张），每一局都存在通关路线。
// 遮挡只由位置/z 决定，与牌型无关，所以第 2 步得出的 T 在第 3 步之后依然合法。

import {
  CARD_W,
  CARD_H,
  CARD_TYPES,
  CARDS_PER_TYPE,
  PILE_COUNT,
  PILE_HEIGHT,
  PILE_OFFSET_X,
  PILE_OFFSET_Y,
  PILE_GRID_COLS,
  PILE_GRID_ROWS,
  SCATTER_LAYERS,
} from './config.js';
import { getPileRegion, isUnlocked } from './rules.js';
import { assignFrost } from './frost.js';
import { makeRng } from './rng.js';

const ANCHOR_JITTER = 15;   // 摞心在 3×2 网格上的随机偏移（逻辑像素）
const PILE_TILT_DEG = 10;   // 整摞倾斜幅度（±10°）
const SCATTER_COUNT = CARD_TYPES * CARDS_PER_TYPE - PILE_COUNT * PILE_HEIGHT; // 48

// Fisher–Yates，用注入的 rng 保证可复现
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

const rand = (rng, min, max) => min + rng() * (max - min);

// ── 1. 摆牌：只决定位置与 z 层 ──
function layoutCards(rng) {
  const region = getPileRegion();
  const cards = [];
  let id = 0;
  const addCard = (lx, ly, zLayer, angle) => {
    cards.push({ id: id++, type: 0, lx, ly, lw: CARD_W, lh: CARD_H, zLayer, angle, state: 'on_pile' });
  };

  const maxZ = PILE_HEIGHT + SCATTER_LAYERS + 4; // 22

  for (let row = 0; row < PILE_GRID_ROWS; row++) {
    for (let col = 0; col < PILE_GRID_COLS; col++) {
      const ax = region.left + (region.right - region.left) * ((col + 0.5) / PILE_GRID_COLS)
        + rand(rng, -ANCHOR_JITTER, ANCHOR_JITTER);
      const ay = region.top + (region.bottom - region.top) * ((row + 0.5) / PILE_GRID_ROWS)
        + rand(rng, -ANCHOR_JITTER, ANCHOR_JITTER);

      const zStart = Math.floor(rand(rng, 0, maxZ - PILE_HEIGHT + 1)); // 0..12
      const angle = rand(rng, -PILE_TILT_DEG, PILE_TILT_DEG);
      const rad = (angle * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);

      for (let i = 0; i < PILE_HEIGHT; i++) {
        const ox = i * PILE_OFFSET_X;
        const oy = i * PILE_OFFSET_Y;
        // 摞内偏移跟着整摞一起旋转
        addCard(ax + ox * cos - oy * sin, ay + ox * sin + oy * cos, zStart + i, angle);
      }
    }
  }

  const minX = region.left + CARD_W / 2;
  const maxX = region.right - CARD_W / 2;
  const minY = region.top + CARD_H / 2;
  const maxY = region.bottom - CARD_H / 2;
  for (let i = 0; i < SCATTER_COUNT; i++) {
    addCard(rand(rng, minX, maxX), rand(rng, minY, maxY), Math.floor(rand(rng, 0, maxZ)), rand(rng, -4, 4));
  }

  return { cards, maxZ };
}

// ── 2. 推演一条合法的「全部取走」顺序（几何层面，与牌型无关） ──
function computeRemovalOrder(cards, rng) {
  const live = cards.map((c) => ({ ...c }));
  const order = [];
  let remaining = live.length;

  while (remaining > 0) {
    const onPile = live.filter((c) => c.state === 'on_pile');
    const unlocked = onPile.filter((c) => isUnlocked(c, onPile));
    if (unlocked.length === 0) break; // 理论上不会发生（最高 z 的牌永远可点）
    // 偏向可点集合里「压住别人更多」的那些，解出来更像自然牌局
    const pick = unlocked[Math.floor(rng() * unlocked.length)];
    pick.state = 'removed';
    order.push(pick.id);
    remaining--;
  }

  if (order.length !== cards.length) {
    throw new Error(`removal order incomplete: ${order.length}/${cards.length}`);
  }
  return order;
}

// ── 3. 沿 T 每 3 张一组分配牌型 ──
function assignTypes(layoutCards, order, rng) {
  const triples = order.length / 3;              // 36
  const labels = [];
  for (let type = 0; type < CARD_TYPES; type++) {
    for (let n = 0; n < CARDS_PER_TYPE / 3; n++) labels.push(type); // 每类 3 个三连
  }
  shuffle(labels, rng);

  const byId = new Map(layoutCards.map((c) => [c.id, c]));
  for (let t = 0; t < triples; t++) {
    const type = labels[t];
    for (let k = 0; k < 3; k++) byId.get(order[t * 3 + k]).type = type;
  }
}

// 生成一局：返回 { seed, cards, maxZ, solution }
// 每张卡：{ id, type, lx, ly, lw, lh, zLayer, angle, state, frostLayers }
export function generateLevel(seed = Date.now()) {
  const rng = makeRng(seed);

  const { cards, maxZ } = layoutCards(rng);
  const order = computeRemovalOrder(cards, rng);
  assignTypes(cards, order, rng);

  // 糖霜：沿 T 预算受热次数，保证带霜牌在轮到它之前必然化完
  assignFrost(cards, order, rng);

  return { seed, cards, maxZ, solution: order };
}
