// pages/route-fav/index.js — 线路收藏页逻辑
const util = require('../../utils/util');

const STORAGE_KEY = 'route_favorites';

Page({
  data: {
    statusBarHeight: 20,
    list: []
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {
      this.setData({ statusBarHeight: 20 });
    }
  },

  onShow() {
    this.loadList();
  },

  // 读取收藏列表
  loadList() {
    let list = [];
    try {
      list = wx.getStorageSync(STORAGE_KEY) || [];
    } catch (e) {
      list = [];
    }
    this.setData({ list });
  },

  // 返回
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // 点击收藏项 -> 跳转线路页并恢复路线
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find(r => r.id === id);
    if (!item) return;

    // 通过 globalData 传递待恢复路线 (线路页为 tab 页，无法带参)
    const app = getApp();
    app.globalData.pendingRoute = {
      startName: item.startName,
      endName: item.endName,
      startCoord: item.startCoord,
      endCoord: item.endCoord
    };

    wx.switchTab({
      url: '/pages/route/index',
      success: () => {
        util.showToast('已加载该线路，可重新规划');
      }
    });
  },

  // 删除收藏
  onDel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要删除这条收藏的线路吗？',
      confirmColor: '#ee6c4d',
      success: (res) => {
        if (res.confirm) {
          let list = this.data.list.filter(r => r.id !== id);
          try {
            wx.setStorageSync(STORAGE_KEY, list);
          } catch (err) {}
          this.setData({ list });
          util.showToast('已删除');
        }
      }
    });
  },

  // 去规划线路
  goRoute() {
    wx.switchTab({ url: '/pages/route/index' });
  }
});
