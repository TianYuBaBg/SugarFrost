// 视口计算：浏览器 / 微信小游戏共用
//
// 设计比例 720×1280：渲染 buffer 用物理像素（WIDTH×HEIGHT = CSS×DPR），
// scale.zoom = 1/DPR 把 buffer 缩回 CSS 尺寸；场景里用 uiScale = WIDTH/720 做换算。

import { getViewport } from './platform.js';

const DESIGN_RATIO = 720 / 1280;

export const vp = getViewport();
export const DPR = Math.min(3, Math.max(1, Number(vp.dpr.toFixed(2))));

let cssW = Math.round(vp.width);
const cssH = Math.round(vp.height);
if (cssW / cssH > DESIGN_RATIO) cssW = Math.round(cssH * DESIGN_RATIO);

export const CSS_W = cssW;
export const CSS_H = cssH;
export const WIDTH = Math.round(cssW * DPR);
export const HEIGHT = Math.round(cssH * DPR);
