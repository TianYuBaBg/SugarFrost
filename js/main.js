// 启动入口：按竖屏 720×1280 的设计比例铺满屏幕
//
// 与 day-04-sheep 相同的 DPR 方案：
//   - 渲染 buffer 用物理像素（WIDTH×HEIGHT = CSS×DPR）
//   - scale.zoom = 1/DPR 把 buffer 缩回 CSS 尺寸
//   - 场景里统一用 uiScale = WIDTH / 720 做「逻辑 → 屏幕」换算

import { GameScene } from './scene/GameScene.js';
import { getViewport, setupPlatform } from './platform.js';

const vp = getViewport();
export const DPR = Math.min(3, Math.max(1, Number(vp.dpr.toFixed(2))));

const DESIGN_RATIO = 720 / 1280;

let CSS_W = Math.round(vp.width);
const CSS_H = Math.round(vp.height);
// 桌面宽屏时限制为竖屏比例，避免底部卡槽被裁掉
if (CSS_W / CSS_H > DESIGN_RATIO) {
  CSS_W = Math.round(CSS_H * DESIGN_RATIO);
}

export const WIDTH = Math.round(CSS_W * DPR);
export const HEIGHT = Math.round(CSS_H * DPR);

export class Main {
  constructor() {
    setupPlatform();

    console.log('[main] viewport', { dpr: DPR, css: `${CSS_W}x${CSS_H}`, render: `${WIDTH}x${HEIGHT}` });

    const config = {
      // 微信小游戏沙盒要求显式指定渲染类型
      type: Phaser.CANVAS,
      parent: 'phaser-example',
      scene: [GameScene],
      scale: {
        mode: Phaser.Scale.NONE,
        width: WIDTH,
        height: HEIGHT,
        zoom: 1 / DPR,
      },
      render: {
        pixelArt: false,
        roundPixels: false,
        antialias: true,
      },
      backgroundColor: '#fdf1f7',
      fps: { target: 60, forceSetTimeOut: true },
      banner: false,
      audio: { noAudio: true },
    };

    if (typeof window !== 'undefined' && window.canvas) {
      config.canvas = window.canvas;
    } else if (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) {
      config.canvas = GameGlobal.canvas;
    }

    // eslint-disable-next-line no-new
    this.game = new Phaser.Game(config);

    // 调试/自动化测试句柄（浏览器端）
    if (typeof window !== 'undefined') window.__game = this.game;
  }
}
