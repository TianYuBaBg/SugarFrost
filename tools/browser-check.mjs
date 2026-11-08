// 浏览器冒烟测试：真机尺寸截图 + 点牌交互验证
//   node tools/browser-check.mjs [url]
import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';

const URL = process.argv[2] || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const OUT = '.tmp';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('canvas'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 1800));

const metrics = await page.evaluate(() => {
  const c = document.querySelector('canvas');
  const r = c.getBoundingClientRect();
  return {
    inner: [window.innerWidth, window.innerHeight],
    dpr: window.devicePixelRatio,
    buffer: [c.width, c.height],
    rect: [r.left, r.top, r.width, r.height],
  };
});
console.log('metrics', metrics);

await page.screenshot({ path: `${OUT}/start.png` });

// 读取场景状态（Phaser 挂到 window 上方便测试）
const state = await page.evaluate(() => {
  const game = window.__game;
  if (!game) return null;
  const scene = game.scene.getScene('GameScene');
  const cards = scene.cards.filter((c) => c.state === 'on_pile');
  return {
    remaining: cards.length,
    unlocked: cards.filter((c) => c.unlocked).length,
    slot: scene.slot.length,
    uiScale: scene.uiScale,
    sample: cards.filter((c) => c.unlocked).slice(0, 6).map((c) => ({
      id: c.id, x: c.sprite.x, y: c.sprite.y,
    })),
  };
});
console.log('state', state);

// 点三张同类型的可点牌（模拟真实点击）
let clicks = 0;
for (let round = 0; round < 6 && state && state.sample.length; round++) {
  const s = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('GameScene');
    if (scene.status !== 'playing' || scene.isAnimating) return null;
    const pool = scene.cards.filter((c) => c.state === 'on_pile' && c.unlocked);
    if (!pool.length) return null;
    // 优先选槽里已有同类的牌
    const cnt = new Map();
    for (const c of scene.slot) cnt.set(c.type, (cnt.get(c.type) || 0) + 1);
    pool.sort((a, b) => (cnt.get(b.type) || 0) - (cnt.get(a.type) || 0));
    const c = pool[0];
    return { id: c.id, x: c.sprite.x, y: c.sprite.y, type: c.type };
  });
  if (!s) break;
  await page.mouse.click(s.x / 2, s.y / 2); // buffer px → CSS px（dpr=2）
  clicks++;
  await new Promise((r) => setTimeout(r, 1100));
  await page.screenshot({ path: `${OUT}/after-${clicks}.png` });
}

const after = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('GameScene');
  return {
    status: scene.status,
    remaining: scene.cards.filter((c) => c.state === 'on_pile').length,
    slot: scene.slot.map((c) => c.type),
    triples: scene.triplesCleared,
  };
});
console.log('after', clicks, 'clicks →', after);

// ── 阶段 2：只剩最后 3 张，点完必须出现胜利结算 ──
await page.evaluate(() => window.__game.scene.getScene('GameScene').restartGame());
await new Promise((r) => setTimeout(r, 1400));

const lastThree = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('GameScene');
  const keep = new Set(scene.level.solution.slice(-3));
  for (const c of scene.cards) {
    if (keep.has(c.id)) continue;
    c.state = 'removed';
    if (c.sprite) c.sprite.destroy();
    c.sprite = null;
    if (c.frost) c.frost.destroy();
    c.frost = null;
  }
  scene.recomputeAll();
  scene.refreshHUD();
  // 按解序排列：最后一张在解序里最晚，才是压在最上面的那张
  return scene.level.solution.slice(-3)
    .map((cid) => scene.cards.find((c) => c.id === cid))
    .map((c) => ({ id: c.id, type: c.type, unlocked: c.unlocked }));
});
console.log('win-test cards', lastThree);

for (const target of lastThree) {
  const pos = await page.evaluate((id) => {
    const scene = window.__game.scene.getScene('GameScene');
    const c = scene.cards.find((x) => x.id === id);
    return c && c.sprite ? { x: c.sprite.x, y: c.sprite.y, unlocked: c.unlocked } : null;
  }, target.id);
  if (!pos) continue;
  await page.mouse.click(pos.x / 2, pos.y / 2);
  await new Promise((r) => setTimeout(r, 1200));
}
const winState = await page.evaluate(() => {
  const s = window.__game.scene.getScene('GameScene');
  return { status: s.status, remaining: s.cards.filter((c) => c.state === 'on_pile').length, triples: s.triplesCleared };
});
console.log('win state', winState);
await page.screenshot({ path: `${OUT}/win.png` });

// ── 阶段 3：点满 7 格不同类 → 失败结算 ──
await page.evaluate(() => window.__game.scene.getScene('GameScene').restartGame());
await new Promise((r) => setTimeout(r, 1400));

const losePlan = await page.evaluate(() => {
  const scene = window.__game.scene.getScene('GameScene');
  const pool = scene.cards.filter((c) => c.state === 'on_pile' && c.unlocked);
  const byType = new Map();
  for (const c of pool) {
    if (!byType.has(c.type)) byType.set(c.type, []);
    byType.get(c.type).push(c);
  }
  // 每类只取 1 张，凑 7 类，保证不会凑成三连
  const picked = [];
  for (const [, list] of byType) {
    if (picked.length >= 7) break;
    picked.push(list[0]);
  }
  return picked.map((c) => ({ id: c.id, type: c.type, x: c.sprite.x, y: c.sprite.y }));
});
console.log('lose-test picks', losePlan.length, 'distinct types');

for (const p of losePlan) {
  const pos = await page.evaluate((id) => {
    const scene = window.__game.scene.getScene('GameScene');
    const c = scene.cards.find((x) => x.id === id);
    return c && c.sprite ? { x: c.sprite.x, y: c.sprite.y, unlocked: c.unlocked } : null;
  }, p.id);
  if (!pos || !pos.unlocked) continue;
  await page.mouse.click(pos.x / 2, pos.y / 2);
  await new Promise((r) => setTimeout(r, 1100));
}
const loseState = await page.evaluate(() => {
  const s = window.__game.scene.getScene('GameScene');
  return { status: s.status, slot: s.slot.length };
});
console.log('lose state', loseState);
await page.screenshot({ path: `${OUT}/lose.png` });

// ── 阶段 4：重开按钮是否把状态清干净 ──
const restarted = await page.evaluate(() => {
  const s = window.__game.scene.getScene('GameScene');
  s.restartGame();
  return true;
});
await new Promise((r) => setTimeout(r, 1500));
const freshState = await page.evaluate(() => {
  const s = window.__game.scene.getScene('GameScene');
  return {
    status: s.status,
    remaining: s.cards.filter((c) => c.state === 'on_pile').length,
    slot: s.slot.length,
    triples: s.triplesCleared,
  };
});
console.log('restart state', freshState);
await page.screenshot({ path: `${OUT}/restart.png` });

writeFileSync(`${OUT}/console.log`, logs.join('\n'));
const errors = logs.filter((l) => l.includes('pageerror') || l.includes('[error]'));
console.log(`console lines: ${logs.length}, errors: ${errors.length}`);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
process.exit(errors.length ? 1 : 0);
