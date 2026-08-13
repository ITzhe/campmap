// pages/settings/index.js — 设置页面逻辑
const util = require('../../utils/util');

// 应用版本号常量
const APP_VERSION = 'v1.0.2';

Page({
  data: {
    statusBarHeight: 20,
    version: APP_VERSION,
    nickName: '',
    // 默认缩放级别选项
    zoomLevels: ['低 (3-8)', '中 (9-12)', '高 (13-16)', '超高 (17-20)'],
    zoomIndex: 1,
    // 通知开关
    notifyCamp: true,   // 营地推荐通知
    notifyEvent: true,  // 活动通知
    // 地图开关
    showRvCamp: true,   // 显示房车营地
    // 缓存大小
    cacheSize: '0 KB'
  },

  onLoad() {
    let sbh = 20;
    try {
      if (wx.getWindowInfo) {
        sbh = wx.getWindowInfo().statusBarHeight;
      } else {
        sbh = wx.getSystemInfoSync().statusBarHeight;
      }
    } catch (e) {}
    this.setData({ statusBarHeight: sbh });
    this.loadSettings();
    this.loadCacheSize();
    this.loadNickName();
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // ============ 昵称管理 ============
  loadNickName() {
    const u = util.getUserState();
    this.setData({ nickName: u.nick || '露营爱好者' });
  },

  onNickInput(e) {
    this.setData({ nickName: e.detail.value });
  },

  onNickBlur(e) {
    let nick = (e.detail.value || '').trim();
    if (!nick) {
      nick = '露营爱好者';
    }
    const u = util.getUserState();
    u.nick = nick;
    util.saveUser(u);
    this.setData({ nickName: nick });
    util.showToast('昵称已保存');
  },

  // ============ 读取 / 保存设置 ============
  loadSettings() {
    try {
      const s = wx.getStorageSync('camp_settings') || {};
      this.setData({
        notifyCamp: typeof s.notifyCamp === 'boolean' ? s.notifyCamp : true,
        notifyEvent: typeof s.notifyEvent === 'boolean' ? s.notifyEvent : true,
        zoomIndex: typeof s.zoomIndex === 'number' ? s.zoomIndex : 1,
        showRvCamp: typeof s.showRvCamp === 'boolean' ? s.showRvCamp : true
      });
    } catch (e) {}
  },

  saveSettings() {
    try {
      wx.setStorageSync('camp_settings', {
        notifyCamp: this.data.notifyCamp,
        notifyEvent: this.data.notifyEvent,
        zoomIndex: this.data.zoomIndex,
        showRvCamp: this.data.showRvCamp
      });
    } catch (e) {}
  },

  // ============ 通知设置 ============
  onNotifyCampChange(e) {
    this.setData({ notifyCamp: e.detail.value }, () => {
      this.saveSettings();
      util.showToast(e.detail.value ? '已开启营地推荐通知' : '已关闭营地推荐通知');
    });
  },

  onNotifyEventChange(e) {
    this.setData({ notifyEvent: e.detail.value }, () => {
      this.saveSettings();
      util.showToast(e.detail.value ? '已开启活动通知' : '已关闭活动通知');
    });
  },

  // ============ 地图设置 ============
  onZoomChange(e) {
    const idx = Number(e.detail.value);
    this.setData({ zoomIndex: idx }, () => {
      this.saveSettings();
      const labels = ['低缩放 (3-8级)', '中缩放 (9-12级)', '高缩放 (13-16级)', '超高缩放 (17-20级)'];
      wx.showModal({
        title: '设置已保存',
        content: '默认缩放级别已设为：' + labels[idx] + '\n\n下次打开地图首页时生效。',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#2d6a4f'
      });
    });
  },

  onShowRvChange(e) {
    this.setData({ showRvCamp: e.detail.value }, () => {
      this.saveSettings();
      util.showToast(e.detail.value ? '已显示房车营地' : '已隐藏房车营地');
    });
  },

  // ============ 缓存管理 ============
  loadCacheSize() {
    try {
      const info = wx.getStorageInfoSync();
      const kb = info.currentSize || 0;
      const sizeStr = kb < 1024
        ? (kb + ' KB')
        : ((kb / 1024).toFixed(2) + ' MB');
      this.setData({ cacheSize: sizeStr });
    } catch (e) {
      this.setData({ cacheSize: '0 KB' });
    }
  },

  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '将清除本地缓存数据，不会影响您的账号与积分，确定继续吗？',
      confirmColor: '#ee6c4d',
      success: (res) => {
        if (!res.confirm) return;
        try {
          // 清除缓存时保留账号与个人设置
          const user = wx.getStorageSync('camp_user');
          const settings = wx.getStorageSync('camp_settings');
          wx.clearStorageSync();
          if (user) wx.setStorageSync('camp_user', user);
          if (settings) wx.setStorageSync('camp_settings', settings);
          this.loadCacheSize();
          util.showToast('缓存已清除');
        } catch (e) {
          util.showToast('清除失败，请重试');
        }
      }
    });
  },

  // ============ 关于 ============
  checkUpdate() {
    util.showLoading('检查更新中...');
    setTimeout(() => {
      util.hideLoading();
      wx.showModal({
        title: '检查更新',
        content: '当前版本 ' + APP_VERSION + '，已是最新版本。',
        showCancel: false,
        confirmText: '知道了'
      });
    }, 800);
  },

  openAgreement() {
    util.showToast('用户协议开发中');
  },

  openPrivacy() {
    util.showToast('隐私政策开发中');
  },

  // ============ 退出登录 ============
  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      confirmColor: '#ee6c4d',
      success: (res) => {
        if (!res.confirm) return;
        try { wx.removeStorageSync('camp_user'); } catch (e) {}
        const app = getApp();
        if (app && app.globalData) {
          app.globalData.points = 0;
          app.globalData.streak = 0;
        }
        util.showToast('已退出登录');
        setTimeout(() => {
          wx.navigateBack({ delta: 1 });
        }, 1000);
      }
    });
  }
});
