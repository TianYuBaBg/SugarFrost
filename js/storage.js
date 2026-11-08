// 本地存档：微信小游戏用 wx.storage，浏览器用 localStorage
//
// 抽出来是因为小游戏沙盒里没有 localStorage；两个玩法（糖霜消消 / 糖浆管道）共用。

import { IS_WX } from './platform.js';

export function readKey(key) {
  try {
    if (IS_WX && typeof wx.getStorageSync === 'function') {
      const v = wx.getStorageSync(key);
      if (v === '' || v === null || v === undefined) return null;
      return String(v);
    }
    if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
  } catch (e) {
    // 隐私模式 / 存储被禁用：当作没有存档
  }
  return null;
}

export function writeKey(key, value) {
  try {
    if (IS_WX && typeof wx.setStorageSync === 'function') {
      wx.setStorageSync(key, String(value));
      return;
    }
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(value));
  } catch (e) {
    // 写失败不影响游戏，最多下次重来
  }
}
