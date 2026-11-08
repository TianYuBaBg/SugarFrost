// 启动入口：按竖屏 720×1280 的设计比例铺满屏幕
//
// 视口计算抽到 js/viewport.js，两个游戏（糖霜消消 / 糖浆管道）共用同一套换算。

import { GameScene } from './scene/GameScene.js';
import { setupPlatform } from './platform.js';
import { DPR, WIDTH, HEIGHT } from './viewport.js';

export { DPR, WIDTH, HEIGHT };

export class Main {
  constructor() {
    setupPlatform();

    console.log('[main] viewport', { dpr: DPR, render: `${WIDTH}x${HEIGHT}` });

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
