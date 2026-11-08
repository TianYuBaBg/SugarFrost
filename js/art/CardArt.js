// 卡面贴图：用 Graphics 画出「糖牌」，再 generateTexture() 烘焙成贴图。
// 每类糖一张正面贴图 + 一张共用的「冻结」遮罩（被压住时叠在卡面上）。

import { CARD_W, CARD_H, CARD_RADIUS, CARD_SHADOW_PAD, CANDIES } from '../core/config.js';
import { PALETTE, lighten, darken } from './palette.js';
import { Pen } from './draw.js';

export const SS = 2; // 超采样倍率：贴图分辨率 = 逻辑尺寸 × 2
export const CARD_TEX_SIZE = CARD_W + CARD_SHADOW_PAD * 2; // 94
const PAD = CARD_SHADOW_PAD;
const CX = PAD + CARD_W / 2;
const CY = PAD + CARD_H / 2;

// ───────────────── 卡面 ─────────────────

function drawCardFrame(pen) {
  // 两层柔和投影
  pen.rrect(PAD - 1, PAD + 7, CARD_W + 2, CARD_H, CARD_RADIUS + 3, PALETTE.cardShadow, 0.13);
  pen.rrect(PAD + 1, PAD + 2, CARD_W - 2, CARD_H - 2, CARD_RADIUS, PALETTE.cardShadow, 0.18);

  // 白色卡身 + 描边
  pen.rrect(PAD, PAD, CARD_W, CARD_H, CARD_RADIUS, PALETTE.cardFace);
  pen.rrectStroke(PAD + 0.8, PAD + 0.8, CARD_W - 1.6, CARD_H - 1.6, CARD_RADIUS - 0.8,
    1.6, PALETTE.cardOutline, 0.85);

  // 顶部内高光
  pen.rrect(PAD + 2.2, PAD + 2.2, CARD_W - 4.4, CARD_H * 0.42, CARD_RADIUS - 2,
    0xffffff, 0.75);
}

