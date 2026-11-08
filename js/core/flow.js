// 《糖浆管道》玩法核心（纯逻辑，不依赖 Phaser / DOM）
//
// 规则：
//   每种糖浆有一对端点，从一端拖到另一端把它连通；
//   所有格子必须被糖浆填满，不同颜色不能交叉；
//   部分端点被霜封住，糖浆画到它旁边才会把霜融掉（每格融一层）。
//
// 生成：先造解，再藏解
//   1. 用 backbite 算法随机生成一条覆盖全盘的哈密顿路径
//   2. 在随机位置把它切成 N 段（每段 ≥ MIN_LEN），每段就是一条糖浆管道
//   3. 段的首尾即端点；路径中间格里除端点外都擦掉
//   擦掉的那套分段就是答案，所以每关必定有解；再用 solveOrder() 验证
//   在「结霜」限制下仍存在一种落笔顺序。

import { makeRng } from './rng.js';

export const MIN_LEN = 3;
const BACKBITE_FACTOR = 30;

// 六种糖浆（颜色 + 名称），顺序即关卡里出现的顺序
export const SYRUPS = [
  { key: 'strawberry', name: '草莓', color: 0xFF86A8, deep: 0xE95F86, light: 0xFFC2D3 },
  { key: 'mint', name: '薄荷', color: 0x63D6B4, deep: 0x35B492, light: 0xAEEBD8 },
  { key: 'lemon', name: '柠檬', color: 0xF7CE4A, deep: 0xDDA922, light: 0xFFE9A0 },
  { key: 'blueberry', name: '蓝莓', color: 0x7E9BFF, deep: 0x5474E8, light: 0xB9C8FF },
  { key: 'grape', name: '葡萄', color: 0xB98BF2, deep: 0x9762DA, light: 0xDCC4FA },
  { key: 'peach', name: '蜜桃', color: 0xFFA473, deep: 0xE97E48, light: 0xFFCBAE },
];

export function cellId(x, y) {
  return `${x},${y}`;
}

export function neighbors(x, y, w, h) {
  const out = [];
  if (x > 0) out.push({ x: x - 1, y });
  if (x < w - 1) out.push({ x: x + 1, y });
  if (y > 0) out.push({ x, y: y - 1 });
  if (y < h - 1) out.push({ x, y: y + 1 });
  return out;
}

// ──────────────── 难度 ────────────────

export function levelConfig(level = 1) {
  const lv = Math.max(1, Math.floor(level));
  let cfg;
  if (lv <= 3) cfg = { w: 6, h: 6, colors: 3 };
  else if (lv <= 8) cfg = { w: 6, h: 7, colors: 4 };
  else if (lv <= 15) cfg = { w: 7, h: 8, colors: 5 };
  else cfg = { w: 8, h: 9, colors: lv > 24 ? 6 : 5 };

  cfg.frost = lv <= 3 ? 0 : lv <= 9 ? 1 : 2;
  return cfg;
}

// ──────────────── 生成 ────────────────

// 初始蛇形路径（覆盖全盘），再用 backbite 随机化
function serpentine(w, h) {
  const cells = [];
  for (let y = 0; y < h; y++) {
    if (y % 2 === 0) {
      for (let x = 0; x < w; x++) cells.push({ x, y });
    } else {
      for (let x = w - 1; x >= 0; x--) cells.push({ x, y });
    }
  }
  return cells;
}

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

// backbite：反复「咬」路径的一端，把一段反过来，保持哈密顿路径性质
function backbite(path, w, h, rng, moves) {
  const n = path.length;
  if (n < 4) return path;

  const index = new Map(path.map((c, i) => [cellId(c.x, c.y), i]));

  for (let m = 0; m < moves; m++) {
    const fromEnd = rng() < 0.5;
    const end = fromEnd ? path[n - 1] : path[0];
    const nb = neighbors(end.x, end.y, w, h);
    const pick = nb[Math.floor(rng() * nb.length)];
    const idx = index.get(cellId(pick.x, pick.y));

    // 末端本身或本来就与末端相邻的格子无需处理
    if (fromEnd) {
      if (idx >= n - 2) continue;
      reverseRange(path, idx + 1, n - 1);
      for (let i = idx + 1; i < n; i++) index.set(cellId(path[i].x, path[i].y), i);
    } else {
      if (idx <= 1) continue;
      reverseRange(path, 0, idx - 1);
      for (let i = 0; i <= idx - 1; i++) index.set(cellId(path[i].x, path[i].y), i);
    }
  }
  return path;
}

function reverseRange(arr, from, to) {
  while (from < to) {
    const tmp = arr[from];
    arr[from] = arr[to];
    arr[to] = tmp;
    from++;
    to--;
  }
}

// 把长度 total 切成 colors 段，每段 ≥ minLen，长度尽量随机但有上下限
function randomCuts(total, colors, minLen, rng) {
  const cuts = [];
  let left = total;
  for (let i = 0; i < colors - 1; i++) {
    const remainingColors = colors - i - 1;
    const maxTake = left - remainingColors * minLen;
    // 让各段长度不至于太悬殊：目标 = 剩余 / 剩余段数，上下浮动 60%
    const target = left / (remainingColors + 1);
    const lo = Math.max(minLen, Math.round(target * 0.72));
    const hi = Math.min(maxTake, Math.round(target * 1.34));
    const take = lo >= hi ? lo : lo + Math.floor(rng() * (hi - lo + 1));
    cuts.push(take);
    left -= take;
  }
  cuts.push(left);
  return cuts;
}

