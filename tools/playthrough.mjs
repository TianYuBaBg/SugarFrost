// 全流程通关测试：照着生成器给的解序真实点击，验证一局能从 108 张清到 0
//   node tools/playthrough.mjs [url]
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] || 'http://127.0.0.1:8123/';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
});

const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__game && window.__game.scene.getScene('GameScene')?.cards?.length, { timeout: 15000 });
await new Promise((r) => setTimeout(r, 1200));

const solution = await page.evaluate(() =>
  window.__game.scene.getScene('GameScene').level.solution.slice(),
);
console.log(`solution length: ${solution.length}`);

const started = Date.now();
let clicked = 0;

// 找到目标卡上「没有被更高层牌盖住」的点，模拟真人找空位点击
const FIND_POINT = `
  (cardId) => {
    const scene = window.__game.scene.getScene('GameScene');
    const c = scene.cards.find((x) => x.id === cardId);
    if (!c || !c.sprite) return null;
    if (!c.unlocked) return { locked: true, id: cardId };
    const wrap = c.sprite;
    const w = wrap.width, h = wrap.height;
    const m = wrap.getWorldTransformMatrix();
    const others = scene.cards.filter((x) => x.state === 'on_pile' && x.sprite && x.id !== c.id);
    const candidates = [[0,0],[0.25,0.25],[-0.25,0.25],[0.25,-0.25],[-0.25,-0.25],[0.3,0],[0,-0.3],[0,0.3],[-0.3,0],[0.12,0.12],[-0.12,-0.12]];
    for (const [ux, uy] of candidates) {
      const p = m.transformPoint(ux * w, uy * h);
      const blocked = others.some((o) => {
        if (o.sprite.depth <= wrap.depth) return false;
        const lp = o.sprite.getWorldTransformMatrix().applyInverse(p.x, p.y);
        return Math.abs(lp.x) <= o.sprite.width * 0.5 && Math.abs(lp.y) <= o.sprite.height * 0.5;
      });
      if (!blocked) return { x: p.x, y: p.y, type: c.type };
    }
    return { noVisiblePoint: true, id: cardId };
  }
`;

for (const id of solution) {
  const pos = await page.evaluate(async (cardId, fn) => {
    const scene = window.__game.scene.getScene('GameScene');
    for (let i = 0; i < 200 && (scene.isAnimating || scene.status !== 'playing'); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return new Function('cardId', `return (${fn})(cardId)`)(cardId);
  }, id, FIND_POINT);

  if (!pos) throw new Error(`card ${id} disappeared before its turn`);
  if (pos.locked) throw new Error(`card ${id} locked at its turn`);
  if (pos.noVisiblePoint) throw new Error(`card ${id} has no visible point`);

  await page.mouse.click(pos.x / 2, pos.y / 2);
  clicked++;

  // 等这个点击真的被场景接收（避免鼠标事件还没被 Phaser 处理就点下一张）
  const accepted = await page.evaluate(async (cardId) => {
    const s = window.__game.scene.getScene('GameScene');
    for (let i = 0; i < 40; i++) {
      const c = s.cards.find((x) => x.id === cardId);
      if (c.state !== 'on_pile') return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return false;
  }, id);
  if (!accepted) {
    const info = await page.evaluate((px, py) => {
      const s = window.__game.scene.getScene('GameScene');
      const ptr = new Phaser.Input.Pointer(s.input.manager, 0, px, py);
      const hits = s.input.manager.hitTest(ptr, s.input.list, s.cameras.main).map((o) => ({
        depth: o.depth, x: Math.round(o.x), y: Math.round(o.y), w: Math.round(o.width),
      }));
      const containing = s.cards.filter((c) => c.sprite && c.state === 'on_pile').map((c) => {
        const lp = c.sprite.getWorldTransformMatrix().applyInverse(px, py);
        const inside = Math.abs(lp.x) <= c.sprite.width * 0.5 && Math.abs(lp.y) <= c.sprite.height * 0.5;
        return inside ? { id: c.id, depth: c.sprite.depth, unlocked: c.unlocked } : null;
      }).filter(Boolean);
      return { hits, containing, status: s.status, isAnimating: s.isAnimating };
    }, pos.x, pos.y);
    throw new Error(`click ${clicked} not accepted for card ${id} at (${pos.x.toFixed(0)},${pos.y.toFixed(0)}): ${JSON.stringify(info)}`);
  }

  // 校验：这次点击必须真的把目标牌送进槽，而不是误点到底下/上面的别的牌
  const picked = await page.evaluate((cardId) => {
    const s = window.__game.scene.getScene('GameScene');
    const target = s.cards.find((c) => c.id === cardId);
    const flying = s.cards.filter((c) => c.state === 'flying' || c.state === 'in_slot');
    return {
      targetState: target.state,
      lastSlot: s.slot.length ? s.slot[s.slot.length - 1].id : null,
      flying: flying.map((c) => c.id),
    };
  }, id);
  if (picked.targetState === 'on_pile') {
    throw new Error(`click ${clicked} missed card ${id} at (${pos.x.toFixed(0)},${pos.y.toFixed(0)}); picked=${JSON.stringify(picked)}`);
  }
  if (clicked % 25 === 0) {
    const st = await page.evaluate(() => {
      const s = window.__game.scene.getScene('GameScene');
      return { remaining: s.cards.filter((c) => c.state === 'on_pile').length, slot: s.slot.length, triples: s.triplesCleared };
    });
    console.log(`  ${clicked}/${solution.length}`, st, `${((Date.now() - started) / 1000).toFixed(1)}s`);

    // 增量遮挡 vs 全量重算对拍（等动画/结算流程跑完，否则会读到还没应用的中间态）
    const diff = await page.evaluate(async () => {
      const s = window.__game.scene.getScene('GameScene');
      for (let i = 0; i < 200 && s.isAnimating; i++) await new Promise((r) => setTimeout(r, 50));
      const before = new Map(s.cards.filter((c) => c.state === 'on_pile').map((c) => [c.id, c.unlocked]));
      s.recomputeAll();
      return s.cards.filter((c) => c.state === 'on_pile' && before.get(c.id) !== c.unlocked).map((c) => c.id);
    });
    if (diff.length) throw new Error(`incremental occlusion mismatch at click ${clicked}: ${diff.join(',')}`);
  }
}

const final = await page.evaluate(async () => {
  const s = window.__game.scene.getScene('GameScene');
  for (let i = 0; i < 100 && s.isAnimating; i++) await new Promise((r) => setTimeout(r, 50));
  return {
    status: s.status,
    remaining: s.cards.filter((c) => c.state === 'on_pile').length,
    triples: s.triplesCleared,
    slot: s.slot.length,
  };
});

await page.screenshot({ path: '.tmp/final.png' });
console.log('final', final, `${((Date.now() - started) / 1000).toFixed(1)}s`, 'errors:', errors.length);
if (errors.length) console.log(errors.join('\n'));

await browser.close();
process.exit(final.status === 'win' && final.remaining === 0 && errors.length === 0 ? 0 : 1);
