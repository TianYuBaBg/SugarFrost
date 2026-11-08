# 糖霜消消 · SugarFrost

微信小游戏 + 网页双端的三消堆叠小游戏：甜点牌随机堆成塔，点开上层、凑齐三张同款即消除，**卡槽只有 7 格**，槽满即负，清空全部 108 张即通关。

玩法骨架复刻自 `minigame-everyday/day-04-sheep`，美术全部程序化绘制（无图片资源），并做了两处关键改造：**每局都保证存在通关路线**，以及自创的 **糖霜（frost）机制**。

| 网页端 | 微信小游戏 |
| --- | --- |
| 在线试玩 <https://tianyubabg.github.io/SugarFrost/> · 本地 `npm start` → http://localhost:8080 | 微信开发者工具导入本目录（`compileType: game`） |

> 另有一个连线解谜原型《糖浆管道》：<https://tianyubabg.github.io/SugarFrost/flow.html>（本地 `http://localhost:8080/flow.html`），见文末「第二种玩法」。

## 玩法

- 12 种甜点 × 9 张 = **108 张**牌；108 刚好是 36 组三连。
- 「谁压住谁」由位置 + z 层决定，跟你点没点过无关；被别的牌压住超过 **5%** 面积的牌会压暗一档，不可点击。
- 点击可点的牌 → 飞入底部 7 格卡槽；同款牌会聚在一起插入，凑够 3 张自动消除并左移压缩。
- 卡槽满 7 张 → 失败；牌堆清空 → 通关。
- 点被压住的牌会有轻微抖动反馈。

## 糖霜机制（自创）

一局里有 **36 张（1/3）** 的牌裹着 1~3 层糖霜（右上角数字就是层数）：

- **带霜的牌不能点**，点它只会让冰壳闪一下。
- **抽走一张牌时，它原位置周围接触到的牌各融一层**（矩形最近距离 ≤ 12px，被压住的牌也算）。
- 于是「拆上层」这个动作本身就在给下层铺路：先拆谁，决定哪一片冰先化。

霜不是随机的装饰，它被约束在**能化完**的范围里：生成器沿解序 `T` 预先算出每张牌「轮到自己之前会被加热几次」（`computeHeatBudget`），再强制 `frostLayers ≤ heatBudget`。所以照 `T` 走时，每张牌轮到时霜必定已经化光——保证有解的结论在加了霜之后依然成立（`tools/selftest.mjs` 会真的模拟一遍）。

实测衰减（12 局平均，照 `T` 抽牌）：36 张 → 抽 10 张剩 26 → 20 张剩 18 → 30 张剩 10 → 40 张剩 4.5，霜集中在前半局；不按解序乱拆时，霜会真的卡住手牌，这是它惩罚「随手点」的地方。

## 保证有解（本项目的核心差异）

纯随机发牌 + 7 格卡槽的胜率极低（`tools/solver.mjs` 里几个策略实测 0/20），所以生成器改成三步构造：

1. **先摆位置**：6 摞 × 10 张（摞内错位、整摞 ±10° 倾斜、z 层随机错开）+ 48 张散卡，只决定几何遮挡关系。
2. **推演解序**：在纯几何关系上反复取「当前可点的牌」，得到一条能清空 108 张的合法顺序 `T`。
3. **沿 T 发牌型**：`T[0..2]` 给同一类、`T[3..5]` 给下一类……于是照着 `T` 玩必然通关，且槽内同时最多 3 张。

遮挡只由位置决定、与牌型无关，所以第 2 步得到的 `T` 在发完牌后依然合法。`tools/selftest.mjs` 会用真实规则把 20 个种子的 `solution` 全跑一遍验证。

## 目录

```
game.js  game.json  project.config.json   # 小游戏入口与工程配置
index.html                                 # 网页入口（糖霜消消）
flow.html                                  # 网页入口（糖浆管道）
js/
  viewport.js        # 视口 / DPR 换算（两种玩法共用）
  main.js            # Phaser 配置与启动（竖屏 720×1280 设计比例）
  flow-main.js       # 糖浆管道启动入口
  platform.js        # 浏览器 ↔ 微信 差异收敛（常亮、分享、前后台）
  scene/GameScene.js # 场景编排：卡堆、卡槽、糖霜、动画、胜负结算
  scene/FlowScene.js # 糖浆管道：拖拽绘线、冰封融化、关卡推进
  core/
    config.js        # 数值与 12 种甜点定义
    rules.js         # 纯函数：遮挡判定、插入位置、三连查找、胜负
    frost.js         # 纯函数：受热判定、扣层、受热预算、发霜
    LevelGenerator.js# 摆牌 → 解序 → 发牌型 → 发霜
    rng.js           # mulberry32 可复现随机
    flow.js          # 纯函数：糖浆管道生成 / 解序 / 胜负 / 难度曲线
  art/
    palette.js  draw.js  CardArt.js  EnvironmentArt.js  # 程序化贴图烘焙（糖霜消消）
    FlowArt.js       # 程序化贴图烘焙（糖浆管道：棋盘 / 端点 / 冰壳）
  libs/              # phaser.min.js(3.60) / weapp 适配器 / symbols
tools/
  serve.mjs          # 零依赖静态服务器
  selftest.mjs       # 64 项规则 + 生成器 + 糖霜自测
  solver.mjs         # 策略胜率评估（证明为什么需要保证有解）
  browser-check.mjs  # puppeteer 交互冒烟：点牌 / 融霜 / 胜利 / 失败 / 重开
  playthrough.mjs    # 照解序真实点击 108 次，端到端验证通关
  flow-selftest.mjs  # 糖浆管道逻辑自测（1216 项）
  flow-check.mjs     # 糖浆管道 puppeteer 真实拖拽
docs/superpowers/specs/2026-11-08-sugarfrost-design.md              # 设计文档
docs/superpowers/specs/2026-11-08-sugarfrost-frost-mechanic-design.md # 糖霜机制设计
```

