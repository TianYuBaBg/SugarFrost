// 《糖浆管道》启动入口
// 与糖霜消消共用视口换算（js/viewport.js）和平台适配（js/platform.js）

import { FlowScene } from './scene/FlowScene.js';
import { setupPlatform } from './platform.js';
import { DPR, WIDTH, HEIGHT } from './viewport.js';

export class FlowMain {
  constructor() {
    setupPlatform();

    const config = {
      type: Phaser.CANVAS,
      parent: 'phaser-example',
      scene: [FlowScene],
      scale: {
        mode: Phaser.Scale.NONE,
        width: WIDTH,
        height: HEIGHT,
        zoom: 1 / DPR,
      },
      render: { pixelArt: false, roundPixels: false, antialias: true },
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

    this.game = new Phaser.Game(config);
    // 调试用句柄：浏览器 window / 小游戏 GameGlobal 都能拿到
    if (typeof window !== 'undefined') window.__flowGame = this.game;
    if (typeof GameGlobal !== 'undefined') GameGlobal.__flowGame = this.game;
  }
}