function drawCandyIcon(pen, candy, cx, cy) {
  const { ink, ink2 } = candy;
  const light = lighten(ink, 0.35);
  const deep = ink2;
  const cream = 0xFFF6E9;

  switch (candy.key) {
    // 甜甜圈：外圈 + 糖霜 + 彩针
    case 'donut': {
      pen.circle(cx, cy, 19, deep, 0.9);
      pen.circle(cx, cy, 18, ink);
      pen.ellipse(cx, cy - 3, 17, 12, light);
      pen.circle(cx, cy + 0.5, 8, PALETTE.cardFace);
      pen.circleStroke(cx, cy + 0.5, 8, 1.6, deep, 0.5);
      const sprinkles = [[-11, -8, 25], [-2, -12, -15], [7, -9, 40], [12, -2, -30], [-13, 0, 70]];
      for (const [dx, dy, ang] of sprinkles) {
        const a = (ang * Math.PI) / 180;
        pen.capsule(cx + dx, cy + dy, cx + dx + Math.cos(a) * 4, cy + dy + Math.sin(a) * 4, 1.6,
          [0xFFFFFF, 0xF7C948, 0x7CC7F0][Math.abs(dx) % 3], 0.95);
      }
      pen.gloss(cx - 7, cy - 9, 6, 3, 0.5);
      break;
    }

    // 棒棒糖：糖球 + 螺旋 + 棒子
    case 'lollipop': {
      pen.capsule(cx, cy + 6, cx, cy + 21, 3.4, cream, 1);
      pen.capsule(cx, cy + 6, cx, cy + 21, 1.2, deep, 0.35);
      pen.circle(cx, cy - 5, 15.5, deep);
      pen.circle(cx, cy - 5, 14.2, ink);
      pen.arc(cx, cy - 5, 11, 200, 340, 2.6, light, 0.95);
      pen.arc(cx, cy - 5, 6.5, 20, 160, 2.6, light, 0.95);
      pen.arc(cx, cy - 5, 9.5, 90, 250, 2.2, 0xffffff, 0.75);
      pen.gloss(cx - 6, cy - 12, 5, 3, 0.6);
      pen.circle(cx + 12, cy + 6, 1.6, 0xffffff, 0.8);
      break;
    }

    // 马卡龙：两片壳 + 夹心
    case 'macaron': {
      pen.crrect(cx, cy + 1, 38, 7, 3.5, cream);
      pen.ellipse(cx, cy - 8, 19, 8.5, light);
      pen.ellipse(cx, cy + 8, 19, 8.5, ink);
      pen.crrect(cx, cy - 10.5, 34, 4.5, 2.2, 0xffffff, 0.35);
      pen.crrect(cx, cy + 11.5, 32, 3.5, 1.8, deep, 0.18);
      pen.ellipse(cx - 6, cy - 12, 6, 2.5, 0xffffff, 0.55);
      break;
    }

    // 纸杯蛋糕：杯托 + 奶油 + 樱桃
    case 'cupcake': {
      pen.quad(cx - 15, cy + 4, cx + 15, cy + 4, cx + 11, cy + 20, cx - 11, cy + 20, deep);
      pen.quad(cx - 13, cy + 6, cx + 13, cy + 6, cx + 10, cy + 18, cx - 10, cy + 18, lighten(deep, 0.35));
      for (let i = -1; i <= 1; i++) pen.segment(cx + i * 7, cy + 7, cx + i * 6, cy + 17, 1, deep, 0.45);
      pen.circle(cx - 9, cy - 2, 9.5, ink);
      pen.circle(cx + 9, cy - 2, 9.5, ink);
      pen.circle(cx, cy - 9, 10.5, light);
      pen.arc(cx, cy - 9, 9, 20, 160, 2, 0xffffff, 0.5);
      pen.circle(cx, cy - 19, 4.2, 0xE0506B);
      pen.gloss(cx - 10, cy - 14, 4, 2.5, 0.7);
      break;
    }

    // 冰淇淋筒：蛋筒 + 三球
    case 'cone': {
      pen.triangle(cx - 13, cy + 1, cx + 13, cy + 1, cx, cy + 21, deep);
      pen.triangle(cx - 10, cy + 2, cx + 10, cy + 2, cx, cy + 18, lighten(deep, 0.3));
      for (let i = -1; i <= 1; i++) pen.segment(cx + i * 6, cy + 2, cx + i * 4, cy + 13, 1, deep, 0.5);
      pen.circle(cx - 8, cy - 6, 9, ink);
      pen.circle(cx + 8, cy - 6, 9, ink);
      pen.circle(cx, cy - 13, 9.5, light);
      pen.gloss(cx - 4, cy - 17, 4.5, 2.5, 0.65);
      pen.circle(cx + 10, cy - 12, 1.6, 0xffffff, 0.8);
      break;
    }

    // 小熊软糖
    case 'bear': {
      pen.circle(cx - 11, cy - 12, 5.5, ink2);
      pen.circle(cx + 11, cy - 12, 5.5, ink2);
      pen.circle(cx - 11, cy - 12, 3.2, light);
      pen.circle(cx + 11, cy - 12, 3.2, light);
      pen.crrect(cx, cy + 11, 20, 18, 8, ink);
      pen.circle(cx, cy - 3, 12.5, ink);
      pen.ellipse(cx, cy + 1.5, 6.5, 5, light);
      pen.circle(cx - 4.5, cy - 7, 1.8, ink2);
      pen.circle(cx + 4.5, cy - 7, 1.8, ink2);
      pen.ellipse(cx, cy + 1, 2.4, 1.8, ink2);
      pen.gloss(cx - 6, cy - 10, 3.5, 2, 0.6);
      break;
    }

    // 曲奇：饼干 + 巧克力豆
    case 'cookie': {
      pen.circle(cx, cy, 19, deep);
      pen.circle(cx, cy, 17.8, ink);
      pen.circle(cx, cy, 14.5, lighten(ink, 0.18));
      const chips = [[-7, -7], [6, -9], [10, 2], [-9, 4], [0, 10], [-3, -1]];
      for (const [dx, dy] of chips) {
        pen.circle(cx + dx, cy + dy, 2.6, deep, 0.9);
        pen.circle(cx + dx - 0.6, cy + dy - 0.8, 1, 0xffffff, 0.35);
      }
      pen.arc(cx, cy, 16, 195, 345, 2, 0xffffff, 0.35);
      break;
    }

    // 棉花糖
    case 'mallow': {
      pen.crrect(cx, cy, 33, 28, 10, lighten(ink, 0.45));
      pen.crrect(cx, cy - 3, 33, 22, 10, ink, 0.95);
      pen.ellipse(cx, cy - 9, 16.5, 6, 0xffffff, 0.75);
      pen.crrect(cx, cy + 10, 30, 6, 4, deep, 0.18);
      pen.circle(cx - 8, cy + 1, 1.7, 0xffffff, 0.9);
      pen.circle(cx + 8, cy + 1, 1.7, 0xffffff, 0.9);
      pen.gloss(cx - 9, cy - 12, 5, 2.4, 0.7);
      break;
    }

    // 巧克力：2×2 小格
    case 'choco': {
      pen.crrect(cx, cy, 34, 34, 6, deep);
      pen.crrect(cx, cy, 31, 31, 5, ink);
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          pen.crrect(cx - 7.5 + i * 15, cy - 7.5 + j * 15, 13, 13, 3, lighten(ink, 0.16));
          pen.crrect(cx - 7.5 + i * 15, cy - 9.5 + j * 15, 11, 5, 2, 0xffffff, 0.18);
        }
      }
      pen.crrect(cx - 5, cy - 13, 8, 3.5, 1.6, 0xffffff, 0.3);
      break;
    }

    // 果冻豆
    case 'jelly': {
      pen.ellipse(cx, cy + 1, 14, 19, deep, 0.9);
      pen.ellipse(cx, cy, 12.5, 17.5, ink);
      pen.ellipse(cx - 3.5, cy - 5, 7.5, 11, lighten(ink, 0.4), 0.9);
      pen.ellipse(cx - 5, cy - 9, 3.5, 5, 0xffffff, 0.65);
      pen.circle(cx + 5, cy + 9, 2, 0xffffff, 0.45);
      break;
    }

    // 冰棒
    case 'popsicle': {
      pen.crrect(cx, cy + 18, 6, 12, 3, 0xF3E3CF);
      pen.crrect(cx, cy - 2, 27, 34, 11, deep);
      pen.crrect(cx, cy - 2, 24.5, 31, 10, ink);
      pen.crrect(cx, cy - 9, 21, 12, 7, lighten(ink, 0.45), 0.9);
      pen.segment(cx, cy - 2, cx, cy + 12, 1.4, deep, 0.25);
      pen.gloss(cx - 7, cy - 10, 5, 3, 0.75);
      break;
    }

    // 水果糖：中间糖球 + 两侧糖纸
    default: {
      pen.triangle(cx - 12, cy, cx - 25, cy - 11, cx - 25, cy + 11, deep);
      pen.triangle(cx + 12, cy, cx + 25, cy - 11, cx + 25, cy + 11, deep);
      pen.triangle(cx - 13, cy, cx - 23, cy - 6, cx - 23, cy + 6, lighten(deep, 0.3));
      pen.triangle(cx + 13, cy, cx + 23, cy - 6, cx + 23, cy + 6, lighten(deep, 0.3));
      pen.circle(cx, cy, 13.5, deep);
      pen.circle(cx, cy, 12.2, ink);
      pen.arc(cx, cy, 8, 150, 330, 2.4, 0xffffff, 0.5);
      pen.arc(cx, cy, 4, 20, 140, 2.2, 0xffffff, 0.4);
      pen.gloss(cx - 5, cy - 6, 3.5, 2.2, 0.7);
      break;
    }
  }
}

