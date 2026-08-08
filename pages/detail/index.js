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
    priceInfo: '',
    parkingText: '免费',
    introExpanded: false,
    newsList: [],
    hasMemo: false,
    userPoints: 0,
    // 用户评价 (评论/动态) — 字段名保留以兼容 WXML
    dynamicsList: [],
    dynamicsCount: 0,
    dynamicsInput: '',
    dynamicsExpanded: false,
    // 评论加载状态
    commentsLoading: false,
    // 本地记录已点赞的评论 id (防重复点赞)
    likedCommentIds: [],
    // 收藏状态
    isFavorited: false
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
    this.setData({
      userPoints: userData.points,
      // 读取本地已点赞列表
      likedCommentIds: wx.getStorageSync('liked_comment_ids') || []
    });

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

    // 收费信息
    const priceInfo = camp.price_info || '';
    const parkingText = Number(camp.parking_status) === 1 ? '收费' : '免费';

    // 最新动态 (本地模拟)
    const newsList = this.buildNews(camp);

    this.setData({
      camp,
      facGroups,
      priceInfo,
      parkingText,
      newsList,
      hasMemo: !!camp.memo
    });

    // 检查收藏状态
    this.checkFavorite(camp.spot_code);

    // 从 Supabase 加载用户评价
    this.loadComments(camp.spot_code);
  },

  // ============ 检查是否已收藏 ============
  checkFavorite(spotCode) {
    let favs = [];
    try { favs = wx.getStorageSync('camp_favorites') || []; } catch (e) {}
    const isFav = favs.some(f => f.spot_code === spotCode);
    this.setData({ isFavorited: isFav });
  },

  // ============ 收藏 / 取消收藏 ============
  toggleFavorite() {
    const camp = this.data.camp;
    if (!camp) return;

    let favs = [];
    try { favs = wx.getStorageSync('camp_favorites') || []; } catch (e) {}

    if (this.data.isFavorited) {
      // 取消收藏
      favs = favs.filter(f => f.spot_code !== camp.spot_code);
      try { wx.setStorageSync('camp_favorites', favs); } catch (e) {}
      this.setData({ isFavorited: false });
      util.showToast('已取消收藏');
    } else {
      // 添加收藏
      favs.unshift({
        spot_code: camp.spot_code,
        name: camp.name,
        address: camp.address || '',
        parking_status: camp.parking_status,
        latitude: camp.latitude,
        longitude: camp.longitude,
        saved_at: Date.now()
      });
      try { wx.setStorageSync('camp_favorites', favs); } catch (e) {}
      this.setData({ isFavorited: true });
      util.showToast('已收藏');
    }
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

  // ============ 加载用户评价 (Supabase) ============
  async loadComments(spotCode) {
    if (!spotCode) return;
    this.setData({ commentsLoading: true });
    const comments = await api.fetchComments(spotCode);
    const likedIds = this.data.likedCommentIds || [];
    // 映射为前端展示结构 (保留 dynamicsList 字段名以兼容 WXML)
    const dynamicsList = (comments || []).map(c => ({
      id: c.id,
      nick: c.nick || '匿名用户',
      avatar: c.avatar || '🏕',
      date: this.fmtDate(c.created_at),
      text: c.content,
      type: c.type || 'comment',
      likes: c.likes || 0,
      liked: likedIds.indexOf(c.id) > -1
    }));
    this.setData({
      dynamicsList,
      dynamicsCount: dynamicsList.length,
      commentsLoading: false
    });
  },

  // ============ 格式化日期 YYYY-MM-DD ============
  fmtDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return String(ts).slice(0, 10);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

  // ============ 分享营地 ============
  shareCamp() {
    const camp = this.data.camp;
    if (!camp) return;
    wx.setClipboardData({
      data: `${camp.name}\n地址：${camp.address || '暂无'}\n坐标：${camp.latitude},${camp.longitude}`,
      success: () => {
        util.showToast('营地信息已复制，可粘贴分享');
      }
    });
  },

  // ============ 营地打卡 (+5 积分) ============
  async checkinCamp() {
    const camp = this.data.camp;
    if (!camp) return;
    const points = util.updatePoints(config.POINTS_RULES.camp_checkin);
    const app = getApp();
    app.globalData.points = points;
    this.setData({ userPoints: points });

    // 同时提交一条打卡评价到 Supabase
    await this.addDynamics('📍 到此一游', 'checkin');
    util.showToast('打卡成功 +5 积分');
  },

  // ============ 用户评价：输入 ============
  onDynamicsInput(e) {
    this.setData({ dynamicsInput: e.detail.value });
  },

  // ============ 用户评价：发布 ============
  async submitDynamics() {
    const text = (this.data.dynamicsInput || '').trim();
    if (!text) {
      util.showToast('请输入内容');
      return;
    }
    if (text.length > 200) {
      util.showToast('内容不超过200字');
      return;
    }
    const camp = this.data.camp;
    if (!camp) return;

    util.showLoading('发布中...');
    const res = await this.addDynamics(text, 'comment');
    util.hideLoading();
    if (res) {
      this.setData({ dynamicsInput: '' });
      util.showToast('发布成功');
    } else {
      util.showToast('发布失败');
    }
  },

  // ============ 提交评价到 Supabase 并刷新列表 ============
  // 供发布评价 / 营地打卡复用
  async addDynamics(text, type) {
    const camp = this.data.camp;
    if (!camp) return null;
    const userData = util.getUserState();
    const res = await api.submitComment(
      camp.spot_code,
      userData.openid,
      '匿名用户',
      '🏕',
      text,
      type || 'comment'
    );
    // 重新加载评论列表
    await this.loadComments(camp.spot_code);
    return res;
  },

  // ============ 点赞评价 ============
  async likeDynamics(e) {
    const idx = e.currentTarget.dataset.idx;
    const list = this.data.dynamicsList;
    if (!list[idx]) return;

    // 本地已点过赞, 防止重复点赞
    if (list[idx].liked) {
      util.showToast('已经点过赞了');
      return;
    }

    const userData = util.getUserState();
    const res = await api.likeComment(list[idx].id, userData.openid);
    if (res && res.success) {
      list[idx].liked = true;
      list[idx].likes = (list[idx].likes || 0) + 1;
      this.setData({ dynamicsList: list });
      this.saveLikedId(list[idx].id);
    } else {
      // 后端返回已点赞, 同步本地状态
      if (res && res.msg === '已经点过赞了') {
        list[idx].liked = true;
        this.setData({ dynamicsList: list });
        this.saveLikedId(list[idx].id);
      }
      util.showToast((res && res.msg) || '点赞失败');
    }
  },

  // ============ 持久化已点赞 id ============
  saveLikedId(commentId) {
    const likedIds = this.data.likedCommentIds || [];
    if (likedIds.indexOf(commentId) > -1) return;
    likedIds.push(commentId);
    wx.setStorageSync('liked_comment_ids', likedIds);
    this.setData({ likedCommentIds: likedIds });
  },

  // ============ 展开/收起评价列表 ============
  toggleDynamics() {
    this.setData({ dynamicsExpanded: !this.data.dynamicsExpanded });
  }
});
