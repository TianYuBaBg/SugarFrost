// 新手演示关：手写的 4×4 小局，两条糖浆，不需要生成器
//
// 教学目的（按学习顺序）：
//   1) 从圆点开始按住往下拖
//   2) 沿格子走，走过的格子被填满
//   3) 拖到另一个同色圆点 → 这一条通了
//   4) 拐弯也算连通，剩下的路要自己找
//
// 形状刻意做得简单：左边一条直管（只要往下拖），剩下的是"蛇形"管
// （需要拐弯，并且必须把剩余格子全填满），一局 15 秒能通。

const p = (x, y) => ({ x, y });

// 左列直管：从上到下
const STRAIGHT = [p(0, 0), p(0, 1), p(0, 2), p(0, 3)];

// 剩下的 3 列蛇形：从 (1,3) 往上冲到 (1,0)，横到 (2,0)，再往下到 (2,3)，
// 横到 (3,3)，再往上到 (3,0)
const SNAKE = [
  p(1, 3), p(1, 2), p(1, 1), p(1, 0),
  p(2, 0), p(2, 1), p(2, 2), p(2, 3),
  p(3, 3), p(3, 2), p(3, 1), p(3, 0),
];

const makePath = (color, cells) => ({
  color,
  cells,
  a: cells[0],
  b: cells[cells.length - 1],
  len: cells.length,
});

export function tutorialPuzzle() {
  const paths = [makePath(0, STRAIGHT), makePath(1, SNAKE)];
  return {
    w: 4,
    h: 4,
    colors: paths.length,
    paths,
    frost: [],
    seed: 0,
    // 教学顺序：先直管，再蛇形
    order: [0, 1],
  };
}

export const TUTORIAL_STEPS = [
  { key: 'drag', text: '按住粉色圆点，往下一路拖到底' },
  { key: 'done1', text: '就是这样！这一条通了' },
  { key: 'snake', text: '再来一条：拐弯也能连，把剩下的格子填满' },
  { key: 'done2', text: '全部填满 → 过关！' },
];
