// 微信小游戏入口：先适配器，再 Phaser（顺序不能反），最后按 js/game-mode.js 启动对应玩法

import './js/libs/weapp-phaser3-adapter.min.js';
import './js/libs/phaser.min.js';
import './js/libs/symbol.js';

import { Main } from './js/main.js';
import { FlowMain } from './js/flow-main.js';
import { MODE } from './js/game-mode.js';

// 小游戏侧报错直接打到 console，方便开发者工具里定位
if (typeof wx !== 'undefined' && typeof wx.onError === 'function') {
  wx.onError((res) => {
    console.error('[wx onError]', res && res.message, res && res.stack);
  });
}

if (MODE === 'flow') new FlowMain();
else new Main();
