// pages/privacy/index.js — 隐私协议页逻辑
Page({
  data: {
    statusBarHeight: 20
  },

  onLoad() {
    try {
      // 优先使用 getWindowInfo（基础库 2.20.1+），兼容回退 getSystemInfoSync
      if (wx.getWindowInfo) {
        const win = wx.getWindowInfo();
        this.setData({ statusBarHeight: win.statusBarHeight || 20 });
      } else {
        const sys = wx.getSystemInfoSync();
        this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
      }
    } catch (e) {
      this.setData({ statusBarHeight: 20 });
    }
  },

  // 返回
  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
