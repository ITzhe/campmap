// app.js — 营图小程序入口
const { initUser, getUserState, getNearestCity } = require('./utils/util');

App({
  globalData: {
    userInfo: null,
    openid: null,
    points: 0,
    streak: 0,
    lastCheckin: null,
    joinDate: null,
    selectedCamp: null,
    filters: { fee: 'all', park: [], fac: [] },
    cityCenter: { latitude: 36.0671, longitude: 120.3826 },
    cityName: '青岛',
    cityChanged: false,
    locationReady: false
  },

  onLaunch() {
    // 初始化用户数据
    const userData = initUser();
    this.globalData.openid = userData.openid;
    this.globalData.points = userData.points;
    this.globalData.streak = userData.streak;
    this.globalData.lastCheckin = userData.lastCheckin;
    this.globalData.joinDate = userData.joinDate;

    // 注册全局隐私授权处理器
    // 注意: 不在 onLaunch 中调用 getLocation, 避免隐私弹窗与页面渲染冲突
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve) => {
        wx.showModal({
          title: '隐私保护提示',
          content: '营图需要获取您的位置信息以显示附近露营地。您可以在「我的-隐私协议」查看完整政策。如同意请点击确定。',
          confirmText: '同意',
          cancelText: '拒绝',
          confirmColor: '#2d6a4f',
          success: (res) => {
            if (res.confirm) {
              resolve({ buttonId: 'agree-btn', event: 'agree' });
            } else {
              resolve({ event: 'disagree' });
            }
          }
        });
      });
    }
  }
});