function buildPaths(order, cuts) {
  const paths = [];
  let cursor = 0;
  for (let i = 0; i < cuts.length; i++) {
    const cells = order.slice(cursor, cursor + cuts[i]).map((c) => ({ x: c.x, y: c.y }));
    cursor += cuts[i];
    paths.push({
      color: i,
      cells,
      a: { ...cells[0] },
      b: { ...cells[cells.length - 1] },
    });
  }
  return paths;
}

// 结霜：给若干条管道的某一端加 1~2 层霜
function pickFrost(paths, count, rng) {
  const pool = paths.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const frost = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) {
    const p = paths[pool[i]];
    const useA = rng() < 0.5;
    const cell = useA ? p.a : p.b;
    frost.push({
      color: p.color,
      end: useA ? 'a' : 'b',
      cell: { x: cell.x, y: cell.y },
      layers: rng() < 0.34 ? 2 : 1,
    });
  }
  return frost;
}

// 在结霜限制下推演一个合法落笔顺序；返回顺序数组或 null
export function solveOrder(paths, frost = []) {
  const layers = frost.map((f) => ({ ...f, cell: { ...f.cell } }));
  const filled = new Set();
  const drawn = new Set();
  const order = [];

  for (const f of layers) filled.delete(cellId(f.cell.x, f.cell.y));

  const isBlocked = (path) => layers.some((f) => f.color === path.color && f.layers > 0);

  let progress = true;
  while (progress && drawn.size < paths.length) {
    progress = false;
    for (let i = 0; i < paths.length; i++) {
      if (drawn.has(i)) continue;
      const path = paths[i];
      if (isBlocked(path)) continue;

      drawn.add(i);
      order.push(i);
      progress = true;

      for (const c of path.cells) {
        filled.add(cellId(c.x, c.y));
        for (const nb of neighbors(c.x, c.y, 999, 999)) {
          const f = layers.find((f2) => f2.layers > 0 && sameCell(f2.cell, nb));
          if (f) f.layers -= 1;
        }
      }
    }
  }
  return drawn.size === paths.length ? order : null;
}

function tryGenerate(rng, cfg) {
  const { w, h, colors, frost: frostCount = 0 } = cfg;
  if (colors * MIN_LEN > w * h) return null;

  const total = w * h;
  const order = serpentine(w, h);
  backbite(order, w, h, rng, total * BACKBITE_FACTOR);

  const cuts = randomCuts(total, colors, MIN_LEN, rng);
  const paths = buildPaths(order, cuts);

  let frost = frostCount > 0 ? pickFrost(paths, frostCount, rng) : [];

  // 结霜不能导致无解：逐级降级（少一层 → 去掉结霜）
  if (frost.length && !solveOrder(paths, frost)) {
    frost = frost.map((f) => ({ ...f, layers: 1 }));
    if (!solveOrder(paths, frost)) {
      frost = frost.slice(0, Math.max(0, frost.length - 1));
      if (frost.length && !solveOrder(paths, frost)) frost = [];
    }
  }

  return {
    w,
    h,
    colors,
    paths,
    frost,
    order: null,
  };
}

// 兜底：纯蛇形切割（永远不会失败）
function fallbackPuzzle(cfg) {
  const { w, h, colors } = cfg;
  const total = w * h;
  const order = serpentine(w, h);
  const base = Math.floor(total / colors);
  const cuts = [];
  let left = total;
  for (let i = 0; i < colors - 1; i++) {
    cuts.push(base);
    left -= base;
  }
  cuts.push(left);
  return { w, h, colors, paths: buildPaths(order, cuts), frost: [], order: null };
}

export function generatePuzzle(seed, options = {}) {
  const cfg = { ...levelConfig(options.level ?? 1), ...options };
  const rng = makeRng((seed >>> 0) || 1);
  for (let attempt = 0; attempt < 80; attempt++) {
    const p = tryGenerate(rng, cfg);
    if (p && validatePuzzle(p).ok && solveOrder(p.paths, p.frost)) return p;
  }
  return fallbackPuzzle(cfg);
}

// ──────────────── 校验 ────────────────

export function validatePuzzle(p) {
  const errors = [];
  const { w, h, paths } = p;
  const seen = new Set();

  for (const path of paths) {
    if (path.cells.length < MIN_LEN) errors.push(`path ${path.color} too short`);
    for (let i = 0; i < path.cells.length; i++) {
      const c = path.cells[i];
      if (c.x < 0 || c.x >= w || c.y < 0 || c.y >= h) errors.push(`cell out of bounds ${c.x},${c.y}`);
      const id = cellId(c.x, c.y);
      if (seen.has(id)) errors.push(`cell reused ${id}`);
      seen.add(id);
      if (i > 0) {
        const prev = path.cells[i - 1];
        if (Math.abs(prev.x - c.x) + Math.abs(prev.y - c.y) !== 1) {
          errors.push(`path ${path.color} not contiguous at ${id}`);
        }
      }
    }
  }

  if (seen.size !== w * h) errors.push(`coverage ${seen.size}/${w * h}`);

  return { ok: errors.length === 0, errors };
}

// 全部格子填满 + 每种颜色首尾相连
export function isSolved(p, fill) {
  if (fill.size !== p.w * p.h) return false;
  for (const path of p.paths) {
    for (const c of path.cells) {
      if (fill.get(cellId(c.x, c.y)) !== path.color) return false;
    }
  }
  return true;
}

// 某格是否在已画路径里
export function fillOf(fill, cell) {
  return fill.get(cellId(cell.x, cell.y));
}

export function puzzleSummary(p) {
  return {
    size: `${p.w}x${p.h}`,
    colors: p.paths.length,
    lengths: p.paths.map((x) => x.cells.length),
    frost: p.frost.map((f) => `${SYRUPS[f.color].name}@${f.cell.x},${f.cell.y}:${f.layers}`),
  };
}
