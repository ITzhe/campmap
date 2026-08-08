// pages/favorites/index.js — 我的收藏页逻辑
const util = require('../../utils/util');
const config = require('../../utils/config');

const STORAGE_KEY = 'camp_favorites';

// 开发测试用营地数据 (结构与详情页营地一致)
const TEST_CAMPS = [
  {
    spot_code: 'TEST001',
    name: '崂山风景区露营地',
    address: '山东省青岛市崂山区崂山风景区',
    parking_status: 0,
    latitude: 36.1572,
    longitude: 120.6240
  },
  {
    spot_code: 'TEST002',
    name: '石老人海滨营地',
    address: '山东省青岛市崂山区石老人海水浴场',
    parking_status: 1,
    latitude: 36.0747,
    longitude: 120.4760
  },
  {
    spot_code: 'TEST003',
    name: '黄岛金沙滩营地',
    address: '山东省青岛市黄岛区金沙滩路',
    parking_status: 0,
    latitude: 35.9644,
    longitude: 120.1667
  },
  {
    spot_code: 'TEST004',
    name: '仰口房车露营基地',
    address: '山东省青岛市崂山区仰口风景区',
    parking_status: 1,
    latitude: 36.2333,
    longitude: 120.6740
  }
];

Page({
  data: {
    statusBarHeight: 20,
    list: [],
    userLat: null,
    userLng: null
  },

  onLoad() {
    // 状态栏高度 (与 mine / detail 页一致的计算方式)
    let sbh = 20;
    try {
      if (wx.getWindowInfo) {
        sbh = wx.getWindowInfo().statusBarHeight;
      } else {
        sbh = wx.getSystemInfoSync().statusBarHeight;
      }
    } catch (e) {}
    this.setData({ statusBarHeight: sbh });

    // 获取用户位置用于计算距离
    this.loadUserLocation();
  },

  onShow() {
    // 每次进入页面刷新列表 (从详情页返回时同步最新状态)
    this.loadList();
  },

  // ============ 获取用户位置 ============
  // 优先使用 globalData.cityCenter, 失败回退 config.CITY_CENTER
  loadUserLocation() {
    const app = getApp();
    const center = app.globalData.cityCenter || config.CITY_CENTER;
    if (center && center.latitude && center.longitude) {
      this.setData({ userLat: center.latitude, userLng: center.longitude });
      return;
    }
    // 兜底: 主动定位
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({ userLat: res.latitude, userLng: res.longitude });
        this.loadList();
      },
      fail: () => {
        // 定位失败仍使用配置默认中心
        this.setData({
          userLat: config.CITY_CENTER.latitude,
          userLng: config.CITY_CENTER.longitude
        });
      }
    });
  },

  // ============ 读取收藏列表 ============
  loadList() {
    let list = [];
    try {
      list = wx.getStorageSync(STORAGE_KEY) || [];
    } catch (e) {
      list = [];
    }

    const userLat = this.data.userLat;
    const userLng = this.data.userLng;

    // 补充展示字段: 停车状态文案 / 距离 / 收藏日期
    list = list.map(item => {
      // parking_status: 0=免费, 1=收费 (与详情页一致)
      const parkingText = Number(item.parking_status) === 1 ? '收费' : '免费';

      let distanceText = '—';
      if (userLat && userLng && item.latitude && item.longitude) {
        const d = util.distance(
          Number(userLat), Number(userLng),
          Number(item.latitude), Number(item.longitude)
        );
        distanceText = d >= 1 ? (d + ' km') : (Math.round(d * 1000) + ' m');
      }

      return {
        spot_code: item.spot_code,
        name: item.name,
        address: item.address,
        parking_status: item.parking_status,
        latitude: item.latitude,
        longitude: item.longitude,
        saved_at: item.saved_at,
        parkingText,
        distanceText,
        savedDate: this.fmtDate(item.saved_at)
      };
    });

    // 按 saved_at 降序 (最新收藏在前)
    list.sort((a, b) => (b.saved_at || 0) - (a.saved_at || 0));

    this.setData({ list });
  },

  // ============ 格式化日期 YYYY-MM-DD ============
  fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  // ============ 返回 ============
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/mine/index' });
    }
  },

  // ============ 点击收藏项 -> 跳转营地详情 ============
  onItemTap(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.navigateTo({
      url: '/pages/detail/index?spot_code=' + code
    });
  },

  // ============ 删除收藏 ============
  onDel(e) {
    const code = e.currentTarget.dataset.code;
    if (!code) return;
    wx.showModal({
      title: '提示',
      content: '确定要删除这条收藏的营地吗？',
      confirmColor: '#ee6c4d',
      success: (res) => {
        if (res.confirm) {
          let list = this.data.list.filter(r => r.spot_code !== code);
          try {
            wx.setStorageSync(STORAGE_KEY, list);
          } catch (err) {}
          this.setData({ list });
          util.showToast('已删除');
        }
      }
    });
  },

  // ============ 开发测试: 添加模拟收藏 ============
  addTestFavorite() {
    let list = [];
    try {
      list = wx.getStorageSync(STORAGE_KEY) || [];
    } catch (e) {
      list = [];
    }

    // 找一个尚未收藏的测试营地
    const existCodes = list.map(r => r.spot_code);
    const candidate = TEST_CAMPS.find(c => existCodes.indexOf(c.spot_code) === -1);

    if (!candidate) {
      util.showToast('测试营地已全部添加');
      return;
    }

    list.push(Object.assign({}, candidate, { saved_at: Date.now() }));
    try {
      wx.setStorageSync(STORAGE_KEY, list);
    } catch (err) {}

    util.showToast('已添加测试营地');
    this.loadList();
  },

  // ============ 去地图找营地 ============
  goMap() {
    wx.switchTab({ url: '/pages/map/index' });
  }
});
