// 《糖霜消消》主玩法场景
//
// 流程：
//   1. 生成 108 张糖牌（6 摞 × 10 张 + 48 张散卡），保证存在通关路线
//   2. 5% 阈值的遮挡判定决定哪些牌可点（被压住的牌盖一层霜）
//   3. 点击可点的牌 → 飞入底部 7 格托盘
//   4. 槽内同类型自动聚合，连续 3 张同类型立即消除并左对齐
//   5. 槽满 7 张 → 失败；牌堆清空 → 胜利

import {
  TOTAL_CARDS,
  CANDIES,
  CARD_W,
  CARD_H,
  SLOT_CAPACITY,
  SLOT_CELL_W,
  LEVEL_LOGICAL_W,
  LEVEL_LOGICAL_H,
  HUD_SAFE_OFFSET,
  HUD_TITLE_Y,
  HUD_STATUS_Y,
  HUD_HINT_Y,
  ANIM_FLY_TO_SLOT,
  ANIM_SLOT_SHIFT,
  ANIM_TRIPLE_REMOVE,
  ANIM_SLOT_COMPACT,
} from '../core/config.js';
import {
  computeSlotCenters,
  getSlotBarRect,
  resolveOcclusion,
  resolveOcclusionFor,
  occludedBy,
  computeInsertIndex,
  findTripleIndex,
} from '../core/rules.js';
import { generateLevel } from '../core/LevelGenerator.js';
import { bakeCardTextures, CARD_TEX_DISPLAY } from '../art/CardArt.js';
import { bakeEnvironment, TRAY_TEX_W, TRAY_TEX_H, PANEL_TEX_W, PANEL_TEX_H } from '../art/EnvironmentArt.js';
import { PALETTE, hex } from '../art/palette.js';
import { IS_WX } from '../platform.js';
import { WIDTH, HEIGHT } from '../main.js';

