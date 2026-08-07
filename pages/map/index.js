// pages/map/index.js — 地图首页逻辑
const config = require('../../utils/config');
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    // 地图状态
    latitude: 36.0671,
    longitude: 120.3826,
    scale: 11,
    cityName: '定位中...',
    showLocation: true,

    // 营地数据
    camps: [],
    markers: [],

    // 底部卡片
    showBottomCard: false,
    selectedCamp: null,
    selectedCampDist: 0,
    bottomCardTags: [],

    // 筛选
    filterVisible: false,
    filters: { fee: 'all', park: [], fac: [] },
    filterCount: 0,
    filterSummaryText: '',
    filteredCount: 0,

    // 积分
    userPoints: 0,
    showPointsModal: false,

    // 状态
    loadingCamps: false,
    campCount: 0
  },

  // 防抖定时器
  _reloadTimer: null,
  _firstLoad: true,

  onLoad() {
    const app = getApp();
    this.setData({
      latitude: app.globalData.cityCenter.latitude,
      longitude: app.globalData.cityCenter.longitude,
      cityName: app.globalData.cityName,
      userPoints: app.globalData.points
    });
    // 先尝试定位，再加载营地
    this.tryLocateAndLoad();
  },

  onShow() {
    const app = getApp();
    const userData = util.getUserState();
    app.globalData.points = userData.points;
    this.setData({ userPoints: userData.points });

    // 从城市选择页返回时，更新地图中心和城市名
    if (app.globalData.cityChanged) {
      app.globalData.cityChanged = false;
      this.setData({
        latitude: app.globalData.cityCenter.latitude,
        longitude: app.globalData.cityCenter.longitude,
        cityName: app.globalData.cityName,
        scale: 11
      });
      this.loadCamps();
    }

    // 如果有筛选变化，重新加载
    if (JSON.stringify(app.globalData.filters) !== JSON.stringify(this.data.filters)) {
      this.setData({ filters: app.globalData.filters });
      this.applyFilters();
    }

    // 从线路规划页跳回时，展示选中营地的底部卡片
    if (app.globalData.pendingCampFocus && app.globalData.selectedCamp) {
      const camp = app.globalData.selectedCamp;
      app.globalData.pendingCampFocus = false;
      const dist = util.distance(
        camp.latitude, camp.longitude,
        this.data.latitude, this.data.longitude
      );
      const tagConfigs = [
        { key: 'parking_status', label: camp.parking_status == 0 ? '免费' : '收费', always: true },
        { key: 'toilet_status', label: '厕所' },
        { key: 'water_status', label: '接水' },
        { key: 'power_status', label: '市电' },
        { key: 'grocery_status', label: '买菜' },
        { key: 'rv_friendly', label: '房车' }
      ];
      const tags = tagConfigs.slice(0, 5).map(t => ({
        label: t.label,
        on: t.always ? true : Number(camp[t.key]) > 0
      }));
      this.setData({
        showBottomCard: true,
        selectedCamp: camp,
        selectedCampDist: camp.distance || dist,
        bottomCardTags: tags
      });
    }
  },

  // ============ 定位 + 加载 ============
  tryLocateAndLoad() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const app = getApp();
        const cityName = util.getNearestCity(res.latitude, res.longitude);
        app.globalData.cityCenter = {
          latitude: res.latitude,
          longitude: res.longitude
        };
        app.globalData.cityName = cityName;
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          scale: 12,
          cityName: cityName
        });
        this.loadCamps();
      },
      fail: () => {
        // 定位失败，用默认中心
        this.setData({ cityName: '青岛' });
        this.loadCamps();
      }
    });
  },

  // ============ 计算当前地图可见范围 ============
  getMapBounds() {
    const lat = this.data.latitude;
    const lng = this.data.longitude;
    // 大约 1° lat ≈ 111km, 1° lng ≈ 111*cos(lat) km
    // 根据缩放级别调整范围
    const scale = this.data.scale || 11;
    const radiusDeg = Math.max(0.3, 5.0 / Math.pow(2, scale - 8));
    return {
      minLat: lat - radiusDeg,
      maxLat: lat + radiusDeg,
      minLng: lng - radiusDeg / Math.cos(lat * Math.PI / 180),
      maxLng: lng + radiusDeg / Math.cos(lat * Math.PI / 180)
    };
  },

  // ============ 加载营地数据 ============
  async loadCamps() {
    if (this.data.loadingCamps) return;
    this.setData({ loadingCamps: true });

    const bounds = this.getMapBounds();

    // 如果有筛选条件，先加载全部再本地筛选
    const hasFilter = this.data.filterCount > 0;
    const fetchBounds = hasFilter ? null : bounds;

    util.showLoading('加载营地...');
    try {
      const camps = await api.fetchCampsites(this.data.filters, fetchBounds);
      this.setData({
        camps,
        campCount: camps.length
      });
      this.buildMarkers(camps);
    } catch (e) {
      util.showToast('加载失败，请重试');
    }
    util.hideLoading();
    this.setData({ loadingCamps: false });
  },

  // ============ 构建地图标记 ============
  buildMarkers(camps) {
    const markers = camps.map((c, idx) => {
      const isFree = c.parking_status == 0;
      let iconPath = '/assets/markers/free.png';
      if (!isFree) iconPath = '/assets/markers/paid.png';
      if (c.rv_friendly == 1) iconPath = '/assets/markers/rv.png';

      return {
        id: idx,
        latitude: c.latitude,
        longitude: c.longitude,
        iconPath: iconPath,
        width: 28,
        height: 32,
        callout: {
          content: c.name,
          color: '#1a2e1f',
          fontSize: 11,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#dde6e0',
          bgColor: '#ffffff',
          padding: 6,
          display: 'BYCLICK',
          textAlign: 'center'
        }
      };
    });
    this.setData({ markers, filteredCount: camps.length });
  },

  // ============ 标记点击 ============
  onMarkerTap(e) {
    const markerId = e.markerId;
    const camp = this.data.camps[markerId];
    if (!camp) return;

    const dist = util.distance(
      camp.latitude, camp.longitude,
      this.data.latitude, this.data.longitude
    );

    // 构建标签
    const tagConfigs = [
      { key: 'parking_status', label: camp.parking_status == 0 ? '免费' : '收费', always: true },
      { key: 'toilet_status', label: '厕所' },
      { key: 'water_status', label: '接水' },
      { key: 'power_status', label: '市电' },
      { key: 'charging_status', label: '充电' },
      { key: 'rv_friendly', label: '房车' },
      { key: 'grocery_status', label: '买菜' },
      { key: 'tent_friendly', label: '帐篷' }
    ];

    const tags = tagConfigs.slice(0, 5).map(t => ({
      label: t.label,
      on: t.always ? true : Number(camp[t.key]) > 0
    }));

    this.setData({
      showBottomCard: true,
      selectedCamp: camp,
      selectedCampDist: dist,
      bottomCardTags: tags
    });
  },

  closeBottomCard() {
    this.setData({ showBottomCard: false });
  },

  // ============ 查看详情 (积分校验) ============
  viewDetail() {
    const camp = this.data.selectedCamp;
    if (!camp) return;

    const userData = util.getUserState();
    if (userData.points <= 0) {
      this.setData({ showPointsModal: true, userPoints: userData.points });
      return;
    }

    // 扣减积分
    util.updatePoints(config.POINTS_RULES.view_detail);
    api.deductPointApi(userData.openid, camp.spot_code);

    // 保存选中营地到全局
    const app = getApp();
    app.globalData.selectedCamp = camp;
    app.globalData.points = userData.points - 1;

    // 跳转详情页
    wx.navigateTo({
      url: `/pages/detail/index?spot_code=${camp.spot_code}`
    });
  },

  // ============ 积分不足弹窗 ============
  closePointsModal() {
    this.setData({ showPointsModal: false });
  },

  onModalCheckin() {
    const result = util.doCheckin();
    if (result.success) {
      const app = getApp();
      app.globalData.points = result.points;
      app.globalData.streak = result.streak;
      this.setData({
        showPointsModal: false,
        userPoints: result.points
      });
      util.showToast('签到成功 +10 积分');
      setTimeout(() => this.viewDetail(), 800);
    } else {
      util.showToast(result.msg);
    }
  },

  // ============ 筛选弹窗 ============
  openFilter() {
    this.setData({ filterVisible: true });
  },

  onFilterClose() {
    this.setData({ filterVisible: false });
  },

  onFilterConfirm(e) {
    const filters = e.detail.filters;
    const count = e.detail.count;
    this.setData({
      filters,
      filterVisible: false,
      filterCount: count
    });

    const app = getApp();
    app.globalData.filters = filters;

    if (count > 0) {
      let parts = [];
      if (filters.fee !== 'all') parts.push(filters.fee == '0' ? '免费' : '收费');
      filters.park.forEach(k => parts.push(config.FAC_LABELS[k]));
      filters.fac.forEach(k => parts.push('有' + config.FAC_LABELS[k]));
      this.setData({ filterSummaryText: parts.join(' · ') });
    }

    this.applyFilters();
  },

  onFilterReset() {
    this.setData({
      filters: { fee: 'all', park: [], fac: [] },
      filterCount: 0,
      filterSummaryText: ''
    });
    const app = getApp();
    app.globalData.filters = { fee: 'all', park: [], fac: [] };
    this.loadCamps();
  },

  // ============ 本地筛选 ============
  applyFilters() {
    const f = this.data.filters;
    let list = this.data.camps;

    list = list.filter(c => {
      if (f.fee !== 'all' && c.parking_status != f.fee) return false;
      if (f.park.length && !f.park.every(k => c[k] == 1)) return false;
      if (f.fac.length && !f.fac.every(k => c[k] == 1)) return false;
      return true;
    });

    this.buildMarkers(list);
    this.setData({ filteredCount: list.length });
  },

  clearFilters() {
    this.setData({
      filters: { fee: 'all', park: [], fac: [] },
      filterCount: 0,
      filterSummaryText: ''
    });
    const app = getApp();
    app.globalData.filters = { fee: 'all', park: [], fac: [] };
    this.loadCamps();
  },

  // ============ 定位 ============
  locateMe() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          scale: 13
        });
        this.loadCamps();
        util.showToast('已定位到当前位置');
      },
      fail: () => {
        util.showToast('定位失败，请检查权限');
      }
    });
  },

  // ============ 地图区域变化 (拖动/缩放后重新加载) ============
  onRegionChange(e) {
    if (e.type !== 'end') return;

    // 更新中心坐标
    if (e.detail && e.detail.latitude) {
      this.setData({
        latitude: e.detail.latitude,
        longitude: e.detail.longitude,
        scale: e.detail.scale || this.data.scale
      });
    }

    // 仅在拖动结束时重新加载（防抖 1.5 秒）
    if (e.causedBy === 'drag' || e.causedBy === 'scale') {
      if (this._reloadTimer) clearTimeout(this._reloadTimer);
      this._reloadTimer = setTimeout(() => {
        this.loadCamps();
      }, 1500);
    }
  },

  // ============ 城市选择 ============
  onCityTap() {
    wx.navigateTo({ url: '/pages/city-picker/index' });
  },

  //Search tap
  onSearchTap() {
    util.showToast('搜索功能开发中');
  },

  // ============ 跳转营地录入 ============
  goSubmit() {
    wx.navigateTo({ url: '/pages/submit/index' });
  }
});
