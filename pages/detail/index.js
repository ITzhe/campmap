// pages/detail/index.js — 营地详情页逻辑
const config = require('../../utils/config');
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    spotCode: '',
    camp: null,
    facGroups: [],
    chargingOn: false,
    chargingText: '',
    chargingInfo: '',
    introExpanded: false,
    newsList: [],
    hasMemo: false,
    userPoints: 0
  },

  onLoad(options) {
    const sys = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {};
    const statusBarHeight = sys.statusBarHeight || 20;
    this.setData({
      statusBarHeight,
      navHeight: statusBarHeight + 44,
      spotCode: options.spot_code || ''
    });

    const app = getApp();
    const userData = util.getUserState();
    this.setData({ userPoints: userData.points });

    let camp = app.globalData.selectedCamp;
    if (camp && camp.spot_code === options.spot_code) {
      this.renderCamp(camp);
    } else {
      this.loadCamp(options.spot_code);
    }
  },

  async loadCamp(spotCode) {
    if (!spotCode) {
      util.showToast('营地信息不存在');
      return;
    }
    util.showLoading('加载中...');
    try {
      const camp = await api.fetchCampDetail(spotCode);
      if (camp) {
        this.renderCamp(camp);
      } else {
        util.showToast('营地信息不存在');
      }
    } catch (e) {
      util.showToast('加载失败');
    }
    util.hideLoading();
  },

  // ============ 渲染营地数据 ============
  renderCamp(camp) {
    // 构建设施分组
    const facGroups = config.FAC_GROUPS.map(g => ({
      title: g.title,
      items: g.keys.map(k => ({
        key: k,
        label: config.FAC_LABELS[k],
        emoji: config.FAC_EMOJI[k],
        on: camp[k] == 1
      }))
    }));

    // 充电桩状态
    const chargingOn = camp.charging_status == 1;
    const chargingText = chargingOn ? '可用' : '暂无';
    const chargingInfo = chargingOn
      ? '支持新能源车辆充电'
      : '附近充电桩较少，建议提前补电';

    // 最新动态
    const newsList = this.buildNews(camp);

    this.setData({
      camp,
      facGroups,
      chargingOn,
      chargingText,
      chargingInfo,
      newsList,
      hasMemo: !!camp.memo
    });
  },

  // ============ 生成营地动态 (本地模拟) ============
  buildNews(camp) {
    const list = [];
    if (camp.charging_status == 1) {
      list.push({ date: '2026-08-02', text: '营地已配备新能源充电桩，支持快充服务' });
    } else {
      list.push({ date: '2026-08-02', text: '营地设施例行巡检完成，各项运行正常' });
    }
    list.push({ date: '2026-07-26', text: '周末及节假日开放时间延长至22:00' });
    list.push({ date: '2026-07-15', text: '完成雨季排水系统升级维护' });
    return list;
  },

  // ============ 展开收起简介 ============
  toggleIntro() {
    this.setData({ introExpanded: !this.data.introExpanded });
  },

  // ============ 返回 ============
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
    } else {
      wx.switchTab({ url: '/pages/map/index' });
    }
  },

  // ============ 导航 (打开地图导航) ============
  navigateCamp() {
    const camp = this.data.camp;
    if (!camp) return;
    wx.openLocation({
      latitude: Number(camp.latitude),
      longitude: Number(camp.longitude),
      name: camp.name || '营地',
      address: camp.address || '',
      scale: 14
    });
  },

  // ============ 复制坐标 ============
  copyCoord() {
    const camp = this.data.camp;
    if (!camp) return;
    const coord = `${camp.latitude},${camp.longitude}`;
    wx.setClipboardData({
      data: coord,
      success: () => {
        util.showToast('坐标已复制');
      }
    });
  },

  // ============ 营地打卡 (+5 积分) ============
  checkinCamp() {
    const camp = this.data.camp;
    if (!camp) return;
    const points = util.updatePoints(config.POINTS_RULES.camp_checkin);
    const app = getApp();
    app.globalData.points = points;
    this.setData({ userPoints: points });
    util.showToast('打卡成功 +5 积分');
  }
});
