// 环境贴图：背景、卡槽托盘、结算面板
// 全部一次性烘焙成贴图，运行时不重绘（Canvas 渲染器下省 CPU）

import { SLOT_BAR_W, SLOT_BAR_H, SLOT_CELL_W, SLOT_CELL_GAP, SLOT_CAPACITY } from '../core/config.js';
import { getSlotBarRect } from '../core/rules.js';
import { PALETTE, lighten, darken } from './palette.js';
import { Pen } from './draw.js';
import { SS } from './CardArt.js';

const TRAY_PAD = 16;
export const TRAY_TEX_W = SLOT_BAR_W + TRAY_PAD * 2;
export const TRAY_TEX_H = SLOT_BAR_H + TRAY_PAD * 2;

const BG_TEX_W = 360;
const BG_TEX_H = 640;

const PANEL_W = 520;
const PANEL_H = 420;
export const PANEL_TEX_W = PANEL_W;
export const PANEL_TEX_H = PANEL_H;

// 确定性伪随机（美工装饰用，不参与玩法）
function dots(n, seed) {
  let s = seed >>> 0;
  const out = [];
  for (let i = 0; i < n; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const x = (s / 4294967296) * BG_TEX_W;
    s = (s * 1664525 + 1013904223) >>> 0;
    const y = (s / 4294967296) * BG_TEX_H;
    s = (s * 1664525 + 1013904223) >>> 0;
    const r = 1.5 + (s / 4294967296) * 4.5;
    out.push({ x, y, r });
  }
  return out;
}

export function bakeEnvironment(scene) {
  // ── 背景：三段渐变 + 大色块 + 糖粒 ──
  if (!scene.textures.exists('bg')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const pen = new Pen(g, 1);

    for (let y = 0; y < BG_TEX_H; y++) {
      const t = y / BG_TEX_H;
      const color = t < 0.5
        ? mix(PALETTE.bgTop, PALETTE.bgMid, t / 0.5)
        : mix(PALETTE.bgMid, PALETTE.bgBottom, (t - 0.5) / 0.5);
      pen.rrect(0, y, BG_TEX_W, 1.2, 0, color);
    }

    // 柔和光斑
    pen.ellipse(60, 120, 130, 130, PALETTE.bgBlob, 0.35, 40);
    pen.ellipse(320, 320, 150, 150, 0xDCE9FF, 0.45, 40);
    pen.ellipse(40, 520, 110, 110, 0xFFF0D8, 0.4, 40);

    // 糖粒
    for (const d of dots(46, 20261108)) {
      pen.circle(d.x, d.y, d.r, PALETTE.bgDot, 0.55);
    }
    for (const d of dots(18, 77)) {
      pen.circle(d.x, d.y, d.r * 0.7, 0xF7C948, 0.18);
    }

    g.generateTexture('bg', BG_TEX_W, BG_TEX_H);
    g.destroy();
  }

  // ── 卡槽托盘 ──
  if (!scene.textures.exists('tray')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const pen = new Pen(g, SS);
    const bar = getSlotBarRect();

    // 投影
    pen.rrect(TRAY_PAD - 1, TRAY_PAD + 7, SLOT_BAR_W + 2, SLOT_BAR_H, 30, PALETTE.trayShadow, 0.16);
    pen.rrect(TRAY_PAD + 1, TRAY_PAD + 3, SLOT_BAR_W - 2, SLOT_BAR_H - 2, 28, PALETTE.trayShadow, 0.14);

    // 托盘主体
    pen.rrect(TRAY_PAD, TRAY_PAD, SLOT_BAR_W, SLOT_BAR_H, 28, PALETTE.trayBody);
    pen.rrect(TRAY_PAD + 3, TRAY_PAD + 3, SLOT_BAR_W - 6, SLOT_BAR_H * 0.45, 24, PALETTE.trayBodyTop, 0.95);
    pen.rrectStroke(TRAY_PAD + 1, TRAY_PAD + 1, SLOT_BAR_W - 2, SLOT_BAR_H - 2, 27, 2, PALETTE.trayEdge, 0.9);

    // 7 个凹槽
    const cellY = TRAY_PAD + SLOT_BAR_H / 2;
    for (let i = 0; i < SLOT_CAPACITY; i++) {
      const cx = TRAY_PAD + bar.padX + SLOT_CELL_W / 2 + i * (SLOT_CELL_W + SLOT_CELL_GAP);
      pen.crrect(cx, cellY + 1.5, SLOT_CELL_W, SLOT_CELL_W, 20, PALETTE.trayWellDeep, 0.35);
      pen.crrect(cx, cellY, SLOT_CELL_W, SLOT_CELL_W, 20, PALETTE.trayWell);
      // 凹槽内阴影（上缘深、下缘亮）
      pen.crrect(cx, cellY - SLOT_CELL_W / 2 + 9, SLOT_CELL_W - 10, 18, 12, PALETTE.trayWellDeep, 0.22);
      pen.crrect(cx, cellY + SLOT_CELL_W / 2 - 7, SLOT_CELL_W - 14, 12, 9, 0xffffff, 0.35);
    }

    // 左右小装饰：糖粒
    pen.circle(TRAY_PAD + 14, TRAY_PAD + 14, 3, 0xffffff, 0.7);
    pen.circle(TRAY_PAD + SLOT_BAR_W - 14, TRAY_PAD + SLOT_BAR_H - 16, 3, 0xffffff, 0.7);

    g.generateTexture('tray', TRAY_TEX_W * SS, TRAY_TEX_H * SS);
    g.destroy();
  }

  // ── 结算面板 ──
  if (!scene.textures.exists('panel')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const pen = new Pen(g, SS);

    pen.crrect(PANEL_W / 2 + 2, PANEL_H / 2 + 8, PANEL_W - 4, PANEL_H - 4, 34, PALETTE.trayShadow, 0.18);
    pen.crrect(PANEL_W / 2, PANEL_H / 2, PANEL_W, PANEL_H, 34, 0xFFFDFB);
    pen.crrectStroke(PANEL_W / 2, PANEL_H / 2, PANEL_W - 2, PANEL_H - 2, 33, 2.4, PALETTE.trayEdge, 0.8);
    // 顶部彩带
    pen.crrect(PANEL_W / 2, 62, PANEL_W - 60, 26, 13, PALETTE.trayBody, 0.9);
    for (let i = 0; i < 5; i++) {
      pen.circle(PANEL_W / 2 - 90 + i * 45, 62, 4, [0xF7C948, 0xE879A8, 0x7CC7F0, 0x86CF4A, 0x9B7BEA][i], 0.85);
    }

    g.generateTexture('panel', PANEL_TEX_W * SS, PANEL_TEX_H * SS);
    g.destroy();
  }
}

function mix(a, b, t) {
  const ar = (a >> 16) & 0xff; const ag = (a >> 8) & 0xff; const ab = a & 0xff;
  const br = (b >> 16) & 0xff; const bg = (b >> 8) & 0xff; const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const gg = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gg << 8) | bl;
}
