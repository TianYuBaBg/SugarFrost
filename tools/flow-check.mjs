// 《糖浆管道》浏览器端实测（puppeteer）
//
//   node tools/serve.mjs &        # 或 npm start
//   node tools/flow-check.mjs
//
// 做四件事：
//   1. 打开第 1 关，按生成器给出的解序拖拽通关，断言状态与截图
//   2. 打开第 12 关（带霜），点被冰封的端点，断言点不动
//   3. 点「重来」，断言局面被清空
//   4. 收集 console 错误

import puppeteer from 'puppeteer-core';
import { solveOrder } from '../js/core/flow.js';

const URL_BASE = process.env.FLOW_URL || 'http://127.0.0.1:8123';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = '.tmp';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readState(page) {
  return page.evaluate(() => {
    const s = window.__flow;
    if (!s) return null;
    return {
      status: s.status,
      level: s.level,
      cell: s.cell,
      boardX: s.boardX,
      boardY: s.boardY,
      uiScale: s.uiScale,
      offsetY: s.offsetY,
      w: s.w,
      h: s.h,
      completed: [...s.completed],
      fillSize: s.fill.size,
      frost: s.frost.map((f) => ({ color: f.color, x: f.cell.x, y: f.cell.y, layers: f.layers })),
      paths: s.puzzle.paths.map((p) => ({ color: p.color, cells: p.cells })),
    };
  });
}

function toCss(state, cell) {
  const dpr = 2;
  return {
    x: ((state.boardX + cell.x * state.cell + state.cell / 2) * state.uiScale) / dpr,
    y: ((state.boardY + cell.y * state.cell + state.cell / 2) * state.uiScale + state.offsetY) / dpr,
  };
}

async function dragPath(page, state, cells) {
  const start = toCss(state, cells[0]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i < cells.length; i++) {
    const p = toCss(state, cells[i]);
    await page.mouse.move(p.x, p.y);
    await sleep(8);
  }
  await page.mouse.up();
  await sleep(40);
}

async function main() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(String(err)));

  // ── 1. 第 1 关：按解序拖拽通关 ──
  await page.goto(`${URL_BASE}/flow.html?level=1&seed=20261108`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__flow && window.__flow.status === 'playing', { timeout: 8000 });
  await sleep(300);
  await page.screenshot({ path: `${SHOT_DIR}/flow-start.png` });

  let state = await readState(page);
  console.log('L1', { w: state.w, h: state.h, colors: state.paths.length, frost: state.frost.length, cell: state.cell });

  const order = solveOrder(state.paths, state.frost);
  if (!order) throw new Error('生成器没给出解序');

  for (const idx of order) {
    const color = state.paths[idx].color;
    await dragPath(page, state, state.paths[idx].cells);
    const done = await page.evaluate((c) => window.__flow.completed.has(c), color);
    if (!done) throw new Error(`颜色 ${color} 拖完没有连通`);
  }

  await sleep(600);
  state = await readState(page);
  console.log('after solve', { status: state.status, fill: state.fillSize, completed: state.completed.length });
  if (state.status !== 'done') throw new Error(`没过关：${state.status}`);
  await page.screenshot({ path: `${SHOT_DIR}/flow-win.png` });

  // 点「下一关」 → 应进入第 2 关
  const nextBtn = await page.evaluate(() => {
    const s = window.__flow;
    const cs = s.children.list.filter((o) => o.type === 'Container' && o.depth === 9002);
    cs.sort((a, b) => a.x - b.x);
    return { x: cs[0].x / 2, y: cs[0].y / 2 };
  });
  await page.mouse.click(nextBtn.x, nextBtn.y);
  await sleep(800);
  state = await readState(page);
  console.log('next level', { level: state.level, status: state.status, fill: state.fillSize });
  if (state.level !== 2 || state.status !== 'playing' || state.fillSize !== 0) {
    throw new Error('下一关没有正确重置');
  }

  // 画一条完整路径，再点它的端点：应该被清掉
  {
    const order2 = solveOrder(state.paths, state.frost);
    const first = state.paths[order2[0]];
    await dragPath(page, state, first.cells);
    let s2 = await readState(page);
    if (!s2.completed.includes(first.color)) throw new Error('第二关第一条路径没连通');
    const tip = toCss(s2, first.cells[first.cells.length - 1]);
    await page.mouse.click(tip.x, tip.y);
    await sleep(200);
    s2 = await readState(page);
    console.log('tap completed path', { completed: s2.completed.length, fill: s2.fillSize });
    if (s2.completed.includes(first.color)) throw new Error('点已连通的端点没有清掉路径');
  }

  // ── 2. 第 12 关：冰封端点 ──
  await page.goto(`${URL_BASE}/flow.html?level=12&seed=20261108`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__flow && window.__flow.status === 'playing', { timeout: 8000 });
  await sleep(300);
  state = await readState(page);
  console.log('L12', { colors: state.paths.length, frost: state.frost });
  await page.screenshot({ path: `${SHOT_DIR}/flow-frost.png` });

  if (!state.frost.length) throw new Error('第 12 关应该有结霜');

  const frozen = state.frost[0];
  const before = state.fillSize;
  const target = toCss(state, frozen);
  await page.mouse.move(target.x, target.y);
  await page.mouse.down();
  await page.mouse.up();
  await sleep(200);
  let after = await readState(page);
  if (after.fillSize !== before) throw new Error('冰封端点居然被画上了');
  console.log('frozen click blocked: fill', before, '→', after.fillSize);

  // 找一个与冰封端点相邻、且属于别的颜色的格子，拖过去，断言解冻
  const nb = await page.evaluate(() => {
    const s = window.__flow;
    const f = s.frost.find((x) => x.layers > 0);
    if (!f) return null;
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    for (const [dx, dy] of dirs) {
      const x = f.cell.x + dx;
      const y = f.cell.y + dy;
      if (x < 0 || y < 0 || x >= s.w || y >= s.h) continue;
      const path = s.puzzle.paths.find((p) => p.cells.some((c) => c.x === x && c.y === y));
      if (path && path.color !== f.color) return { path: path.cells, x, y };
    }
    return null;
  });
  if (nb) {
    await dragPath(page, state, nb.path);
    after = await readState(page);
    const melted = after.frost.find((f) => f.x === frozen.x && f.y === frozen.y);
    console.log('heat:', frozen.layers, '→', melted ? melted.layers : 0);
    if (melted && melted.layers >= frozen.layers) throw new Error('画到旁边没有融霜');
  } else {
    console.log('heat: 跳过（这张冰封端点旁边没有别的颜色）');
  }

  // ── 3. 重来 ──
  const resetBtn = await page.evaluate(() => ({ x: window.__flow.resetBtn.x / 2, y: window.__flow.resetBtn.y / 2 }));
  await page.mouse.click(resetBtn.x, resetBtn.y);
  await sleep(400);
  after = await readState(page);
  console.log('after reset', { fill: after.fillSize, completed: after.completed.length });
  if (after.fillSize !== 0 || after.completed.length !== 0) throw new Error('重来没有清空');

  await page.screenshot({ path: `${SHOT_DIR}/flow-reset.png` });

  console.log('console errors:', errors.length);
  if (errors.length) console.log(errors.slice(0, 5).join('\n'));

  await browser.close();
  if (errors.length) process.exit(1);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
