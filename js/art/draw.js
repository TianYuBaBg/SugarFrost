// 用逻辑坐标作画的画笔：内部统一乘以烘焙倍率 k，产出高 DPI 贴图。
//
// 说明：Phaser 3.60 的 Graphics 没有 fillEllipse，这里用多边形逼近；
// 所有圆角矩形都走 fillRoundedRect / strokeRoundedRect。

export class Pen {
  constructor(graphics, k) {
    this.g = graphics;
    this.k = k;
  }

  // ── 基础 ──
  fill(color, alpha = 1) {
    this.g.fillStyle(color, alpha);
    return this;
  }

  line(color, alpha = 1) {
    this.g.lineStyle(1 * this.k, color, alpha);
    return this;
  }

  strokeWidth(width, color, alpha = 1) {
    this.g.lineStyle(width * this.k, color, alpha);
    return this;
  }

  // 圆角矩形（左上角 + 宽高）
  rrect(x, y, w, h, r, color, alpha = 1) {
    this.g.fillStyle(color, alpha);
    this.g.fillRoundedRect(x * this.k, y * this.k, w * this.k, h * this.k, r * this.k);
    return this;
  }

  // 圆角矩形（中心 + 宽高）
  crrect(cx, cy, w, h, r, color, alpha = 1) {
    return this.rrect(cx - w / 2, cy - h / 2, w, h, r, color, alpha);
  }

  rrectStroke(x, y, w, h, r, width, color, alpha = 1) {
    this.g.lineStyle(width * this.k, color, alpha);
    this.g.strokeRoundedRect(x * this.k, y * this.k, w * this.k, h * this.k, r * this.k);
    return this;
  }

  // 圆角矩形描边（中心 + 宽高）
  crrectStroke(cx, cy, w, h, r, width, color, alpha = 1) {
    return this.rrectStroke(cx - w / 2, cy - h / 2, w, h, r, width, color, alpha);
  }

  circle(cx, cy, r, color, alpha = 1) {
    this.g.fillStyle(color, alpha);
    this.g.fillCircle(cx * this.k, cy * this.k, r * this.k);
    return this;
  }

  circleStroke(cx, cy, r, width, color, alpha = 1) {
    this.g.lineStyle(width * this.k, color, alpha);
    this.g.strokeCircle(cx * this.k, cy * this.k, r * this.k);
    return this;
  }

  ellipse(cx, cy, rx, ry, color, alpha = 1, seg = 28) {
    const pts = [];
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      pts.push({ x: (cx + Math.cos(a) * rx) * this.k, y: (cy + Math.sin(a) * ry) * this.k });
    }
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(pts, true);
    return this;
  }

  // 圆弧描边（角度制）
  arc(cx, cy, r, fromDeg, toDeg, width, color, alpha = 1) {
    this.g.lineStyle(width * this.k, color, alpha);
    this.g.beginPath();
    this.g.arc(cx * this.k, cy * this.k, r * this.k,
      Phaser.Math.DegToRad(fromDeg), Phaser.Math.DegToRad(toDeg), false);
    this.g.strokePath();
    return this;
  }

  // 多边形填充（逻辑坐标点数组）
  poly(points, color, alpha = 1) {
    const pts = points.map((p) => ({ x: p[0] * this.k, y: p[1] * this.k }));
    this.g.fillStyle(color, alpha);
    this.g.fillPoints(pts, true);
    return this;
  }

  quad(x1, y1, x2, y2, x3, y3, x4, y4, color, alpha = 1) {
    return this.poly([[x1, y1], [x2, y2], [x3, y3], [x4, y4]], color, alpha);
  }

  triangle(x1, y1, x2, y2, x3, y3, color, alpha = 1) {
    return this.poly([[x1, y1], [x2, y2], [x3, y3]], color, alpha);
  }

  segment(x1, y1, x2, y2, width, color, alpha = 1) {
    this.g.lineStyle(width * this.k, color, alpha);
    this.g.beginPath();
    this.g.moveTo(x1 * this.k, y1 * this.k);
    this.g.lineTo(x2 * this.k, y2 * this.k);
    this.g.strokePath();
    return this;
  }

  // 圆头细棒（糖针、巧克力棒）：把线段画成 capsule
  capsule(x1, y1, x2, y2, width, color, alpha = 1) {
    this.segment(x1, y1, x2, y2, width, color, alpha);
    this.circle(x1, y1, width / 2, color, alpha);
    this.circle(x2, y2, width / 2, color, alpha);
    return this;
  }

  // 左上高光：白色柔光椭圆
  gloss(cx, cy, rx, ry, alpha = 0.55) {
    return this.ellipse(cx, cy, rx, ry, 0xffffff, alpha);
  }
}
