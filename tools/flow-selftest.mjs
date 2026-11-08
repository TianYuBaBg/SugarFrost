// 《糖浆管道》纯逻辑自测（node 直接跑，不需要浏览器）
//
//   node tools/flow-selftest.mjs
//
// 覆盖：生成合法性、每关有解、结霜可解、确定性、解题顺序推演、胜利判定。

import {
  generatePuzzle,
  validatePuzzle,
  solveOrder,
  isSolved,
  levelConfig,
  cellId,
  neighbors,
  MIN_LEN,
} from '../js/core/flow.js';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, extra = '') {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name}${extra ? ` — ${extra}` : ''}`);
  }
}

// ── 1. 生成合法性 ──
const LEVELS = [1, 2, 3, 5, 9, 12, 16, 20, 25, 30];
for (const level of LEVELS) {
  for (let seed = 1; seed <= 20; seed++) {
    const p = generatePuzzle(level * 100 + seed, { level });
    const v = validatePuzzle(p);
    check(`L${level} S${seed} 合法`, v.ok, v.errors.slice(0, 2).join(';'));
    check(`L${level} S${seed} 颜色数`, p.paths.length === p.colors, `${p.paths.length} vs ${p.colors}`);
    check(`L${level} S${seed} 每段≥${MIN_LEN}`, p.paths.every((x) => x.cells.length >= MIN_LEN));
    check(`L${level} S${seed} 覆盖全盘`, new Set(p.paths.flatMap((x) => x.cells.map((c) => cellId(c.x, c.y)))).size === p.w * p.h);
    check(`L${level} S${seed} 端点成对`, p.paths.every((x) => x.a.x !== x.b.x || x.a.y !== x.b.y));
    check(`L${level} S${seed} 有解`, !!solveOrder(p.paths, p.frost));
  }
}

// ── 2. 结霜规则 ──
const withFrost = generatePuzzle(4242, { level: 12 });
check('高关卡会结霜', withFrost.frost.length > 0, JSON.stringify(withFrost.frost));
check('结霜至少 1 层', withFrost.frost.every((f) => f.layers >= 1 && f.layers <= 3));
check('结霜落在端点上', withFrost.frost.every((f) => withFrost.paths.some(
  (p) => p.color === f.color && ((p.a.x === f.cell.x && p.a.y === f.cell.y) || (p.b.x === f.cell.x && p.b.y === f.cell.y)),
)));
check('结霜关卡仍可解', !!solveOrder(withFrost.paths, withFrost.frost));

// ── 3. 解题顺序推演：按顺序落笔时，每一步都必须已经解冻 ──
{
  let ok = true;
  for (let seed = 1; seed <= 12; seed++) {
    const p = generatePuzzle(90000 + seed, { level: 16 });
    const order = solveOrder(p.paths, p.frost);
    if (!order) { ok = false; break; }

    // 复制一份霜层，按顺序推演
    const layers = p.frost.map((f) => ({ ...f, cell: { ...f.cell } }));
    const filled = new Set();
    for (const idx of order) {
      const path = p.paths[idx];
      if (layers.some((f) => f.color === path.color && f.layers > 0)) { ok = false; break; }
      for (const c of path.cells) {
        filled.add(cellId(c.x, c.y));
        for (const nb of neighbors(c.x, c.y, p.w, p.h)) {
          const f = layers.find((f2) => f2.layers > 0 && f2.cell.x === nb.x && f2.cell.y === nb.y);
          if (f) f.layers -= 1;
        }
      }
    }
    if (filled.size !== p.w * p.h) ok = false;
  }
  check('按解题顺序可以真的走完', ok);
}

// ── 4. 确定性 ──
{
  const a = generatePuzzle(777, { level: 5 });
  const b = generatePuzzle(777, { level: 5 });
  check('同 seed 同关卡结果一致', JSON.stringify(a) === JSON.stringify(b));
  const c = generatePuzzle(778, { level: 5 });
  check('不同 seed 结果不同', JSON.stringify(a) !== JSON.stringify(c));
}

// ── 5. 难度配置 ──
{
  check('L1 是 6x6 三色', levelConfig(1).w === 6 && levelConfig(1).colors === 3);
  check('L1 不结霜', levelConfig(1).frost === 0);
  check('L6 开始结霜', levelConfig(6).frost === 1);
  check('L12 结霜两张', levelConfig(12).frost === 2);
  check('L30 六色', levelConfig(30).colors === 6);
  let monotonic = true;
  for (let lv = 2; lv <= 30; lv++) {
    const prev = levelConfig(lv - 1);
    const cur = levelConfig(lv);
    if (cur.w * cur.h < prev.w * prev.h) monotonic = false;
    if (cur.colors < prev.colors) monotonic = false;
  }
  check('棋盘/颜色数不退化', monotonic);
}

// ── 6. 胜利判定 ──
{
  const p = generatePuzzle(31337, { level: 3 });
  const fill = new Map();
  for (const path of p.paths) for (const c of path.cells) fill.set(cellId(c.x, c.y), path.color);
  check('铺满即胜利', isSolved(p, fill));

  const missing = new Map(fill);
  const anyCell = p.paths[0].cells[0];
  missing.delete(cellId(anyCell.x, anyCell.y));
  check('缺一格不算胜利', !isSolved(p, missing));

  const wrong = new Map(fill);
  const other = (p.paths[0].color + 1) % p.colors;
  wrong.set(cellId(anyCell.x, anyCell.y), other);
  check('颜色错不算胜利', !isSolved(p, wrong));
}

// ── 输出 ──
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) {
  for (const f of failures.slice(0, 20)) console.log('  ✗', f);
  process.exit(1);
}
