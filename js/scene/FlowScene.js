// 《糖浆管道》场景
//
// 玩法：把每种颜色的糖浆从一端连到另一端，所有格子都要被填满；
// 被霜封住的端点必须先让旁边的格子被别的糖浆填上（每填一格融一层）。
//
// 交互：按下端点（或未完成路径的末端）开始拖拽，手指划过的格子依次接上；
// 往回拖一格可以撤销一格；抬起手指提交。
// 生成器保证每关有解（先造解、再藏解），见 js/core/flow.js。

import { SYRUPS, cellId, levelConfig, generatePuzzle, isSolved, neighbors } from '../core/flow.js';
import { tutorialPuzzle } from '../core/tutorial.js';
import { bakeEnvironment, PANEL_TEX_W, PANEL_TEX_H } from '../art/EnvironmentArt.js';
import { bakeFlowTextures, syrupOf } from '../art/FlowArt.js';
import { PALETTE, hex } from '../art/palette.js';
import { WIDTH, HEIGHT } from '../viewport.js';

const LOGICAL_W = 720;
const LOGICAL_H = 1280;
const BOARD_TOP = 300;
const BOARD_MAX_H = 720;
const BOARD_MARGIN = 46;
const HUD_SAFE = 90;
const LEVEL_KEY = 'sugarfrost.flow.level';
const TUTORIAL_KEY = 'sugarfrost.flow.tutorial';

const TITLE_FONT = '"Comic Sans MS", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