function drawFrost(pen) {
  // 被压住的卡：半透明霜层，底下的糖仍隐约可见
  pen.rrect(0, 0, CARD_W, CARD_H, CARD_RADIUS, PALETTE.frost, 0.55);
  pen.rrect(3, 3, CARD_W - 6, CARD_H - 6, CARD_RADIUS - 2, PALETTE.frostEdge, 0.22);
  pen.rrectStroke(0.6, 0.6, CARD_W - 1.2, CARD_H - 1.2, CARD_RADIUS, 1.1, PALETTE.frostEdge, 0.45);
  // 斜向冰纹（很淡，像结霜）
  pen.segment(6, CARD_H - 12, CARD_W - 10, 10, 6, 0xffffff, 0.22);
  pen.segment(12, CARD_H - 4, CARD_W - 4, 22, 3, 0xffffff, 0.16);
  // 四角霜点
  const dots = [[9, 11, 2.0], [CARD_W - 11, 14, 1.6], [14, CARD_H - 14, 1.6], [CARD_W - 12, CARD_H - 10, 2.0]];
  for (const [x, y, r] of dots) pen.circle(x, y, r, 0xffffff, 0.7);
  // 中央小冰晶
  pen.segment(CARD_W / 2 - 5, CARD_H / 2, CARD_W / 2 + 5, CARD_H / 2, 1.4, 0xffffff, 0.5);
  pen.segment(CARD_W / 2, CARD_H / 2 - 5, CARD_W / 2, CARD_H / 2 + 5, 1.4, 0xffffff, 0.5);
}

// ───────────────── 烘焙入口 ─────────────────

export function bakeCardTextures(scene) {
  for (const candy of CANDIES) {
    const key = `candy_${candy.key}`;
    if (scene.textures.exists(key)) continue;

    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const pen = new Pen(g, SS);
    drawCardFrame(pen);
    drawCandyIcon(pen, candy, CX, CY);
    g.generateTexture(key, CARD_TEX_SIZE * SS, CARD_TEX_SIZE * SS);
    g.destroy();
  }

  if (!scene.textures.exists('frost')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const pen = new Pen(g, SS);
    drawFrost(pen);
    g.generateTexture('frost', CARD_W * SS, CARD_H * SS);
    g.destroy();
  }
}

// 卡面贴图统一的显示尺寸（逻辑像素）
export const CARD_TEX_DISPLAY = CARD_TEX_SIZE;
