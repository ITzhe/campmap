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
  }
});