export class FlowScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FlowScene' });
  }

  init(data) {
    this.uiScale = WIDTH / LOGICAL_W;
    this.offsetX = 0;
    this.offsetY = Math.max(0, (HEIGHT - LOGICAL_H * this.uiScale) / 2);
    this.startLevel = data && data.level ? data.level : null;
    this.forceTutorial = !!(data && data.tutorial);
    this.handToken = 0;
  }

  // ──────────────── 坐标 ────────────────
  s(v) { return v * this.uiScale; }
  sx(lx) { return this.offsetX + lx * this.uiScale; }
  sy(ly) { return this.offsetY + ly * this.uiScale; }

  create() {
    bakeEnvironment(this);

    const params = this.readParams();
    const saved = this.hasSavedLevel() ? (Number(this.loadLevel()) || 1) : 0;
    this.level = this.startLevel || Number(params.get('level')) || saved || 1;
    this.seedBase = Number(params.get('seed')) || 20261108;

    // 新用户（没通关记录、没指定关卡）默认先看演示
    this.tutorial = this.forceTutorial
      || params.get('tutorial') === '1'
      || (!this.startLevel && !params.get('level') && !saved && !this.tutorialDone());
    if (this.tutorial) this.level = 0;

    this.buildStatic();
    this.buildLevel();

    this.input.on('pointerdown', this.handleDown, this);
    this.input.on('pointermove', this.handleMove, this);
    this.input.on('pointerup', this.handleUp, this);
    this.input.on('pointerupoutside', this.handleUp, this);

    if (typeof window !== 'undefined') window.__flow = this;
  }

  tutorialDone() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(TUTORIAL_KEY) === '1';
    } catch (e) { /* 隐私模式忽略 */ }
    return false;
  }

  markTutorialDone() {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(TUTORIAL_KEY, '1');
    } catch (e) { /* 忽略 */ }
  }

  readParams() {
    if (typeof window !== 'undefined' && window.location && typeof URLSearchParams !== 'undefined') {
      return new URLSearchParams(window.location.search);
    }
    return new Map();
  }

  hasSavedLevel() {
    try {
      if (typeof localStorage !== 'undefined') return localStorage.getItem(LEVEL_KEY) !== null;
    } catch (e) { /* 忽略 */ }
    return false;
  }

  loadLevel() {
    try {
      if (typeof localStorage !== 'undefined') return Number(localStorage.getItem(LEVEL_KEY)) || 1;
    } catch (e) { /* 隐私模式忽略 */ }
    return 1;
  }

  saveLevel(level) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(LEVEL_KEY, String(level));
    } catch (e) { /* 忽略 */ }
  }

  // ──────────────── 静态层 ────────────────
  buildStatic() {
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'bg');
    bg.setDisplaySize(WIDTH, HEIGHT);
    bg.setDepth(-100);

    this.boardLayer = this.add.container(0, 0).setDepth(0);
    this.pipeG = this.add.graphics().setDepth(20);
  }

  buildLevel() {
    this.puzzle = this.tutorial
      ? tutorialPuzzle()
      : generatePuzzle(this.seedBase + this.level * 7919, { level: this.level });
    const p = this.puzzle;
    this.w = p.w;
    this.h = p.h;

    // 布局：格子边长取整，棋盘在可用区域居中
    const areaW = LOGICAL_W - BOARD_MARGIN * 2;
    const cell = Math.floor(Math.min(areaW / this.w, BOARD_MAX_H / this.h));
    this.cell = cell;
    const gridW = cell * this.w;
    const gridH = cell * this.h;
    this.boardX = Math.round((LOGICAL_W - gridW) / 2);
    this.boardY = Math.round(BOARD_TOP + (BOARD_MAX_H - gridH) / 2);

    const boardKey = bakeFlowTextures(this, this.w, this.h, cell);
    const pad = Math.round(cell * 0.16);
    this.boardLayer.removeAll(true);
    const board = this.add.image(
      this.sx(this.boardX + gridW / 2),
      this.sy(this.boardY + gridH / 2),
      boardKey,
    );
    board.setDisplaySize(this.s(gridW + pad * 2), this.s(gridH + pad * 2));
    this.boardLayer.add(board);

    // 端点索引
    this.endpointAt = new Map();
    for (const path of p.paths) {
      this.endpointAt.set(cellId(path.a.x, path.a.y), { color: path.color, end: 'a' });
      this.endpointAt.set(cellId(path.b.x, path.b.y), { color: path.color, end: 'b' });
    }

    // 局面
    this.strokes = new Map();
    this.completed = new Set();
    this.fill = new Map();
    this.drag = null;
    this.status = 'playing';
    this.frost = p.frost.map((f) => ({ ...f, cell: { ...f.cell } }));

    this.drawEndpoints();
    this.rebuildFrost();
    this.drawPipes();
    this.buildHUD();
    this.refreshHUD();
    if (this.tutorial) this.startTutorial();
  }

  centerOf(cell) {
    return {
      x: this.sx(this.boardX + cell.x * this.cell + this.cell / 2),
      y: this.sy(this.boardY + cell.y * this.cell + this.cell / 2),
    };
  }

  drawEndpoints() {
    if (this.endpointG) this.endpointG.destroy();
    const g = this.add.graphics().setDepth(30);
    this.endpointG = g;

    const r = this.cell * 0.26;
    for (const path of this.puzzle.paths) {
      const sy = syrupOf(path.color);
      for (const cell of [path.a, path.b]) {
        const c = this.centerOf(cell);
        g.fillStyle(PALETTE.cardShadow, 0.16);
        g.fillCircle(c.x, c.y + this.s(2), r + this.s(4));
        g.fillStyle(PALETTE.white, 0.96);
        g.fillCircle(c.x, c.y, r + this.s(3.4));
        g.lineStyle(Math.max(1, this.s(1.6)), PALETTE.cardOutline, 0.65);
        g.strokeCircle(c.x, c.y, r + this.s(3.4));
        g.fillStyle(sy.color, 1);
        g.fillCircle(c.x, c.y, r);
        g.lineStyle(Math.max(1, this.s(1.4)), sy.deep, 0.55);
        g.strokeCircle(c.x, c.y, r);
        g.fillStyle(0xffffff, 0.6);
        g.fillCircle(c.x - r * 0.32, c.y - r * 0.36, r * 0.42);
      }
    }
  }

  isFrozen(cell) {
    return this.frost.some((f) => f.layers > 0 && f.cell.x === cell.x && f.cell.y === cell.y);
  }

  frostAt(cell) {
    return this.frost.find((f) => f.cell.x === cell.x && f.cell.y === cell.y) || null;
  }

  clearFrostSprites() {
    for (const f of this.frost) {
      if (f.sprite) { f.sprite.destroy(); f.sprite = null; }
    }
  }

  rebuildFrost() {
    this.clearFrostSprites();
    for (const f of this.frost) {
      if (f.layers <= 0) continue;
      const c = this.centerOf(f.cell);
      const img = this.add.image(c.x, c.y, `flow_frost_${Math.min(3, f.layers)}`);
      img.setDisplaySize(this.s(this.cell), this.s(this.cell));
      img.setDepth(41);
      f.sprite = img;
    }
  }

  // ──────────────── 画管道 ────────────────
  drawPipes() {
    const g = this.pipeG;
    g.clear();

    const width = this.cell * 0.54;
    const r = width / 2;
    const drop = this.s(2.2);

    for (const [color, stroke] of this.strokes) {
      if (!stroke.cells.length) continue;
      const syrup = syrupOf(color);
      const pts = stroke.cells.map((c) => this.centerOf(c));

      // 投影
      const sh = pts.map((p) => ({ x: p.x, y: p.y + drop }));
      g.lineStyle(width * 1.02, syrup.deep, 0.16);
      this.strokeChain(g, sh);
      for (const p of sh) {
        g.fillStyle(syrup.deep, 0.16);
        g.fillCircle(p.x, p.y, r * 1.02);
      }

      // 主体
      g.lineStyle(width, syrup.color, 1);
      this.strokeChain(g, pts);
      for (const p of pts) {
        g.fillStyle(syrup.color, 1);
        g.fillCircle(p.x, p.y, r);
      }

      // 高光：只在左上侧一条细亮线，别盖住管道中心
      const hiW = this.cell * 0.12;
      const hi = pts.map((p) => ({ x: p.x - width * 0.24, y: p.y - width * 0.24 }));
      g.lineStyle(hiW, 0xffffff, 0.32);
      this.strokeChain(g, hi);
    }
  }

  strokeChain(g, pts) {
    if (pts.length < 2) return;
    g.beginPath();
    g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
  }

  // ──────────────── HUD ────────────────
  buildHUD() {
    const safe = this.s(HUD_SAFE);
    const items = [];

    this.title = this.add.text(WIDTH / 2, safe + this.s(34), '糖浆管道', {
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(this.s(50))}px`,
      fontStyle: 'bold',
      color: hex(PALETTE.white),
      stroke: hex(PALETTE.ink),
      strokeThickness: Math.max(2, Math.round(this.s(8))),
      shadow: { offsetX: 0, offsetY: this.s(4), color: 'rgba(120,60,90,0.32)', blur: this.s(9), fill: true },
    }).setOrigin(0.5).setDepth(80);
    items.push(this.title);

    this.statusText = this.add.text(WIDTH / 2, safe + this.s(84), '', {
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(this.s(24))}px`,
      fontStyle: 'bold',
      color: hex(PALETTE.ink),
      backgroundColor: 'rgba(255,255,255,0.55)',
      padding: { x: this.s(14), y: this.s(5) },
    }).setOrigin(0.5).setDepth(80);
    items.push(this.statusText);

    this.hintText = this.add.text(
      WIDTH / 2,
      safe + this.s(118),
      this.tutorial ? '演示关：跟着白圈拖一次就会了' : '从端点拖到另一端 · 填满所有格子',
      {
        fontFamily: TITLE_FONT,
        fontSize: `${Math.round(this.s(19))}px`,
        color: hex(PALETTE.inkSoft),
      },
    ).setOrigin(0.5).setDepth(80);
    items.push(this.hintText);

    this.hudItems = items;
    this.buildBottomBar();
    this.buildCornerButton();
  }

  buildCornerButton() {
    const label = this.tutorial ? '跳过演示' : '看演示';
    const x = WIDTH - this.s(84);
    const y = this.sy(HUD_SAFE + 6);
    const c = this.add.container(x, y).setDepth(85);
    const w = this.s(120);
    const h = this.s(46);
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.white, 0.62);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    const txt = this.add.text(0, 0, label, {
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(this.s(19))}px`,
      color: hex(PALETTE.inkSoft),
    }).setOrigin(0.5);
    c.add([bg, txt]);
    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    c.on('pointerdown', (pointer, px, py, event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      if (this.tutorial) this.leaveTutorial();
      else this.scene.restart({ tutorial: true });
    });
    this.cornerBtn = c;
  }

  buildBottomBar() {
    const y = this.sy(1188);
    const makeButton = (lx, label, onClick) => {
      const c = this.add.container(this.sx(lx), y).setDepth(80);
      const w = this.s(170);
      const h = this.s(62);
      const bg = this.add.graphics();
      bg.fillStyle(PALETTE.white, 0.85);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      bg.lineStyle(Math.max(1, this.s(1.6)), PALETTE.cardOutline, 0.65);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      const txt = this.add.text(0, 0, label, {
        fontFamily: TITLE_FONT,
        fontSize: `${Math.round(this.s(26))}px`,
        fontStyle: 'bold',
        color: hex(PALETTE.ink),
      }).setOrigin(0.5);
      c.add([bg, txt]);
      c.setSize(w, h);
      c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', (pointer, x, y2, event) => {
        if (event && event.stopPropagation) event.stopPropagation();
        onClick();
      });
      return c;
    };

    this.undoBtn = makeButton(180, '撤销', () => this.undo());
    this.resetBtn = makeButton(540, '重来', () => this.resetLevel());
    this.barItems = [this.undoBtn, this.resetBtn];
  }

  refreshHUD() {
    if (!this.statusText) return;
    const done = this.completed.size;
    const total = this.puzzle.paths.length;
    if (this.tutorial) {
      this.statusText.setText(`新手演示 · 已连通 ${done}/${total}`);
      return;
    }
    const frozen = this.frost.filter((f) => f.layers > 0).length;
    this.statusText.setText(
      `第 ${this.level} 关 · 已连通 ${done}/${total}${frozen ? ` · 冰封 ${frozen}` : ''}`,
    );
  }

  // ──────────────── 新手演示 ────────────────
  startTutorial() {
    if (this.barItems) this.barItems.forEach((o) => o.setVisible(false));
    this.showBubble('按住粉色圆点，一路拖到底');
    this.guideNext();
  }

  guideNext() {
    if (this.drag) return; // 玩家正在拖时别让手圈来抢戏
    const next = this.puzzle.paths.find((p) => !this.completed.has(p.color));
    if (!next) return;
    this.playHand(next.color, next.cells.slice(0, 6));
  }

  playHand(color, cells) {
    this.stopHand();
    if (!cells.length) return;
    const token = this.handToken;
    const pts = cells.map((c) => this.centerOf(c));
    const hand = this.add.container(pts[0].x, pts[0].y).setDepth(210);
    const g = this.add.graphics();
    const r = this.s(26);
    g.fillStyle(0xffffff, 0.55);
    g.fillCircle(0, 0, r);
    g.lineStyle(Math.max(2, this.s(3)), 0xffffff, 0.95);
    g.strokeCircle(0, 0, r);
    g.fillStyle(syrupOf(color).color, 0.9);
    g.fillCircle(0, 0, r * 0.32);
    hand.add(g);
    hand.setAlpha(0);
    this.hand = hand;
    this.handSpec = { color, cells };
    this.tweens.add({ targets: hand, alpha: 1, duration: 200 });

    this.handTween = this.tweens.addCounter({
      from: 0,
      to: Math.max(1, pts.length - 1),
      duration: 380 * Math.max(1, pts.length - 1),
      onUpdate: (tw) => {
        if (token !== this.handToken || !hand.active) return;
        const v = tw.getValue();
        const i = Math.min(pts.length - 2, Math.floor(v));
        const f = v - i;
        const a = pts[i];
        const b = pts[i + 1] || a;
        hand.setPosition(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f);
      },
      onComplete: () => {
        if (token !== this.handToken || !hand.active) return;
        this.tweens.add({
          targets: hand,
          alpha: 0,
          duration: 240,
          onComplete: () => {
            if (token !== this.handToken) return;
            hand.destroy();
            if (this.hand === hand) this.hand = null;
            this.time.delayedCall(520, () => {
              if (token !== this.handToken || !this.tutorial || this.status !== 'playing') return;
              this.guideNext();
            });
          },
        });
      },
    });
  }

  stopHand() {
    this.handToken += 1;
    const t = this.handTween;
    this.handTween = null;
    if (t) {
      try { t.remove(); } catch (e) { /* 计数 tween 可能已结束并被回收 */ }
    }
    if (this.hand) {
      this.hand.destroy();
      this.hand = null;
    }
  }

  showBubble(text) {
    if (!this.bubble) {
      this.bubble = this.add.container(WIDTH / 2, this.sy(1064)).setDepth(200);
      this.bubbleBg = this.add.graphics();
      this.bubbleText = this.add.text(0, 0, '', {
        fontFamily: TITLE_FONT,
        fontSize: `${Math.round(this.s(24))}px`,
        color: hex(PALETTE.ink),
        align: 'center',
        wordWrap: { width: this.s(560) },
      }).setOrigin(0.5);
      this.bubble.add([this.bubbleBg, this.bubbleText]);
    }
    this.bubbleText.setText(text);
    const w = Math.min(this.s(640), this.bubbleText.width + this.s(64));
    const h = this.bubbleText.height + this.s(40);
    this.bubbleBg.clear();
    this.bubbleBg.fillStyle(PALETTE.white, 0.95);
    this.bubbleBg.fillRoundedRect(-w / 2, -h / 2, w, h, this.s(22));
    this.bubbleBg.lineStyle(Math.max(1, this.s(2)), PALETTE.cardOutline, 0.85);
    this.bubbleBg.strokeRoundedRect(-w / 2, -h / 2, w, h, this.s(22));
    this.bubble.setVisible(true);
    if (this.bubble.alpha < 1) this.tweens.add({ targets: this.bubble, alpha: 1, duration: 160 });
  }

  tutorialStepDone() {
    const remaining = this.puzzle.paths.filter((p) => !this.completed.has(p.color));
    if (remaining.length === 0) {
      this.stopHand();
      this.showBubble('全部格子填满 → 过关！');
      this.time.delayedCall(760, () => this.showTutorialDone());
      return;
    }
    this.showBubble(this.completed.size === 1
      ? '就是这样！再来一条：拐弯也能连'
      : '继续把同色圆点连起来');
    this.stopHand();
    this.time.delayedCall(520, () => this.guideNext());
  }

  showTutorialDone() {
    if (this.tutorialPanel) return;
    const c = this.add.container(WIDTH / 2, this.sy(1188)).setDepth(220);
    const w = this.s(300);
    const h = this.s(74);
    const bg = this.add.graphics();
    bg.fillStyle(PALETTE.gold, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bg.fillStyle(0xffffff, 0.25);
    bg.fillRoundedRect(-w / 2 + this.s(8), -h / 2 + this.s(6), w - this.s(16), h * 0.4, h * 0.2);
    const txt = this.add.text(0, 0, '开始第 1 关', {
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(this.s(28))}px`,
      fontStyle: 'bold',
      color: hex(PALETTE.white),
    }).setOrigin(0.5);
    c.add([bg, txt]);
    c.setSize(w, h);
    c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    c.on('pointerdown', () => this.leaveTutorial());
    this.tutorialPanel = c;
  }

  leaveTutorial() {
    this.markTutorialDone();
    this.scene.restart({ level: 1 });
  }

  // ──────────────── 输入 ────────────────
  cellAt(pointer) {
    const lx = (pointer.x - this.offsetX) / this.uiScale;
    const ly = (pointer.y - this.offsetY) / this.uiScale;
    const x = Math.floor((lx - this.boardX) / this.cell);
    const y = Math.floor((ly - this.boardY) / this.cell);
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return null;
    return { x, y };
  }

  handleDown(pointer) {
    if (this.status !== 'playing') return;
    const cell = this.cellAt(pointer);
    if (!cell) return;

    if (this.tutorial) {
      this.stopHand();
      if (this.completed.size === 0) this.showBubble('按住别松手，顺着格子慢慢拖');
    }

    if (this.isFrozen(cell)) {
      this.flashFrost(cell);
      return;
    }

    const ep = this.endpointAt.get(cellId(cell.x, cell.y));
    if (ep) {
      if (this.completed.has(ep.color)) {
        this.clearStroke(ep.color);
        return;
      }
      this.startStroke(ep.color, cell);
      return;
    }

    for (const [color, stroke] of this.strokes) {
      if (this.completed.has(color)) continue;
      const last = stroke.cells[stroke.cells.length - 1];
      if (last.x === cell.x && last.y === cell.y) {
        this.drag = { color };
        return;
      }
    }
  }

  startStroke(color, cell) {
    // 该色若已有未完成路径，清空重来
    const old = this.strokes.get(color);
    if (old) {
      for (const c of old.cells) this.fill.delete(cellId(c.x, c.y));
    }
    const stroke = { color, cells: [cell] };
    this.strokes.set(color, stroke);
    this.fill.set(cellId(cell.x, cell.y), color);
    this.drag = { color };
    // 落笔这一格同样会烤化旁边的霜
    this.meltAround(cell);
    this.drawPipes();
  }

  handleMove(pointer) {
    if (!this.drag || this.status !== 'playing') return;
    const stroke = this.strokes.get(this.drag.color);
    if (!stroke) return;
    const target = this.cellAt(pointer);
    if (!target) return;
    this.extendTo(stroke, target);
  }

  extendTo(stroke, target) {
    let guard = 0;
    while (guard++ < 16) {
      const last = stroke.cells[stroke.cells.length - 1];
      if (last.x === target.x && last.y === target.y) return;

      const dx = target.x - last.x;
      const dy = target.y - last.y;
      const step = Math.abs(dx) >= Math.abs(dy)
        ? { x: last.x + Math.sign(dx), y: last.y }
        : { x: last.x, y: last.y + Math.sign(dy) };

      const result = this.stepTo(stroke, step);
      if (result === 'stop' || result === 'done') return;
    }
  }

  stepTo(stroke, cell) {
    const cells = stroke.cells;
    const last = cells[cells.length - 1];

    // 回拖：回到上一格 = 撤销一格
    if (cells.length >= 2) {
      const prev = cells[cells.length - 2];
      if (prev.x === cell.x && prev.y === cell.y) {
        const removed = cells.pop();
        this.fill.delete(cellId(removed.x, removed.y));
        this.drawPipes();
        return 'moved';
      }
    }

    if (Math.abs(last.x - cell.x) + Math.abs(last.y - cell.y) !== 1) return 'stop';
    if (cells.some((c) => c.x === cell.x && c.y === cell.y)) return 'stop';
    if (this.isFrozen(cell)) { this.flashFrost(cell); return 'stop'; }

    const occupied = this.fill.get(cellId(cell.x, cell.y));
    if (occupied !== undefined && occupied !== stroke.color) return 'stop';

    const ep = this.endpointAt.get(cellId(cell.x, cell.y));
    if (ep && ep.color !== stroke.color) return 'stop';

    cells.push(cell);
    this.fill.set(cellId(cell.x, cell.y), stroke.color);
    this.meltAround(cell);
    this.drawPipes();

    if (ep && ep.color === stroke.color && cells.length >= 2) {
      this.finishStroke(stroke);
      return 'done';
    }
    return 'moved';
  }

  finishStroke(stroke) {
    this.completed.add(stroke.color);
    this.sparkle(stroke);
    this.drawEndpoints();
    this.refreshHUD();
    if (this.tutorial) {
      this.tutorialStepDone();
      return;
    }
    this.checkWin();
  }

  handleUp() {
    if (!this.drag) return;
    const stroke = this.strokes.get(this.drag.color);
    if (stroke && stroke.cells.length < 2 && !this.completed.has(stroke.color)) {
      for (const c of stroke.cells) this.fill.delete(cellId(c.x, c.y));
      this.strokes.delete(stroke.color);
    }
    this.drag = null;
    this.drawPipes();
    this.refreshHUD();
  }

  clearStroke(color) {
    const stroke = this.strokes.get(color);
    if (!stroke) return;
    for (const c of stroke.cells) this.fill.delete(cellId(c.x, c.y));
    this.strokes.delete(color);
    this.completed.delete(color);
    this.drag = null;
    this.drawEndpoints();
    this.drawPipes();
    this.refreshHUD();
  }

  // ──────────────── 融霜 ────────────────
  meltAround(cell) {
    let changed = false;
    for (const nb of neighbors(cell.x, cell.y, this.w, this.h)) {
      const f = this.frostAt(nb);
      if (!f || f.layers <= 0) continue;
      f.layers -= 1;
      changed = true;
      this.flashFrost(nb);
    }
    if (changed) {
      this.rebuildFrost();
      this.refreshHUD();
    }
  }

  flashFrost(cell) {
    const f = this.frostAt(cell);
    if (f && f.sprite) {
      this.tweens.add({ targets: f.sprite, alpha: { from: 1, to: 0.4 }, duration: 90, yoyo: true, repeat: 1 });
    }
    const c = this.centerOf(cell);
    const ring = this.add.circle(c.x, c.y, this.s(this.cell * 0.5), PALETTE.frostDeep, 0.22).setDepth(55);
    this.tweens.add({
      targets: ring,
      scale: 1.35,
      alpha: 0,
      duration: 320,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  // ──────────────── 结算 ────────────────
  checkWin() {
    if (this.tutorial) return;
    if (!isSolved(this.puzzle, this.fill)) return;
    this.status = 'done';
    this.saveLevel(this.level + 1);
    this.time.delayedCall(220, () => this.showPanel());
  }

  showPanel() {
    const depth = 9000;
    this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x3a2331, 0.45).setOrigin(0).setDepth(depth);

    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const panel = this.add.image(cx, cy, 'panel').setDepth(depth + 1);
    const pw = this.s(PANEL_TEX_W * 0.86);
    const ph = this.s(PANEL_TEX_H * 0.86);
    panel.setDisplaySize(pw, ph);

    this.add.text(cx, cy - ph * 0.22, '通了！', {
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(this.s(46))}px`,
      fontStyle: 'bold',
      color: hex(PALETTE.ink),
    }).setOrigin(0.5).setDepth(depth + 2);

    this.add.text(cx, cy - ph * 0.02, `第 ${this.level} 关 · ${this.puzzle.colors} 种糖浆`, {
      fontFamily: TITLE_FONT,
      fontSize: `${Math.round(this.s(24))}px`,
      color: hex(PALETTE.inkSoft),
    }).setOrigin(0.5).setDepth(depth + 2);

    const makeBtn = (lx, label, onClick) => {
      const w = this.s(220);
      const h = this.s(66);
      const c = this.add.container(cx + this.s(lx), cy + ph * 0.24).setDepth(depth + 2);
      const bg = this.add.graphics();
      bg.fillStyle(PALETTE.gold, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
      bg.fillStyle(0xffffff, 0.25);
      bg.fillRoundedRect(-w / 2 + this.s(6), -h / 2 + this.s(5), w - this.s(12), h * 0.42, h * 0.21);
      const txt = this.add.text(0, 0, label, {
        fontFamily: TITLE_FONT,
        fontSize: `${Math.round(this.s(28))}px`,
        fontStyle: 'bold',
        color: hex(PALETTE.white),
      }).setOrigin(0.5);
      c.add([bg, txt]);
      c.setSize(w, h);
      c.setInteractive(new Phaser.Geom.Rectangle(-w / 2, -h / 2, w, h), Phaser.Geom.Rectangle.Contains);
      c.on('pointerdown', onClick);
      return c;
    };

    makeBtn(-118, '下一关', () => {
      this.startLevel = this.level + 1;
      this.scene.restart({ level: this.level + 1 });
    });
    makeBtn(118, '再来一局', () => {
      this.scene.restart({ level: this.level });
    });
  }

  sparkle(stroke) {
    const cell = stroke.cells[stroke.cells.length - 1];
    const c = this.centerOf(cell);
    const syrup = syrupOf(stroke.color);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const dot = this.add.circle(c.x, c.y, this.s(4), syrup.color, 0.95).setDepth(70);
      this.tweens.add({
        targets: dot,
        x: c.x + Math.cos(a) * this.s(52),
        y: c.y + Math.sin(a) * this.s(52),
        alpha: 0,
        scale: 0.3,
        duration: 420,
        ease: 'Quad.easeOut',
        onComplete: () => dot.destroy(),
      });
    }
  }

  // ──────────────── 操作 ────────────────
  undo() {
    if (this.status !== 'playing') return;
    // 清掉最后一条未完成的路径
    let target = null;
    for (const [color, stroke] of this.strokes) {
      if (!this.completed.has(color) && stroke.cells.length >= 2) target = color;
    }
    if (target === null) {
      for (const [color, stroke] of this.strokes) {
        if (!this.completed.has(color)) target = color;
      }
    }
    if (target === null) return;
    const stroke = this.strokes.get(target);
    for (const c of stroke.cells) this.fill.delete(cellId(c.x, c.y));
    this.strokes.delete(target);
    this.drag = null;
    this.drawPipes();
    this.refreshHUD();
  }

  resetLevel() {
    if (this.status !== 'playing') return;
    this.strokes.clear();
    this.completed.clear();
    this.fill.clear();
    this.drag = null;
    this.frost = this.puzzle.frost.map((f) => ({ ...f, cell: { ...f.cell } }));
    this.clearFrostSprites();
    this.rebuildFrost();
    this.drawEndpoints();
    this.drawPipes();
    this.refreshHUD();
  }
}
