// 《糖霜消消》配色：奶油底色 + 莓果 / 薄荷 / 蜂蜜三组粉彩
// 所有颜色集中在这里，方便整体调色

export const PALETTE = {
  // 背景渐变（由上到下）
  bgTop: 0xFFF2F7,      // 糖霜粉
  bgMid: 0xFBEEFF,      // 薰衣草
  bgBottom: 0xE7F2FF,   // 薄荷蓝
  bgDot: 0xFFFFFF,      // 背景糖粒
  bgBlob: 0xFFE3F0,     // 背景大色块

  // 卡面
  cardFace: 0xFFFDFB,
  cardBorder: 0xFFFFFF,
  cardOutline: 0xE8C9DA,
  cardShadow: 0x8A5C75,

  // 卡槽托盘
  trayBody: 0xFCE3EE,
  trayBodyTop: 0xFFF3F8,
  trayEdge: 0xEFBFD6,
  trayWell: 0xF3C7DC,
  trayWellDeep: 0xE5AAC7,
  trayShadow: 0x9C5D7C,

  // HUD 文字
  ink: 0x6B3F58,
  inkSoft: 0x9A6B84,
  gold: 0xF2B33D,

  // 冻结遮罩
  frost: 0xEAF4FF,
  frostEdge: 0xAECDEB,

  // 通用
  white: 0xFFFFFF,
  black: 0x000000,
};

// 0xRRGGBB → '#rrggbb'
export function hex(color) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// 以 alpha 叠一层白/黑，快速得到同色系深色（0..1 的 amount 表示向黑混合比例）
export function darken(color, amount) {
  const r = Math.round(((color >> 16) & 0xff) * (1 - amount));
  const g = Math.round(((color >> 8) & 0xff) * (1 - amount));
  const b = Math.round((color & 0xff) * (1 - amount));
  return (r << 16) | (g << 8) | b;
}

export function lighten(color, amount) {
  const r = Math.round(((color >> 16) & 0xff) + (255 - ((color >> 16) & 0xff)) * amount);
  const g = Math.round(((color >> 8) & 0xff) + (255 - ((color >> 8) & 0xff)) * amount);
  const b = Math.round((color & 0xff) + (255 - (color & 0xff)) * amount);
  return (r << 16) | (g << 8) | b;
}
