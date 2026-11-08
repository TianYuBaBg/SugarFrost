// 糖浆管道全面自测：多点位布局、触碰输入（模拟手指）、逐关通关、冰封、存档、wx 平台分支
//
// 用法：node tools/flow-qa.mjs [--url http://127.0.0.1:8123]
import puppeteer from 'puppeteer-core';

const BASE = (() => {
  const i = process.argv.indexOf('--url');
  return i >= 0 ? process.argv[i + 1] : 'http://127.0.0.1:8123';
})();

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  —  ' + detail : ''}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function newPage(browser, { width = 390, height = 844, dpr = 2, storage = null, wx = false } = {}) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 160));
  });
  await page.setViewport({ width, height, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });

  if (wx) {
    await page.evaluateOnNewDocument(() => {
      const store = {};
      window.__wxStore = store;
      window.wx = {
        getStorageSync: (k) => (k in store ? store[k] : ''),
        setStorageSync: (k, v) => {
          store[k] = v;
        },
        removeStorageSync: (k) => {
          delete store[k];
        },
        getSystemInfoSync: () => ({
          windowWidth: 390,
          windowHeight: 844,
          pixelRatio: 2,
          platform: 'devtools',
          system: 'iOS 17.0',
          SDKVersion: '3.0.0',
          benchmarkLevel: 50,
        }),
        setKeepScreenOn: () => {},
        showShareMenu: () => {},
        onShareAppMessage: () => {},
        onShareTimeline: () => {},
        onShow: () => {},
        onError: () => {},
        getLaunchOptionsSync: () => ({ scene: 1001, query: {} }),
        onHide: () => {},
      };
      window.GameGlobal = {};
    });
  }
  if (storage) {
    await page.evaluateOnNewDocument((s) => {
      for (const [k, v] of Object.entries(s)) window.localStorage.setItem(k, v);
    }, storage);
  }
  return { page, ctx, errors };
}

