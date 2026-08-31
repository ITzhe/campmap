// pages/city-picker/index.js — 城市选择页
const config = require('../../utils/config');

// 全国 337 个地级行政区城市列表（含坐标）
const CITY_LIST = require('../../utils/cities');

Page({
  data: {
    statusBarHeight: 20,
    searchKey: '',
    filteredCities: [],
    groupedCities: [],
    hotCities: []
  },

  onLoad() {
    const sys = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {};
    this.setData({ statusBarHeight: sys.statusBarHeight || 20 });

    // 构建热门城市列表（含坐标）
    const hotNames = ['北京', '上海', '广州', '深圳', '成都', '杭州', '武汉', '西安', '青岛', '三亚', '昆明', '拉萨'];
    const hotCities = hotNames.map(n => {
      const c = CITY_LIST.find(c => c.name === n);
      return c ? { name: c.name, lat: c.lat, lng: c.lng } : null;
    }).filter(Boolean);
    this.setData({ hotCities });

    this.buildGrouped();
  },

  // 按省份分组
  buildGrouped() {
    const groups = {};
    const order = [];
    for (const c of CITY_LIST) {
      if (!groups[c.province]) {
        groups[c.province] = [];
        order.push(c.province);
      }
      groups[c.province].push(c);
    }
    const grouped = order.map(p => ({ province: p, cities: groups[p] }));
    this.setData({ groupedCities: grouped, filteredCities: [] });
  },

  // 搜索
  onSearchInput(e) {
    const key = (e.detail.value || '').trim();
    this.setData({ searchKey: key });
    if (!key) {
      this.buildGrouped();
      return;
    }
    const filtered = CITY_LIST.filter(c =>
      c.name.indexOf(key) >= 0 || c.province.indexOf(key) >= 0
    );
    this.setData({ filteredCities: filtered, groupedCities: [] });
  },

  // 清空搜索
  clearSearch() {
    this.setData({ searchKey: '' });
    this.buildGrouped();
  },

  // 选择城市
  selectCity(e) {
    const { name, lat, lng } = e.currentTarget.dataset;
    const app = getApp();
    app.globalData.cityCenter = { latitude: lat, longitude: lng };
    app.globalData.cityName = name;
    app.globalData.cityChanged = true;
    wx.navigateBack();
  },

  // 使用当前位置
  useLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const app = getApp();
        app.globalData.cityCenter = {
          latitude: res.latitude,
          longitude: res.longitude
        };
        app.globalData.cityName = '当前位置';
        app.globalData.cityChanged = true;
        wx.navigateBack();
      },
      fail: () => {
        wx.showToast({ title: '定位失败', icon: 'none' });
      }
    });
  },

  goBack() {
    wx.navigateBack();
  }
});