const FLYING_DEPTH = 900000;
const SLOT_DEPTH = 500000;
const SLOT_CARD_DISPLAY = 84; // 槽内卡面显示尺寸（逻辑像素，含投影留白）

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  init() {
    this.uiScale = WIDTH / LEVEL_LOGICAL_W;
    this.offsetX = 0;
    this.offsetY = Math.max(0, (HEIGHT - LEVEL_LOGICAL_H * this.uiScale) / 2);
  }

  create() {
    bakeCardTextures(this);
    bakeEnvironment(this);

    // ?seed=123456 可复现同一局（调试 / 每日挑战都用得上）
    let seedParam = 0;
    if (typeof window !== 'undefined' && window.location && typeof URLSearchParams !== 'undefined') {
      seedParam = Number(new URLSearchParams(window.location.search).get('seed'));
    }
    this.level = generateLevel(seedParam > 0 ? seedParam : Date.now());
    this.cards = this.level.cards.map((c) => ({ ...c, state: 'on_pile', unlocked: false, sprite: null, frost: null }));
    this.slot = [];
    this.status = 'playing';
    this.isAnimating = false;
    this.triplesCleared = 0;

    this.buildBackground();
    this.buildTray();
    this.buildHUD();
    this.buildCards();
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.recomputeAll();
    this.refreshHUD();
    this.intro();
  }

  // ──────────────── 坐标换算 ────────────────
  s(v) { return v * this.uiScale; }
  sx(lx) { return this.offsetX + lx * this.uiScale; }
  sy(ly) { return this.offsetY + ly * this.uiScale; }

  // ──────────────── 背景 / 托盘 ────────────────
  buildBackground() {
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, 'bg');
    bg.setDisplaySize(WIDTH, HEIGHT);
    bg.setDepth(-100);
  }

  buildTray() {
    const bar = getSlotBarRect();
    const tray = this.add.image(this.sx(bar.cx), this.sy(bar.cy), 'tray');
    tray.setDisplaySize(this.s(TRAY_TEX_W), this.s(TRAY_TEX_H));
    tray.setDepth(10);

    // 槽位中心（逻辑坐标 → 屏幕坐标）
    this.slotCenters = computeSlotCenters().map((p) => ({ x: this.sx(p.lx), y: this.sy(p.ly) }));
    this.slotCardDisplay = this.s(SLOT_CARD_DISPLAY);
    this.slotCardScale = SLOT_CARD_DISPLAY / CARD_TEX_DISPLAY;
  }

  // ──────────────── HUD ────────────────
  buildHUD() {
    const safe = this.s(HUD_SAFE_OFFSET);
    const titleFont = '"Comic Sans MS", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

    this.hudTitle = this.add.text(WIDTH / 2, safe + this.s(HUD_TITLE_Y), '糖霜消消', {
      fontFamily: titleFont,
      fontSize: `${Math.round(this.s(54))}px`,
      fontStyle: 'bold',
      color: hex(PALETTE.white),
      stroke: hex(PALETTE.ink),
      strokeThickness: Math.max(2, Math.round(this.s(9))),
      shadow: {
        offsetX: 0, offsetY: this.s(5), color: 'rgba(120,60,90,0.35)',
        blur: this.s(10), fill: true,
      },
    }).setOrigin(0.5).setDepth(20);

    this.hudStatus = this.add.text(WIDTH / 2, safe + this.s(HUD_STATUS_Y), '', {
      fontFamily: titleFont,
      fontSize: `${Math.round(this.s(26))}px`,
      fontStyle: 'bold',
      color: hex(PALETTE.ink),
      backgroundColor: 'rgba(255,255,255,0.55)',
      padding: { x: this.s(16), y: this.s(6) },
    }).setOrigin(0.5).setDepth(20);

    this.hudHint = this.add.text(WIDTH / 2, safe + this.s(HUD_HINT_Y), '三张同款自动消除 · 槽满 7 张失败', {
      fontFamily: titleFont,
      fontSize: `${Math.round(this.s(20))}px`,
      color: hex(PALETTE.inkSoft),
    }).setOrigin(0.5).setDepth(20);

    // 右上角「重开」
    const btn = this.add.container(WIDTH - this.s(56), safe + this.s(30)).setDepth(30);
    const circle = this.add.circle(0, 0, this.s(25), PALETTE.white, 0.75);
    const txt = this.add.text(0, 0, '↻', {
      fontFamily: titleFont,
      fontSize: `${Math.round(this.s(30))}px`,
      color: hex(PALETTE.ink),
    }).setOrigin(0.5);
    btn.add([circle, txt]);
    btn.setSize(this.s(56), this.s(56));
    btn.setInteractive(new Phaser.Geom.Circle(0, 0, this.s(26)), Phaser.Geom.Circle.Contains);
    btn.on('pointerdown', () => {
      if (this.status === 'playing') this.restartGame();
    });
    this.restartBtn = btn;
  }

  // ──────────────── 牌堆 ────────────────
  buildCards() {
    this.cardContainers = [];

    for (const card of this.cards) {
      const key = `candy_${CANDIES[card.type].key}`;

      const face = this.add.image(0, 0, key);
      face.setDisplaySize(this.s(CARD_TEX_DISPLAY), this.s(CARD_TEX_DISPLAY));

      const frost = this.add.image(0, 0, 'frost');
      frost.setDisplaySize(this.s(CARD_W), this.s(CARD_H));
      frost.setVisible(false);

      const wrap = this.add.container(this.sx(card.lx), this.sy(card.ly), [face, frost]);
      wrap.setAngle(card.angle);
      wrap.setSize(this.s(CARD_W), this.s(CARD_H));
      wrap.setDepth(card.zLayer * 1000 + card.id);
      wrap.setAlpha(0);

      card.sprite = wrap;
      card.frost = frost;
      this.cardContainers.push(wrap);
    }
  }

  // 统一在场景层做命中判定：按渲染深度从上往下找第一张被点到的牌。
  // 不依赖 Phaser 的 interactive 排序（它按显示列表顺序，不是 depth），
  // 这样「点到的牌」永远等于「看到的最上面那张」。
  handlePointerDown(pointer) {
    if (this.status !== 'playing' || this.isAnimating) return;

    // 右上角重开按钮单独处理，别穿透到下面的牌
    if (this.restartBtn) {
      const dx = pointer.x - this.restartBtn.x;
      const dy = pointer.y - this.restartBtn.y;
      if (Math.hypot(dx, dy) <= this.s(30)) return;
    }

    const px = pointer.x;
    const py = pointer.y;
    const pool = this.cards.filter((c) => c.state === 'on_pile' && c.sprite);
    pool.sort((a, b) => b.sprite.depth - a.sprite.depth);

    for (const card of pool) {
      const local = card.sprite.getWorldTransformMatrix().applyInverse(px, py);
      const halfW = card.sprite.width * 0.5;
      const halfH = card.sprite.height * 0.5;
      if (Math.abs(local.x) <= halfW && Math.abs(local.y) <= halfH) {
        this.onCardTap(card);
        return;
      }
    }
  }

  intro() {
    // 由下往上依次浮现，营造发牌感
    const sorted = [...this.cardContainers].sort((a, b) => a.depth - b.depth);
    sorted.forEach((wrap, i) => {
      this.tweens.add({
        targets: wrap,
        alpha: 1,
        duration: 260,
        delay: Math.min(700, i * 4),
        ease: 'Quad.easeOut',
      });
    });
  }

  // ──────────────── 遮挡 ────────────────
  recomputeAll() {
    const results = resolveOcclusion(this.cards);
    this.applyOcclusion(results);
  }

  applyOcclusion(results) {
    const byId = new Map(this.cards.map((c) => [c.id, c]));
    for (const r of results) {
      const card = byId.get(r.id);
      if (!card) continue;
      card.unlocked = r.unlocked;
      if (card.frost) card.frost.setVisible(!r.unlocked);
    }
  }

  // ──────────────── 点击 ────────────────
  onCardTap(card) {
    if (this.status !== 'playing' || this.isAnimating) return;
    if (card.state !== 'on_pile') return;

    if (!card.unlocked) {
      this.nudge(card);
      return;
    }
    this.pickCard(card);
  }

  nudge(card) {
    if (!card.sprite) return;
    const x = card.sprite.x;
    this.tweens.add({
      targets: card.sprite,
      x: { from: x - this.s(4), to: x },
      duration: 90,
      yoyo: true,
      repeat: 1,
      ease: 'Quad.easeOut',
    });
  }

  pickCard(card) {
    this.isAnimating = true;
    card.state = 'flying';

    // 移走这张牌后，只有它下面被压住的牌可能解锁
    const dirty = occludedBy(this.cards, card);

    const index = computeInsertIndex(this.slot, card.type);
    const target = this.slotCenters[Math.min(index, SLOT_CAPACITY - 1)];

    const wrap = card.sprite;
    wrap.setDepth(FLYING_DEPTH);
    if (card.frost) card.frost.setVisible(false);

    this.tweens.add({
      targets: wrap,
      x: target.x,
      y: target.y,
      scale: this.slotCardScale,
      angle: 0,
      duration: ANIM_FLY_TO_SLOT,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        card.state = 'in_slot';
        this.slot.splice(index, 0, card);
        this.relayoutSlot(ANIM_SLOT_SHIFT);
        this.time.delayedCall(ANIM_SLOT_SHIFT, () => this.checkTriple(dirty));
      },
    });
  }

  // ──────────────── 卡槽 ────────────────
  relayoutSlot(duration, onDone) {
    let pending = 0;
    const done = () => {
      pending--;
      if (pending <= 0 && onDone) onDone();
    };

    this.slot.forEach((card, i) => {
      const wrap = card.sprite;
      if (!wrap) return;
      wrap.setDepth(SLOT_DEPTH + i);
      pending++;
      this.tweens.add({
        targets: wrap,
        x: this.slotCenters[i].x,
        y: this.slotCenters[i].y,
        scale: this.slotCardScale,
        duration,
        ease: 'Quad.easeOut',
        onComplete: done,
      });
    });

    if (pending === 0 && onDone) onDone();
  }

  checkTriple(dirty) {
    // 先刷新遮挡，让新解锁的牌立刻可点
    if (dirty && dirty.length) {
      this.applyOcclusion(resolveOcclusionFor(this.cards, dirty));
    }

    const tri = findTripleIndex(this.slot);
    if (tri < 0) {
      this.afterAction();
      return;
    }

    const removed = this.slot.slice(tri, tri + 3);
    this.triplesCleared += 1;

    for (const card of removed) {
      card.state = 'removed';
      if (card.sprite) {
        this.tweens.add({
          targets: card.sprite,
          scale: 0,
          alpha: 0,
          duration: ANIM_TRIPLE_REMOVE,
          ease: 'Back.easeIn',
        });
      }
    }

    this.time.delayedCall(ANIM_TRIPLE_REMOVE, () => {
      for (const card of removed) {
        if (card.sprite) card.sprite.destroy();
        card.sprite = null;
      }
      this.slot.splice(tri, 3);
      this.refreshHUD();
      this.relayoutSlot(ANIM_SLOT_COMPACT, () => this.afterAction());
    });
  }

  afterAction() {
    this.refreshHUD();

    const remaining = this.cards.filter((c) => c.state === 'on_pile').length;
    if (remaining === 0) {
      this.status = 'win';
      this.isAnimating = false;
      this.endGame(true);
      return;
    }
    if (this.slot.length >= SLOT_CAPACITY) {
      this.status = 'lose';
      this.isAnimating = false;
      this.endGame(false);
      return;
    }

    this.isAnimating = false;
  }

  refreshHUD() {
    const remaining = this.cards.filter((c) => c.state === 'on_pile').length;
    if (this.hudStatus) {
      this.hudStatus.setText(`剩余 ${remaining} 张 · 已消 ${this.triplesCleared} 组`);
    }
  }

  // ──────────────── 结算 ────────────────
  endGame(win) {
    const blocker = this.add.rectangle(0, 0, WIDTH, HEIGHT, 0x3A2331, 0.5).setOrigin(0).setDepth(FLYING_DEPTH + 10);
    blocker.setInteractive();

    const panel = this.add.image(WIDTH / 2, HEIGHT / 2, 'panel');
    panel.setDisplaySize(this.s(PANEL_TEX_W), this.s(PANEL_TEX_H));
    panel.setDepth(FLYING_DEPTH + 20);

    const font = '"Comic Sans MS", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    const cy = HEIGHT / 2;

    this.add.text(WIDTH / 2, cy - this.s(105), win ? '通关啦！' : '卡槽满了…', {
      fontFamily: font,
      fontSize: `${Math.round(this.s(52))}px`,
      fontStyle: 'bold',
      color: win ? hex(0xE879A8) : hex(PALETTE.ink),
    }).setOrigin(0.5).setDepth(FLYING_DEPTH + 30);

    this.add.text(WIDTH / 2, cy - this.s(28), win
      ? `全部 ${TOTAL_CARDS} 张糖牌清理干净`
      : `还剩 ${this.cards.filter((c) => c.state === 'on_pile').length} 张，再来一次？`, {
      fontFamily: font,
      fontSize: `${Math.round(this.s(24))}px`,
      color: hex(PALETTE.inkSoft),
    }).setOrigin(0.5).setDepth(FLYING_DEPTH + 30);

    this.add.text(WIDTH / 2, cy + this.s(22), `本局消除 ${this.triplesCleared} 组`, {
      fontFamily: font,
      fontSize: `${Math.round(this.s(22))}px`,
      color: hex(PALETTE.gold),
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(FLYING_DEPTH + 30);

    const bx = IS_WX ? WIDTH / 2 - this.s(96) : WIDTH / 2;
    this.buildEndButton(bx, cy + this.s(100), '再来一局', 0xE879A8, () => this.restartGame());
    if (IS_WX) {
      this.buildEndButton(WIDTH / 2 + this.s(96), cy + this.s(100), '分享', 0x7FB3E8, () => {
        if (wx.shareAppMessage) wx.shareAppMessage({ title: '糖霜消消 · 三张同款就消除' });
      });
    }
  }

  buildEndButton(cx, cy, label, color, onClick) {
    const font = '"Comic Sans MS", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';
    const w = this.s(168);
    const h = this.s(62);
    const g = this.add.graphics().setDepth(FLYING_DEPTH + 30);
    g.fillStyle(PALETTE.white, 0.25);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, h / 2);
    g.fillStyle(color, 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h - this.s(5), h / 2);
    g.fillStyle(0xffffff, 0.35);
    g.fillRoundedRect(cx - w / 2 + this.s(8), cy - h / 2 + this.s(4), w - this.s(16), h * 0.42, h * 0.3);

    const t = this.add.text(cx, cy - this.s(3), label, {
      fontFamily: font,
      fontSize: `${Math.round(this.s(26))}px`,
      fontStyle: 'bold',
      color: hex(PALETTE.white),
    }).setOrigin(0.5).setDepth(FLYING_DEPTH + 31);

    const zone = this.add.zone(cx, cy, w, h).setOrigin(0.5).setDepth(FLYING_DEPTH + 32);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerdown', onClick);
    return { g, t, zone };
  }

  restartGame() {
    this.scene.restart();
  }

  shutdown() {
    this.tweens.killAll();
  }
}
