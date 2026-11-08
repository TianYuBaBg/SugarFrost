// 平台适配：浏览器 / 微信小游戏
// 只做「能玩」所需的最小集合：视口尺寸、屏幕常亮、被动分享。

export const IS_WX = typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function';

// 视口（CSS 像素）与设备像素比
export function getViewport() {
  if (IS_WX) {
    const info = wx.getSystemInfoSync();
    return {
      dpr: info.pixelRatio || 1,
      width: info.windowWidth || info.screenWidth || 375,
      height: info.windowHeight || info.screenHeight || 667,
    };
  }
  if (typeof window !== 'undefined') {
    return {
      dpr: window.devicePixelRatio || 1,
      width: window.innerWidth || 375,
      height: window.innerHeight || 667,
    };
  }
  return { dpr: 1, width: 375, height: 667 };
}

export function setupPlatform() {
  if (!IS_WX) return;

  // 小游戏里别让屏幕自动锁屏
  if (wx.setKeepScreenOn) {
    wx.setKeepScreenOn({ keepScreenOn: true });
  }

  // 右上角菜单 + 转发
  if (wx.showShareMenu) {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
  }
  if (wx.onShareAppMessage) {
    wx.onShareAppMessage(() => ({ title: '糖霜消消 · 三张同款就消除', path: '/', imageUrl: '' }));
  }
  if (wx.onShareTimeline) {
    wx.onShareTimeline(() => ({ title: '糖霜消消 · 三张同款就消除' }));
  }

  // 被动转发按钮（若后续加 UI，可直接调 wx.shareAppMessage）
  if (wx.onShow) {
    wx.onShow(() => {
      if (wx.setKeepScreenOn) wx.setKeepScreenOn({ keepScreenOn: true });
    });
  }
}
