// app.js — 露营地图小程序入口
const { initUser, getUserState } = require('./utils/util');

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
    cityName: '当前位置',
    cityChanged: false
  },

  onLaunch() {
    // 初始化用户数据
    const userData = initUser();
    this.globalData.openid = userData.openid;
    this.globalData.points = userData.points;
    this.globalData.streak = userData.streak;
    this.globalData.lastCheckin = userData.lastCheckin;
    this.globalData.joinDate = userData.joinDate;

    // 尝试获取定位
    this.getLocation();
  },

  getLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.globalData.cityCenter = {
          latitude: res.latitude,
          longitude: res.longitude
        };
      },
      fail: () => {
        console.log('定位失败，使用默认城市中心');
      }
    });
  }
});
