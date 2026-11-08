// 卡面贴图：用 Graphics 画出「糖牌」，再 generateTexture() 烘焙成贴图。
// 每类糖一张正面贴图，另有共用的「压暗罩」（被压住）与三等「冰壳」（带霜）。

import {
  CARD_W,
  CARD_H,
  CARD_RADIUS,
  CARD_SHADOW_PAD,
  CANDIES,
  FROST_MAX_LAYERS,
} from '../core/config.js';
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

// 被压住：压暗 + 去光，刻意不含任何冰晶元素，免得和「结霜」混淆
// alpha 压得很轻（0.10）：既能看出「暗了一档」，又保留糖的辨识度
function drawShade(pen) {
  pen.rrect(0, 0, CARD_W, CARD_H, CARD_RADIUS, PALETTE.shade, 0.10);
  pen.rrectStroke(0.7, 0.7, CARD_W - 1.4, CARD_H - 1.4, CARD_RADIUS, 1.4, PALETTE.shade, 0.16);
}

// 一颗小冰晶：三条 60° 交叉的短线段
function crystal(pen, cx, cy, len, alpha) {
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    const dx = Math.cos(a) * len;
    const dy = Math.sin(a) * len;
    pen.segment(cx - dx, cy - dy, cx + dx, cy + dy, 1.5, 0xffffff, alpha);
  }
}

// 用 7 段数码管的笔段画 2/3（1 单独画），比拼小圆点更易读，也不用创建 Text 对象
const SEGMENTS = {
  2: ['a', 'b', 'g', 'e', 'd'],
  3: ['a', 'b', 'g', 'c', 'd'],
};

function drawDigit(pen, cx, cy, digit, color = PALETTE.frostPip) {
  const xL = cx - 3.1;
  const xR = cx + 3.1;
  const yT = cy - 4.4;
  const yM = cy;
  const yB = cy + 4.4;

  // 「1」单独画：居中的竖杠 + 左上小撇（用 7 段写法会像 7）
  if (digit === 1) {
    pen.segment(cx, yT, cx, yB, 2.2, color, 1);
    pen.segment(cx - 2.6, yT + 2.6, cx, yT, 2.0, color, 1);
    return;
  }

  const seg = {
    a: [xL, yT, xR, yT],
    b: [xR, yT, xR, yM],
    c: [xR, yM, xR, yB],
    d: [xL, yB, xR, yB],
    e: [xL, yM, xL, yB],
    f: [xL, yT, xL, yM],
    g: [xL, yM, xR, yM],
  };
  for (const key of SEGMENTS[digit] || []) {
    const [x1, y1, x2, y2] = seg[key];
    pen.segment(x1, y1, x2, y2, 2.0, color, 1);
  }
}

// 带霜：冰壳只压在「边缘与四角」，中央留清，保证糖的种类一眼可辨
function drawFrostShell(pen, layers) {
  // 1) 极淡的整体冷色罩（0.18，几乎不影响辨识，但能看出「蒙了一层」）
  pen.rrect(0, 0, CARD_W, CARD_H, CARD_RADIUS, PALETTE.frostShell, 0.18);

  // 2) 四角结冰：三层三角叠出柔和的霜沿
  const corner = (x, y, dx, dy) => {
    const layers3 = [[27, 0.14], [20, 0.26], [12, 0.5]];
    for (const [c, a] of layers3) {
      pen.triangle(x, y, x + dx * c, y, x, y + dy * c, 0xffffff, a);
    }
  };
  corner(0, 0, 1, 1);
  corner(CARD_W, 0, -1, 1);
  corner(0, CARD_H, 1, -1);
  corner(CARD_W, CARD_H, -1, -1);

  // 3) 冰缘：内圈一道亮边 + 外圈冷色描边
  pen.rrectStroke(2.4, 2.4, CARD_W - 4.8, CARD_H - 4.8, CARD_RADIUS - 2, 4.5, 0xffffff, 0.30);
  pen.rrectStroke(0.9, 0.9, CARD_W - 1.8, CARD_H - 1.8, CARD_RADIUS, 1.9, PALETTE.frostRim, 0.78);

  // 4) 冰晶点缀（避开中央的糖）
  crystal(pen, 13, CARD_H * 0.55, 5.2, 0.75);
  crystal(pen, CARD_W - 12, CARD_H * 0.62, 4.2, 0.6);

  // 5) 层数徽标：深蓝底 + 白数字（对比度最高）
  const bx = CARD_W - 15;
  const by = 16;
  pen.circle(bx, by + 0.8, 10.2, 0x2F4B6B, 0.18);
  pen.circle(bx, by, 10.2, PALETTE.frostDeep, 1);
  pen.circleStroke(bx, by, 10.2, 1.6, 0xffffff, 0.92);
  drawDigit(pen, bx, by, layers, 0xffffff);
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

  if (!scene.textures.exists('shade')) {
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const pen = new Pen(g, SS);
    drawShade(pen);
    g.generateTexture('shade', CARD_W * SS, CARD_H * SS);
    g.destroy();
  }

  // 带霜：每个层数一张冰壳（右上角数字不同）
  for (let layers = 1; layers <= FROST_MAX_LAYERS; layers++) {
    const key = `frost${layers}`;
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    const pen = new Pen(g, SS);
    drawFrostShell(pen, layers);
    g.generateTexture(key, CARD_W * SS, CARD_H * SS);
    g.destroy();
  }
}

// 卡面贴图统一的显示尺寸（逻辑像素）
export const CARD_TEX_DISPLAY = CARD_TEX_SIZE;
