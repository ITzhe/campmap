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
    cityName: '青岛市',
    showLocation: true,

    // 营地数据
    camps: [],
    markers: [],
    circles: [],

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
    showPointsModal: false
  },

  onLoad() {
    const app = getApp();
    this.setData({
      latitude: app.globalData.cityCenter.latitude,
      longitude: app.globalData.cityCenter.longitude,
      cityName: app.globalData.cityName,
      userPoints: app.globalData.points
    });
    this.loadCamps();
  },

  onShow() {
    // 从其他页面返回时刷新积分
    const app = getApp();
    const userData = util.getUserState();
    app.globalData.points = userData.points;
    this.setData({ userPoints: userData.points });

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
        { key: 'rv_friendly', label: '房车' }
      ];
      const tags = tagConfigs.slice(0, 5).map(t => ({
        label: t.label,
        on: t.always ? true : camp[t.key] == 1
      }));
      this.setData({
        showBottomCard: true,
        selectedCamp: camp,
        selectedCampDist: camp.distance || dist,
        bottomCardTags: tags
      });
    }
  },

  // ============ 加载营地数据 ============
  async loadCamps() {
    util.showLoading('加载营地...');
    try {
      const camps = await api.fetchCampsites(this.data.filters);
      this.setData({ camps });
      this.buildMarkers(camps);
      this.buildCircle();
    } catch (e) {
      util.showToast('加载失败，请重试');
    }
    util.hideLoading();
  },

  // ============ 构建地图标记 ============
  buildMarkers(camps) {
    const markers = camps.map((c, idx) => {
      const isRV = c.rv_friendly == 1;
      const isFree = c.parking_status == 0;
      let iconPath = '/assets/markers/free.png';
      if (isRV) iconPath = '/assets/markers/rv.png';
      else if (!isFree) iconPath = '/assets/markers/paid.png';

      return {
        id: idx,
        latitude: c.latitude,
        longitude: c.longitude,
        iconPath: iconPath,
        width: isRV ? 24 : 28,
        height: isRV ? 24 : 32,
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
    this.setData({ markers });
  },

  // ============ 构建15km范围圆 ============
  buildCircle() {
    this.setData({
      circles: [{
        latitude: this.data.latitude,
        longitude: this.data.longitude,
        color: '#2d6a4fAA',
        fillColor: '#2d6a4f10',
        radius: 15000,
        strokeWidth: 2
      }]
    });
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
      { key: 'tent_friendly', label: '帐篷' }
    ];

    const tags = tagConfigs.slice(0, 5).map(t => ({
      label: t.label,
      on: t.always ? true : camp[t.key] == 1
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
      // 自动打开详情
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

    // 保存到全局
    const app = getApp();
    app.globalData.filters = filters;

    // 构建摘要文本
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
        this.buildCircle();
        util.showToast('已定位到当前位置');
      },
      fail: () => {
        util.showToast('定位失败，请检查权限');
      }
    });
  },

  // ============ 地图区域变化 ============
  onRegionChange(e) {
    if (e.type === 'end' && e.causedBy === 'drag') {
      // 可选：拖动后重新加载该区域营地
    }
  },

  // ============ 城市选择 ============
  onCityTap() {
    util.showToast('城市切换功能开发中');
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
