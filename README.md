# 糖霜消消 · SugarFrost

微信小游戏 + 网页双端的三消堆叠小游戏：甜点牌随机堆成塔，点开上层、凑齐三张同款即消除，**卡槽只有 7 格**，槽满即负，清空全部 108 张即通关。

玩法与关卡结构复刻自 `minigame-everyday/day-04-sheep`，美术全部程序化绘制（无图片资源），并额外做了一个关键改造：**每一局都保证存在通关路线**。

| 网页端 | 微信小游戏 |
| --- | --- |
| `npm start` → http://localhost:8080 | 微信开发者工具导入本目录（`compileType: game`） |

## 玩法

- 12 种甜点 × 9 张 = **108 张**牌；108 刚好是 36 组三连。
- 牌分两层意义：「谁压住谁」由位置 + z 层决定，跟你点没点过无关；被别的牌压住超过 **5%** 面积的牌会覆一层霜，不可点击。
- 点击可点的牌 → 飞入底部 7 格卡槽；同款牌会聚在一起插入，凑够 3 张自动消除并左移压缩。
- 卡槽满 7 张 → 失败；牌堆清空 → 通关。
- 点被压住的牌会有轻微抖动反馈。

## 保证有解（本项目的核心差异）

纯随机发牌 + 7 格卡槽的胜率极低（`tools/solver.mjs` 里几个策略实测 0/20），所以生成器改成三步构造：

1. **先摆位置**：6 摞 × 10 张（摞内错位、整摞 ±10° 倾斜、z 层随机错开）+ 48 张散卡，只决定几何遮挡关系。
2. **推演解序**：在纯几何关系上反复取「当前可点的牌」，得到一条能清空 108 张的合法顺序 `T`。
3. **沿 T 发牌型**：`T[0..2]` 给同一类、`T[3..5]` 给下一类……于是照着 `T` 玩必然通关，且槽内同时最多 3 张。

遮挡只由位置决定、与牌型无关，所以第 2 步得到的 `T` 在发完牌后依然合法。`tools/selftest.mjs` 会用真实规则把 20 个种子的 `solution` 全跑一遍验证。

## 目录

```
game.js  game.json  project.config.json   # 小游戏入口与工程配置
index.html                                 # 网页入口
js/
  main.js            # 视口 / DPR / Phaser 配置（竖屏 720×1280 设计比例）
  platform.js        # 浏览器 ↔ 微信 差异收敛（常亮、分享、前后台）
  scene/GameScene.js # 场景编排：卡堆、卡槽、动画、胜负结算
  core/
    config.js        # 数值与 12 种甜点定义
    rules.js         # 纯函数：遮挡判定、插入位置、三连查找、胜负
    LevelGenerator.js# 摆牌 → 解序 → 发牌型
    rng.js           # mulberry32 可复现随机
  art/
    palette.js  draw.js  CardArt.js  EnvironmentArt.js  # 程序化贴图烘焙
  libs/              # phaser.min.js(3.60) / weapp 适配器 / symbols
tools/
  serve.mjs          # 零依赖静态服务器
  selftest.mjs       # 40 项规则 + 生成器自测
  solver.mjs         # 策略胜率评估（证明为什么需要保证有解）
  browser-check.mjs  # puppeteer 交互冒烟：点牌 / 胜利 / 失败 / 重开
  playthrough.mjs    # 照解序真实点击 108 次，端到端验证通关
docs/superpowers/specs/2026-11-08-sugarfrost-design.md  # 设计文档
```

## 开发

```bash
npm start            # 起本地服务器 http://localhost:8080
npm run selftest     # 规则 / 生成器 40 项自测
npm run solve        # 策略胜率评估

# 浏览器端到端（需要本机 Chrome）
node tools/browser-check.mjs   # 点牌 / 胜利 / 失败 / 重开
node tools/playthrough.mjs     # 照解序真实点击 108 次，端到端验证通关
```

`npm start` 后访问 `http://localhost:8080/?seed=12345` 可以复现同一局（不传 seed 则每局随机）。

小游戏侧：微信开发者工具「导入项目」选择本目录，AppID 用测试号即可。`project.config.json` 里 `appid` 默认 `touristappid`，正式发布前替换成自己的。

## 实现要点

- **渲染**：`type: Phaser.CANVAS`（小游戏沙盒要求），渲染 buffer 用物理像素，`scale.zoom = 1/DPR` 缩回 CSS 尺寸；场景内统一 `uiScale = WIDTH / 720` 做逻辑坐标换算，超宽屏按 720:1280 裁切，避免卡槽被裁。
- **美术**：所有卡面、托盘、背景都用 `Graphics` 画好再 `generateTexture()` 烘成贴图（不用离屏 2D canvas，规避小游戏兼容问题）。被压住的牌用一张独立的半透明「霜层」贴图叠上去，而不是 `setTint`（Canvas 渲染器下 tint 代价高）。
- **遮挡**：改为增量重算——移走一张牌时，只重算「原来被它压住」的那些牌；`tools/selftest.mjs` 里与全量重算对拍，结果一致。
- **性能**：108 张牌 = 216 个 Image，不跑逐帧逻辑；背景是 360×640 的小贴图拉伸，静态绘制一次。

## 后续可加

- 音效与震动反馈；关卡递增（3 摞 → 6 摞）；道具（撤回 / 移出 3 张）；每日挑战（固定 seed）；排行榜与分享卡片。

## License

MIT
