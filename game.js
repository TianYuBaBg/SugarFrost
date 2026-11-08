// 微信小游戏入口：先适配器，再 Phaser（顺序不能反），最后启动 Main
import './js/libs/weapp-phaser3-adapter.min.js';
import './js/libs/phaser.min.js';
import './js/libs/symbol.js';

import { Main } from './js/main.js';

new Main();
