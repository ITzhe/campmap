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
    priceInfo: '',
    parkingText: '免费',
    introExpanded: false,
    newsList: [],
    hasMemo: false,
    userPoints: 0,
    // 用户动态
    dynamicsList: [],
    dynamicsCount: 0,
    dynamicsInput: '',
    dynamicsExpanded: false
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
    // 注意: parking_status 是 0=免费/1=收费, 不是布尔值
    // power_status (jiedian) 可能是 0/1/4/12/13 等, 非0即为可用
    const facGroups = config.FAC_GROUPS.map(g => ({
      title: g.title,
      items: g.keys.map(k => ({
        key: k,
        label: config.FAC_LABELS[k],
        emoji: config.FAC_EMOJI[k],
        on: Number(camp[k]) > 0
      }))
    }));

    // 充电桩状态
    const chargingOn = Number(camp.charging_status) > 0;
    const chargingText = chargingOn ? '可用' : '暂无';
    const chargingInfo = chargingOn
      ? '支持新能源车辆充电'
      : '附近充电桩较少，建议提前补电';

    // 收费信息
    const priceInfo = camp.price_info || '';
    const parkingText = Number(camp.parking_status) === 1 ? '收费' : '免费';

    // 最新动态
    const newsList = this.buildNews(camp);

    // 用户动态
    const dynamicsList = this.loadDynamics(camp.spot_code);

    this.setData({
      camp,
      facGroups,
      chargingOn,
      chargingText,
      chargingInfo,
      priceInfo,
      parkingText,
      newsList,
      hasMemo: !!camp.memo,
      dynamicsList,
      dynamicsCount: dynamicsList.length
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

    // 自动生成一条打卡动态
    this.addDynamics('📍 到此一游', 'checkin');
    util.showToast('打卡成功 +5 积分');
  },

  // ============ 用户动态：加载本地存储 ============
  loadDynamics(spotCode) {
    const key = `dynamics_${spotCode}`;
    const list = wx.getStorageSync(key) || [];

    // 合并一些示例动态
    const samples = this.buildSampleDynamics();
    const userDynamics = list.map(d => ({
      ...d,
      isUser: true
    }));
    return [...userDynamics, ...samples].slice(0, 20);
  },

  // ============ 生成示例动态 ============
  buildSampleDynamics() {
    const samples = [
      { nick: '老张自驾游', avatar: '🧔', date: '2026-08-04', text: '营地环境不错，水电齐全，适合房车过夜', type: 'comment', likes: 12 },
      { nick: '公路旅人', avatar: '👨', date: '2026-08-01', text: '周五晚上到的，位置好找，旁边有超市补给方便', type: 'comment', likes: 8 },
      { nick: '露营小白', avatar: '👩', date: '2026-07-28', text: '第一次房车露营体验，营地很安静，推荐！', type: 'comment', likes: 5 },
      { nick: '房车老司机', avatar: '👴', date: '2026-07-20', text: '已打卡，充电桩可用，厕所干净', type: 'checkin', likes: 3 }
    ];
    return samples;
  },

  // ============ 用户动态：发布 ============
  onDynamicsInput(e) {
    this.setData({ dynamicsInput: e.detail.value });
  },

  submitDynamics() {
    const text = (this.data.dynamicsInput || '').trim();
    if (!text) {
      util.showToast('请输入内容');
      return;
    }
    if (text.length > 200) {
      util.showToast('内容不超过200字');
      return;
    }
    this.addDynamics(text, 'comment');
    this.setData({ dynamicsInput: '' });
    util.showToast('发布成功');
  },

  addDynamics(text, type) {
    const camp = this.data.camp;
    if (!camp) return;

    const key = `dynamics_${camp.spot_code}`;
    const list = wx.getStorageSync(key) || [];

    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const newDyn = {
      nick: '我',
      avatar: '😎',
      date: dateStr,
      text: text,
      type: type || 'comment',
      likes: 0,
      isUser: true
    };

    list.unshift(newDyn);
    wx.setStorageSync(key, list.slice(0, 50));

    const dynamicsList = this.loadDynamics(camp.spot_code);
    this.setData({
      dynamicsList,
      dynamicsCount: dynamicsList.length
    });
  },

  // ============ 点赞动态 ============
  likeDynamics(e) {
    const idx = e.currentTarget.dataset.idx;
    const list = this.data.dynamicsList;
    if (!list[idx]) return;
    list[idx].likes = (list[idx].likes || 0) + 1;
    list[idx].liked = true;
    this.setData({ dynamicsList: list });
  },

  // ============ 展开/收起动态列表 ============
  toggleDynamics() {
    this.setData({ dynamicsExpanded: !this.data.dynamicsExpanded });
  }
});