async function openFlow(page, query = '') {
  await page.goto(`${BASE}/flow.html${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__flow && window.__flow.puzzle, { timeout: 15000 });
  await sleep(400);
}

const state = (page) =>
  page.evaluate(() => {
    const s = window.__flow;
    return {
      tutorial: !!s.tutorial,
      level: s.level,
      w: s.w,
      h: s.h,
      status: s.status,
      fill: s.fill.size,
      cells: s.w * s.h,
      completed: Array.from(s.completed),
      paths: s.puzzle.paths.length,
      frost: (s.frost || []).reduce((a, f) => a + f.layers, 0),
      buttons: (s.buttons || []).map((b) => ({ x: b.c.x, y: b.c.y, v: b.c.visible })),
    };
  });

// 触碰拖拽：从 cells[0] 沿路径单元格滑到最后一个（按 CSS 像素）
async function touchDragPath(page, cells) {
  const pts = await page.evaluate(
    (cs) => cs.map((c) => {
      const q = window.__flow.centerOf(c);
      return { x: q.x / window.devicePixelRatio, y: q.y / window.devicePixelRatio };
    }),
    cells,
  );
  const p0 = pts[0];
  await page.touchscreen.touchStart(p0.x, p0.y);
  await sleep(30);
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    // 每格之间插值两步，模拟真实手指速度
    for (const t of [0.5, 1]) {
      await page.touchscreen.touchMove(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      await sleep(12);
    }
  }
  await page.touchscreen.touchEnd();
  await sleep(120);
}

async function tapButton(page, index) {
  const pos = await page.evaluate((i) => {
    const vis = window.__flow.buttons.filter((b) => b.c && b.c.visible && b.c.active);
    const b = vis[i];
    if (!b) return null;
    return { x: b.c.x / window.devicePixelRatio, y: b.c.y / window.devicePixelRatio };
  }, index);
  if (!pos) return false;
  await page.touchscreen.tap(pos.x, pos.y);
  await sleep(320);
  return true;
}

async function solveLevel(page) {
  const seq = await page.evaluate(() => {
    const p = window.__flow.puzzle;
    const idx = p.order && p.order.length ? p.order : p.paths.map((_, i) => i);
    return idx.map((i) => p.paths[i].cells);
  });
  for (const cells of seq) {
    await touchDragPath(page, cells);
    await page.waitForFunction(() => !window.__flow.isAnimating || true, { timeout: 2000 }).catch(() => {});
  }
  await sleep(500);
  return state(page);
}

async function run() {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  try {
    // ---------- 1. 多种屏幕尺寸下的布局 ----------
    const sizes = [
      [360, 640, 2],
      [390, 844, 2],
      [412, 915, 3],
      [430, 932, 3],
      [768, 1024, 2],
    ];
    for (const [w, h, dpr] of sizes) {
      const { page, ctx, errors } = await newPage(browser, { width: w, height: h, dpr });
      await openFlow(page);
      const st = await state(page);
      const geo = await page.evaluate(() => {
        const s = window.__flow;
        const c = s.cameras.main;
        const canvas = document.querySelector('canvas');
        const r = canvas.getBoundingClientRect();
        return {
          rect: [Math.round(r.width), Math.round(r.height)],
          cam: [c.width, c.height],
          board: { x: s.boardX, y: s.boardY, w: s.cell * s.w, h: s.cell * s.h },
          offsetY: s.offsetY,
          uiScale: s.uiScale,
        };
      });
      const fitsX = geo.board.x >= 0 && geo.board.x + geo.board.w <= geo.cam[0];
      const boardTop = (geo.board.y * geo.uiScale + geo.offsetY) / dpr;
      const boardBottom = ((geo.board.y + geo.board.h) * geo.uiScale + geo.offsetY) / dpr;
      check(
        `布局 ${w}×${h}@${dpr}：棋盘完整在屏内`,
        fitsX && boardTop >= 0 && boardBottom <= h,
        `board ${Math.round(boardTop)}–${Math.round(boardBottom)} / 屏高 ${h}，canvas ${geo.rect.join('×')}`,
      );
      check(`布局 ${w}×${h}@${dpr}：无报错`, errors.length === 0, errors[0] || '');
      check(`布局 ${w}×${h}@${dpr}：新访客进演示关`, st.tutorial && st.w === 4, `tutorial=${st.tutorial} ${st.w}×${st.h}`);
      await page.screenshot({ path: `.tmp/qa-${w}x${h}.png` });
      await ctx.close();
    }

    // ---------- 2. 新手演示：触碰拖两条线 → 点金色按钮 ----------
    {
      const { page, ctx, errors } = await newPage(browser);
      await openFlow(page);
      const first = await state(page);
      const visibleFirst = first.buttons.filter((b) => b.v).length;
      check('演示关：只有「跳过演示」可点（撤销/重来隐藏）', visibleFirst === 1, JSON.stringify(first.buttons));

      const paths = await page.evaluate(() => window.__flow.puzzle.paths.map((p) => p.cells));
      await touchDragPath(page, paths[0]);
      const mid = await state(page);
      check('演示关：第一条线拖动成功', mid.completed.length === 1, `completed=${mid.completed}`);

      await touchDragPath(page, paths[1]);
      const done = await state(page);
      check('演示关：两条线都通且弹面板', done.completed.length === 2, `completed=${done.completed}`);
      const btnCount = await page.evaluate(() => window.__flow.buttons.filter((b) => b.c && b.c.visible).length);
      check('演示关：出现「开始第 1 关」按钮', btnCount === 1, `buttons=${btnCount}`);
      await page.screenshot({ path: '.tmp/qa-tutorial-done.png' });

      await tapButton(page, 0);
      await sleep(600);
      const after = await state(page);
      check('演示关：点「开始第 1 关」进入第 1 关', !after.tutorial && after.level === 1, `tutorial=${after.tutorial} level=${after.level}`);
      check('演示关：无报错', errors.length === 0, errors[0] || '');
      await ctx.close();
    }

    // ---------- 3. 逐关通关（触碰输入）+ 下一关 + 存档 ----------
    {
      const levels = [1, 5, 9, 12, 16, 18, 24, 25, 31, 40];
      const { page, ctx, errors } = await newPage(browser);
      for (const lv of levels) {
        await openFlow(page, `?level=${lv}&seed=20261108`);
        const before = await state(page);
        const solved = await solveLevel(page);
        const expectFrost = before.frost;
        check(
          `第 ${lv} 关：${before.w}×${before.h} / ${before.paths} 条路径全部拖通`,
          solved.completed.length === before.paths && solved.fill === solved.cells,
          `完成 ${solved.completed.length}/${before.paths}，格子 ${solved.fill}/${solved.cells}`,
        );
        check(`第 ${lv} 关：判定通关`, solved.status === 'done', `status=${solved.status}`);
        if (expectFrost > 0) {
          check(`第 ${lv} 关：冰封被融化`, solved.frost < expectFrost, `冰封 ${expectFrost} → ${solved.frost}`);
        }
        if (lv === 12) await page.screenshot({ path: '.tmp/qa-level12-done.png' });
      }
      check('逐关通关：无报错', errors.length === 0, errors[0] || '');
      await ctx.close();
    }

    // ---------- 4. 通关后点「下一关」 ----------
    {
      const { page, ctx } = await newPage(browser);
      await openFlow(page, '?level=3&seed=7');
      await solveLevel(page);
      await tapButton(page, 0); // 下一关
      await sleep(700);
      const next = await state(page);
      check('结算面板：点「下一关」进入第 4 关', next.level === 4 && next.fill === 0, `level=${next.level} fill=${next.fill}`);
      await ctx.close();
    }

    // ---------- 5. 存档：通关后重开直接续关 ----------
    {
      const { page, ctx } = await newPage(browser);
      await openFlow(page, '?level=2&seed=11');
      await solveLevel(page);
      await tapButton(page, 0); // 下一关 → 第 3 关
      const stored = await page.evaluate(() => window.localStorage.getItem('sugarfrost.flow.level'));
      await page.goto(`${BASE}/flow.html`, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__flow && window.__flow.puzzle, { timeout: 15000 });
      await sleep(400);
      const resumed = await state(page);
      check('存档：重开网页续到上次的关卡', !resumed.tutorial && resumed.level === 3, `storage=${stored} level=${resumed.level}`);
      await ctx.close();
    }

    // ---------- 6. 冰封端点：点它不动，画旁边才化 ----------
    {
      const { page, ctx } = await newPage(browser);
      await openFlow(page, '?level=12&seed=20261108');
      const info = await page.evaluate(() => {
        const s = window.__flow;
        const f = s.frost[0];
        const q = s.centerOf(f.cell);
        return { cell: f.cell, x: q.x / window.devicePixelRatio, y: q.y / window.devicePixelRatio, frost: s.frost.reduce((a, x) => a + x.layers, 0) };
      });
      await page.touchscreen.tap(info.x, info.y);
      await sleep(320);
      const afterTap = await state(page);
      check('冰封端点：点击不落子', afterTap.fill === 0 && afterTap.frost === info.frost, `fill=${afterTap.fill} frost=${afterTap.frost}`);
      await ctx.close();
    }

    // ---------- 7. 撤销 / 重来 ----------
    {
      const { page, ctx } = await newPage(browser);
      await openFlow(page, '?level=1&seed=20261108');
      const paths = await page.evaluate(() => window.__flow.puzzle.paths.map((p) => p.cells));
      await touchDragPath(page, paths[0]);
      const afterOne = await state(page);
      check('撤销前：已画 1 条', afterOne.completed.length === 1, `completed=${afterOne.completed}`);
      await tapButton(page, 1); // 撤销
      const afterUndo = await state(page);
      check('撤销：清掉最后一条未完成路径', afterUndo.completed.length === 0, `completed=${afterUndo.completed}`);
      await touchDragPath(page, paths[0]);
      await tapButton(page, 2); // 重来
      const afterReset = await state(page);
      check('重来：清空全部', afterReset.fill === 0 && afterReset.completed.length === 0, `fill=${afterReset.fill}`);
      await ctx.close();
    }

    // ---------- 8. wx 平台分支（伪 wx：视口 + 存档都走 wx API） ----------
    {
      const { page, ctx, errors } = await newPage(browser, { wx: true });
      await openFlow(page, '?level=1&seed=20261108');
      const geo = await page.evaluate(() => ({
        isWx: window.__flow && window.__flow.sys ? true : false,
        dpr: window.devicePixelRatio,
        canvas: (() => {
          const r = document.querySelector('canvas').getBoundingClientRect();
          return [Math.round(r.width), Math.round(r.height)];
        })(),
        lsLevel: window.localStorage.getItem('sugarfrost.flow.level'),
      }));
      check('wx 分支：canvas 尺寸跟随视口', geo.canvas[0] === 390 && geo.canvas[1] === 844, geo.canvas.join('×'));
      await page.evaluate(() => {
        const s = window.__flow;
        s.saveLevel(9);
      });
      const store = await page.evaluate(() => ({ wx: window.__wxStore, ls: window.localStorage.getItem('sugarfrost.flow.level') }));
      check('wx 分支：存档写入 wx storage 而不是 localStorage', !!store.wx['sugarfrost.flow.level'] && store.ls === null, JSON.stringify(store.wx));
      check('wx 分支：无报错', errors.length === 0, errors[0] || '');
      await ctx.close();
    }
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 通过`);
  if (failed.length) {
    console.log('失败项：');
    for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
    process.exitCode = 1;
  }
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
