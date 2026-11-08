// 《糖霜消消》SugarFrost · 全局常量
//
// 核心规则（与 day-04-sheep 100% 同款）：
//   牌堆 108 张（12 类 × 9 张）→ 点击未被遮挡的牌 → 主槽 7 格
//   槽内同类型自动聚合 → 连续 3 张同类消除 → 槽满 7 张判负 / 牌堆清空判胜

// ───────────────── 逻辑分辨率（竖屏基准） ─────────────────
export const LEVEL_LOGICAL_W = 720;
export const LEVEL_LOGICAL_H = 1280;

// ───────────────── 牌型 ─────────────────
export const CARD_TYPES = 12;
export const CARDS_PER_TYPE = 9;
export const TOTAL_CARDS = CARD_TYPES * CARDS_PER_TYPE; // 108

// 12 种糖霜甜点：bg = 卡面底色（浅糖霜色）/ ink = 主体糖色 / ink2 = 深色细节
export const CANDIES = [
  { key: 'donut', name: '甜甜圈', bg: 0xFDE3EE, ink: 0xE879A8, ink2: 0xB4477A },
  { key: 'lollipop', name: '棒棒糖', bg: 0xFFE0E0, ink: 0xF25C5C, ink2: 0xB73333 },
  { key: 'macaron', name: '马卡龙', bg: 0xDDF6EC, ink: 0x4FC79B, ink2: 0x1E8A63 },
  { key: 'cupcake', name: '纸杯蛋糕', bg: 0xEBE2FF, ink: 0x9B7BEA, ink2: 0x6142B0 },
  { key: 'cone', name: '冰淇淋筒', bg: 0xFFEFD8, ink: 0xE9A24C, ink2: 0xA96B1F },
  { key: 'bear', name: '小熊软糖', bg: 0xFFE7D3, ink: 0xF58B3E, ink2: 0xA9520F },
  { key: 'cookie', name: '曲奇', bg: 0xF6E8D5, ink: 0xC08A4E, ink2: 0x7C4E1E },
  { key: 'mallow', name: '棉花糖', bg: 0xE6F3FF, ink: 0x7FB3E8, ink2: 0x3F78B0 },
  { key: 'choco', name: '巧克力', bg: 0xEADBCE, ink: 0x8C5A3C, ink2: 0x4E2E1B },
  { key: 'jelly', name: '果冻豆', bg: 0xE8FADC, ink: 0x86CF4A, ink2: 0x4C8A1E },
  { key: 'popsicle', name: '冰棒', bg: 0xDCEBFF, ink: 0x5D9BE8, ink2: 0x2B62A8 },
  { key: 'candy', name: '水果糖', bg: 0xFFF4D2, ink: 0xF2C233, ink2: 0xA97C09 },
];

export const CANDY_KEYS = CANDIES.map((c) => c.key);

// ───────────────── 卡槽 ─────────────────
export const SLOT_CAPACITY = 7;   // 主槽格数
export const TRIPLE_COUNT = 3;    // 三张同色消除

// ───────────────── 卡片尺寸（逻辑像素，正方形） ─────────────────
export const CARD_W = 76;
export const CARD_H = 76;
export const CARD_RADIUS = 16;
export const CARD_SHADOW_PAD = 9;   // 烘焙贴图时给投影留的边距（逻辑像素）

// ───────────────── 遮挡判定 ─────────────────
export const OCCLUSION_THRESHOLD = 0.05; // 被覆盖面积超过 5% 即视为被压住

// ───────────────── 牌堆混合堆叠参数（1:1 复刻 day-04） ─────────────────
export const PILE_COUNT = 6;         // 6 摞
export const PILE_HEIGHT = 10;       // 每摞 10 张 → 60 张，剩 48 张散卡
export const PILE_OFFSET_X = 2.5;    // 摞内每往上一张的 X 偏移
export const PILE_OFFSET_Y = -3.5;   // 摞内每往上一张的 Y 偏移
export const SCATTER_LAYERS = 8;     // 散卡 z 层跨度
export const SCATTER_JITTER = 0.92;  // 散卡位置抖动幅度（0-1）
export const PILE_GRID_COLS = 3;     // 摞心 3 列
export const PILE_GRID_ROWS = 2;     // 摞心 2 行 = 6 个 anchor

// ───────────────── 区域布局 ─────────────────
export const HUD_HEIGHT = 230;        // 顶部 HUD 高度（含刘海安全区）
export const PILE_MARGIN_X = 30;      // 牌堆区左右留白
export const PILE_TOP_GAP = 30;       // 牌堆区与 HUD 的间距
export const PILE_BOTTOM_GAP = 40;    // 牌堆区与卡槽的间距

export const SLOT_BAR_W = 662;        // 卡槽托盘逻辑宽度（720 × 0.92）
export const SLOT_CELL_W = 80;        // 单个凹槽宽
export const SLOT_CELL_H = 80;        // 单个凹槽高
export const SLOT_CELL_GAP = 4;       // 相邻凹槽间距
export const SLOT_PAD_Y = 12;         // 托盘上下内边距
export const SLOT_BAR_H = SLOT_CELL_H + SLOT_PAD_Y * 2; // 104
export const SLOT_BAR_MARGIN_BOTTOM = 24; // 托盘距屏幕底部

// ───────────────── HUD 文本位置（逻辑像素，另加刘海安全偏移） ─────────────────
export const HUD_SAFE_OFFSET = 90;
export const HUD_TITLE_Y = 46;
export const HUD_STATUS_Y = 100;
export const HUD_HINT_Y = 140;

// ───────────────── 动画时长（毫秒） ─────────────────
export const ANIM_FLY_TO_SLOT = 280;
export const ANIM_SLOT_SHIFT = 180;
export const ANIM_TRIPLE_REMOVE = 220;
export const ANIM_SLOT_COMPACT = 220;
