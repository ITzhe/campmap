// pages/about/index.js — 关于页面逻辑
Page({
  data: {
    statusBarHeight: 20
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {
      this.setData({ statusBarHeight: 20 });
    }
  },

  // 返回
  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