## 开发

```bash
npm start            # 起本地服务器 http://localhost:8080
npm run selftest     # 规则 / 生成器 / 糖霜 64 项自测
npm run solve        # 策略胜率评估
npm run flow         # 糖浆管道逻辑自测
npm run flow-check   # 糖浆管道拖拽实测（需要本机 Chrome）

# 浏览器端到端（需要本机 Chrome）
node tools/browser-check.mjs   # 点牌 / 融霜 / 胜利 / 失败 / 重开
node tools/playthrough.mjs     # 照解序真实点击 108 次，端到端验证通关
```

`npm start` 后访问 `http://localhost:8080/?seed=12345` 可以复现同一局（不传 seed 则每局随机）。

小游戏侧：微信开发者工具「导入项目」选择本目录，AppID 用测试号即可。`project.config.json` 里 `appid` 默认 `touristappid`，正式发布前替换成自己的。

## 实现要点

- **渲染**：`type: Phaser.CANVAS`（小游戏沙盒要求），渲染 buffer 用物理像素，`scale.zoom = 1/DPR` 缩回 CSS 尺寸；场景内统一 `uiScale = WIDTH / 720` 做逻辑坐标换算，超宽屏按 720:1280 裁切，避免卡槽被裁。
- **美术**：所有卡面、托盘、背景都用 `Graphics` 画好再 `generateTexture()` 烘成贴图（不用离屏 2D canvas，规避小游戏兼容问题）。三种状态用三张独立贴图叠加：卡面 `candy_*`、被压住 `shade`、带霜 `frost1/2/3`（不用 `setTint`，Canvas 渲染器下 tint 代价高）。
- **霜的视觉**：只压边缘与四角，中央留清，保证被冻住的糖仍能一眼认出；层数用烘焙好的 7 段数字（`Graphics` 画，不用 `Text`——108 个 Text 会各自回读 canvas，移动端有性能风险）。
- **点击命中**：Phaser 的 input 排序不按 depth，改成自己按 `sprite.depth` 从高到低做 `getWorldTransformMatrix().applyInverse()` 命中测试，避免「点到视觉下方的牌」。
- **遮挡**：增量重算——移走一张牌时，只重算「原来被它压住」的那些牌；`tools/selftest.mjs` 里与全量重算对拍，结果一致。
- **性能**：108 张牌 = 324 个 Image（卡面/压暗/冰壳），不跑逐帧逻辑；背景是 360×640 的小贴图拉伸，静态绘制一次。

## 后续可加

- 音效与震动反馈；关卡递增（3 摞 → 6 摞）；道具（撤回 / 移出 3 张）；每日挑战（固定 seed）；排行榜与分享卡片。

## 第二种玩法：糖浆管道（实验）

`flow.html` 是独立入口的连线解谜原型，和糖霜消消共用视口换算、程序化美术管线与静态服务器，但玩法完全不同：

- 每种糖浆有一对端点，**从一端拖到另一端**把它连通；
- **所有格子都要被糖浆填满**，不同颜色不能交叉；
- 部分端点被**冰封**（1~2 层）：糖浆画到它旁边才融一层，融完才能接入——这让「先连哪条」变成策略（复用糖霜消消的接触受热逻辑）；
- 没有失败，只有「卡住」：可随时撤销上一步或整体重来，点已连通的端点会把那条线撤掉。

生成方式同样是「先造解、再藏解」：先用 backbite 算法随机走出一条覆盖全盘的哈密顿路径，再随机切成 N 段、每段首尾当端点，剩下的格子擦掉。**被擦掉的那套分段就是答案**，所以每关必定有解；带冰封的关卡再用 `solveOrder()` 推演一遍，确认「存在一种落笔顺序能全部连通」，否则自动降级（少一层霜 → 去掉霜 → 换一张图）。难度曲线由 `levelConfig(level)` 控制：6×6 三色 → 6×7 四色 → 7×8 五色（带冰封）→ 8×9 六色。

调试参数：`flow.html?level=12&seed=20261108`；不传 `level` 时读 localStorage 里的进度（通关后自动 +1）。

| 关键文件 | 作用 |
| --- | --- |
| `js/core/flow.js` | 关卡生成、`solveOrder`、`isSolved`、难度曲线 |
| `js/scene/FlowScene.js` | 拖拽绘线、冰封拦截与融化、撤销/重来、结算与关卡推进 |
| `js/art/FlowArt.js` | 棋盘、端点、冰壳的程序化烘焙 |
| `tools/flow-selftest.mjs` | 纯逻辑自测：合法性 / 每关有解 / 结霜可解 / 同 seed 确定性 |
| `tools/flow-check.mjs` | puppeteer：按解序拖完通关、冰封点不动、画到旁边会解冻、下一关、重来 |

> 目前这个原型只挂了网页入口；微信小游戏侧仍是糖霜消消（`compileType: game`，入口 `game.js`）。

## License

MIT
