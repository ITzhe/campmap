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
    cityName: '定位中...',
    cityChanged: false,
    privacyAgreed: false
  },

  onLaunch() {
    // 初始化用户数据
    const userData = initUser();
    this.globalData.openid = userData.openid;
    this.globalData.points = userData.points;
    this.globalData.streak = userData.streak;
    this.globalData.lastCheckin = userData.lastCheckin;
    this.globalData.joinDate = userData.joinDate;

    // 注册全局隐私授权处理器 (必须在调用任何隐私API之前)
    this.registerPrivacyHandler();

    // 尝试获取定位
    this.getLocation();
  },

  // 注册微信隐私授权处理
  registerPrivacyHandler() {
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
              this.globalData.privacyAgreed = true;
              resolve({ buttonId: 'agree-btn', event: 'agree' });
            } else {
              resolve({ event: 'disagree' });
            }
          }
        });
      });
    }
  },

  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const cityName = getNearestCity(res.latitude, res.longitude);
        this.globalData.cityCenter = {
          latitude: res.latitude,
          longitude: res.longitude
        };
        this.globalData.cityName = cityName;
        this.globalData.cityChanged = true;
      },
      fail: () => {
        console.log('定位失败，使用默认城市中心');
        this.globalData.cityName = '青岛';
      }
    });
  }
});
