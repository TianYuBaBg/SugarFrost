// 《糖浆管道》美术：棋盘 + 端点 + 冰壳，全部程序化烘焙成贴图
//
// 管道本身是动态绘制的（玩家边走边画），用 Graphics 直接画胶囊链；
// 其余静态元素（棋盘、格子凹槽、端点、冰壳）都烘焙一次，运行时不重绘。

import { SYRUPS } from '../core/flow.js';
import { PALETTE, hex } from './palette.js';
import { Pen } from './draw.js';

const SS = 2;
export const FLOW_TEX = 128; // 端点 / 冰壳贴图的逻辑边长

// 棋盘：奶油底板 + 每格一个浅凹槽
export function bakeFlowBoard(scene, w, h, cell) {
  const key = `flow_board_${w}x${h}_${cell}`;
  if (scene.textures.exists(key)) return key;

  const pad = Math.round(cell * 0.16);
  const boardW = w * cell + pad * 2;
  const boardH = h * cell + pad * 2;

  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const pen = new Pen(g, SS);
  const R = cell * 0.34;

  // 柔和投影（两层）
  pen.rrect(2, 7, boardW, boardH, R, PALETTE.cardShadow, 0.1);
  pen.rrect(1, 3, boardW, boardH, R, PALETTE.cardShadow, 0.08);

  // 底板
  pen.rrect(0, 0, boardW, boardH, R, PALETTE.cardFace, 0.93);
  pen.rrectStroke(1, 1, boardW - 2, boardH - 2, R, 2, PALETTE.white, 0.85);
  pen.rrectStroke(0.5, 0.5, boardW - 1, boardH - 1, R, 1.5, PALETTE.cardOutline, 0.55);

  // 格子凹槽
  const gap = Math.max(2, cell * 0.05);
  const wellR = cell * 0.18;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cx = pad + x * cell + cell / 2;
      const cy = pad + y * cell + cell / 2;
      pen.rrect(cx - cell / 2 + gap, cy - cell / 2 + gap, cell - gap * 2, cell - gap * 2, wellR, PALETTE.trayWell, 0.42);
      pen.rrectStroke(cx - cell / 2 + gap, cy - cell / 2 + gap, cell - gap * 2, cell - gap * 2, wellR, 1.2, PALETTE.trayWellDeep, 0.22);
    }
  }

  g.generateTexture(key, boardW * SS, boardH * SS);
  g.destroy();
  return key;
}

// 端点：糖浆球 + 白边 + 高光；两种端点朝向不同（入口/出口）
export function bakeFlowSpots(scene) {
  const key = 'flow_spot';
  if (scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const pen = new Pen(g, SS);
  const c = FLOW_TEX / 2;
  const r = FLOW_TEX * 0.3;

  // 白瓷底座
  pen.circle(c, c, r + FLOW_TEX * 0.06, PALETTE.white, 0.95);
  pen.circleStroke(c, c, r + FLOW_TEX * 0.06, 2.4, PALETTE.cardOutline, 0.7);

  g.generateTexture(key, FLOW_TEX * SS, FLOW_TEX * SS);
  g.destroy();
  return key;
}

// 冰壳：冷色罩 + 四角冰棱 + 底部 1~3 颗冰晶表示层数
export function bakeFlowFrost(scene, layers) {
  const key = `flow_frost_${layers}`;
  if (scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0, add: false });
  const pen = new Pen(g, SS);
  const S = FLOW_TEX;
  const R = S * 0.24;

  pen.rrect(0, 0, S, S, R, PALETTE.frostShell, 0.82);
  pen.rrect(0, 0, S, S, R, PALETTE.frostDeep, 0.1);
  pen.rrectStroke(2.8, 2.8, S - 5.6, S - 5.6, R - 1.6, 5.6, PALETTE.frostRim, 1);
  pen.rrectStroke(0.6, 0.6, S - 1.2, S - 1.2, R, 1.6, PALETTE.frostDeep, 0.35);
  pen.rrectStroke(S * 0.1, S * 0.1, S * 0.8, S * 0.8, R * 0.7, 2.4, PALETTE.white, 0.55);

  // 四角冰棱
  const corners = [
    [S * 0.1, S * 0.1, 0],
    [S * 0.9, S * 0.1, 90],
    [S * 0.9, S * 0.9, 180],
    [S * 0.1, S * 0.9, 270],
  ];
  for (const [cx, cy, deg] of corners) {
    const a = (deg * Math.PI) / 180;
    const len = S * 0.26;
    const ex = cx + Math.cos(a) * len;
    const ey = cy + Math.sin(a) * len;
    pen.triangle(cx, cy, ex, ey, cx + Math.cos(a + 1.5) * len * 0.55, cy + Math.sin(a + 1.5) * len * 0.55, PALETTE.frostRim, 0.62);
    pen.triangle(cx, cy, ex, ey, cx + Math.cos(a - 1.2) * len * 0.4, cy + Math.sin(a - 1.2) * len * 0.4, PALETTE.white, 0.7);
  }

  // 层数：底部一排冰晶
  const n = Math.max(1, Math.min(3, layers));
  const step = S * 0.19;
  const startX = S / 2 - (step * (n - 1)) / 2;
  for (let i = 0; i < n; i++) {
    crystal(pen, startX + i * step, S * 0.79, S * 0.1, 1);
  }

  g.generateTexture(key, S * SS, S * SS);
  g.destroy();
  return key;
}

function crystal(pen, cx, cy, len, alpha) {
  const w = len * 0.28;
  pen.capsule(cx - len, cy, cx + len, cy, w, PALETTE.frostDeep, alpha);
  pen.capsule(cx, cy - len, cx, cy + len, w, PALETTE.frostDeep, alpha);
  const d = len * 0.7;
  pen.capsule(cx - d, cy - d, cx + d, cy + d, w * 0.9, PALETTE.frostDeep, alpha);
  pen.capsule(cx - d, cy + d, cx + d, cy - d, w * 0.9, PALETTE.frostDeep, alpha);
  pen.circle(cx, cy, w * 0.75, PALETTE.white, alpha);
}

export function bakeFlowTextures(scene, w, h, cell) {
  bakeFlowSpots(scene);
  for (let i = 1; i <= 3; i++) bakeFlowFrost(scene, i);
  return bakeFlowBoard(scene, w, h, cell);
}

// 管道颜色（含深色描边），供场景直接用
export function syrupOf(color) {
  return SYRUPS[color] || SYRUPS[0];
}

export function syrupHex(color) {
  return hex(syrupOf(color).color);
}
