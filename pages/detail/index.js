// pages/detail/index.js — 营地详情页逻辑
const config = require('../../utils/config');
const api = require('../../utils/api');
const util = require('../../utils/util');
const oss = require('../../utils/oss');
const security = require('../../utils/security');

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
    // 打卡记录
    checkinCount: 0,
    recentCheckins: [],
    // 本地记录已点赞的评论 id (防重复点赞)
    likedCommentIds: [],
    // 收藏状态
    isFavorited: false,
    // 纠错弹窗
    showCorrection: false,
    correctionData: null,
    correctionFacItems: [],
    correctionPhotos: [],
    submittingCorrection: false,
    // 评论图片
    dynamicsPhotos: [],
    submittingDynamics: false,
    // 评论框展开/收起
    showPublishBox: false,
    // 当前用户信息
    currentUserNick: '',
    currentUserOpenid: '',
    // 营地相册
    campPhotos: [],
    uploadingPhoto: false,
    // 待上传照片 (选择后未提交)
    pendingPhotos: [],
    // 昵称设置弹窗 (评论前需设置昵称)
    showNickPopup: false,
    tempNick: '',
    // 过夜友好度
    overnightInfo: null,
    hasOvernightData: false,
    // 打卡评价弹窗
    showCheckinReview: false,
    checkinRating: 0,
    checkinOvernightStatus: 0,
    checkinNoise: 0,
    checkinSafety: 0,
    checkinText: '',
    checkinPhotos: [],
    submittingCheckin: false,
    checkinTagOptions: {
      overnight: [],
      noise: [],
      safety: []
    },
    // 打卡成功动画
    showCheckinSuccess: false,
    checkinPoints: 0,
    checkinSuccessTimer: null
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
      likedCommentIds: wx.getStorageSync('liked_comment_ids') || [],
      currentUserNick: userData.nick || '',
      currentUserOpenid: userData.openid || '',
      // 打卡评价标签选项
      checkinTagOptions: config.CHECKIN_TAGS
    });

    let camp = app.globalData.selectedCamp;
    if (camp && camp.spot_code === options.spot_code) {
      this.renderCamp(camp);
    } else {
      this.loadCamp(options.spot_code);
    }
  },

  onUnload() {
    if (this.data.checkinSuccessTimer) {
      clearTimeout(this.data.checkinSuccessTimer);
    }
  },

  // ============ 关闭打卡成功动画 ============
  hideCheckinSuccess() {
    if (this.data.checkinSuccessTimer) {
      clearTimeout(this.data.checkinSuccessTimer);
    }
    this.setData({ showCheckinSuccess: false });
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

    // 过夜友好度数据
    const ov = config.OVERNIGHT;
    const overnightScore = Number(camp.overnight_score) || 0;
    const hasOvernightData = overnightScore > 0 || Number(camp.overnight_status) > 0
      || Number(camp.noise_level) > 0 || Number(camp.safety_level) > 0;
    const overnightStatus = Number(camp.overnight_status) || 0;
    const overnightInfo = hasOvernightData ? {
      score: overnightScore.toFixed(1),
      stars: '★'.repeat(Math.round(overnightScore)) + '☆'.repeat(5 - Math.round(overnightScore)),
      // overnight_status=0 时不显示状态标签
      status: overnightStatus > 0 ? (ov.statusLabels[camp.overnight_status] || '') : '',
      statusEmoji: overnightStatus > 0 ? (ov.statusEmoji[camp.overnight_status] || '') : '',
      noise: ov.noiseLabels[camp.noise_level] || '未知',
      noiseEmoji: ov.noiseEmoji[camp.noise_level] || '❓',
      safety: ov.safetyLabels[camp.safety_level] || '未知',
      safetyEmoji: ov.safetyEmoji[camp.safety_level] || '❓',
      signal: ov.signalLabels[camp.signal_level] || '未知',
      signalEmoji: ov.signalEmoji[camp.signal_level] || '❓',
      ground: ov.groundLabels[camp.ground_type] || '未知',
      groundEmoji: ov.groundEmoji[camp.ground_type] || '❓',
      source: ov.sourceLabels[camp.overnight_data_source] || '未标注'
    } : null;

    // 最新动态 (本地模拟)
    const newsList = this.buildNews(camp);

    this.setData({
      camp,
      facGroups,
      priceInfo,
      parkingText,
      overnightInfo,
      hasOvernightData,
      newsList,
      hasMemo: !!camp.memo
    });

    // 检查收藏状态
    this.checkFavorite(camp.spot_code);

    // 从 Supabase 加载用户评价
    this.loadComments(camp.spot_code);

    // 从 Supabase 加载营地照片
    this.loadCampPhotos(camp.spot_code);
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
    const currentOpenid = this.data.currentUserOpenid;
    // 映射为前端展示结构 (保留 dynamicsList 字段名以兼容 WXML)
    const dynamicsList = (comments || []).map(c => {
      const avatar = c.avatar || '🏕';
      const avatarIsUrl = avatar.startsWith('http');
      return {
        id: c.id,
        nick: c.nick || '微信用户',
        avatar: avatar,
        avatarIsUrl: avatarIsUrl,
        date: this.fmtDate(c.created_at),
        relTime: this.fmtRelTime(c.created_at),
        text: c.content,
        type: c.type || 'comment',
        likes: c.likes || 0,
        liked: likedIds.indexOf(c.id) > -1,
        photo_urls: c.photo_urls ? c.photo_urls.split(',').filter(Boolean) : [],
        isMine: c.openid === currentOpenid
      };
    });
    // 提取打卡记录
    const checkins = dynamicsList.filter(c => c.type === 'checkin');
    const checkinCount = checkins.length;
    const recentCheckins = checkins.slice(0, 5); // 最近5条打卡
    this.setData({
      dynamicsList,
      dynamicsCount: dynamicsList.length,
      checkinCount,
      recentCheckins,
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

  // ============ 格式化相对时间（如"3天前"、"2小时前"）============
  fmtRelTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const diff = Date.now() - d.getTime();
    if (diff < 0) return '刚刚';
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
    if (diff < 31536000000) return Math.floor(diff / 2592000000) + '个月前';
    return Math.floor(diff / 31536000000) + '年前';
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

  // ============ 营地打卡 (弹出评价窗口) ============
  checkinCamp() {
    const camp = this.data.camp;
    if (!camp) return;
    // 检查登录
    if (!util.isLoggedIn()) {
      this.setData({ showNickPopup: true, tempNick: '' });
      return;
    }
    // 弹出打卡评价窗口
    this.setData({
      showCheckinReview: true,
      checkinRating: 0,
      checkinOvernightStatus: 0,
      checkinNoise: 0,
      checkinSafety: 0,
      checkinText: '',
      checkinPhotos: [],
      submittingCheckin: false
    });
  },

  // ============ 关闭打卡评价弹窗 ============
  closeCheckinReview() {
    if (this.data.submittingCheckin) return;
    this.setData({ showCheckinReview: false });
  },

  // ============ 打卡评价：星级评分 ============
  onCheckinStarTap(e) {
    const star = Number(e.currentTarget.dataset.star);
    this.setData({ checkinRating: star });
  },

  // ============ 打卡评价：标签选择（单选）============
  onCheckinTagTap(e) {
    const dim = e.currentTarget.dataset.dim; // overnight/noise/safety/signal/ground
    const value = Number(e.currentTarget.dataset.value);
    const key = 'checkin' + dim.charAt(0).toUpperCase() + dim.slice(1);
    // 点击同一个则取消
    const current = this.data[key];
    const newValue = current === value ? 0 : value;
    this.setData({ [key]: newValue });
  },

  // ============ 打卡评价：文字输入 ============
  onCheckinTextInput(e) {
    this.setData({ checkinText: e.detail.value });
  },

  // ============ 打卡评价：添加图片 ============
  addCheckinPhoto() {
    if (this.data.checkinPhotos.length >= 6) {
      util.showToast('最多上传 6 张图片');
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        const photos = this.data.checkinPhotos.concat([{
          path: tempFilePath,
          id: 'ckp_' + Date.now()
        }]);
        this.setData({ checkinPhotos: photos });
      },
      fail: () => {}
    });
  },

  // ============ 打卡评价：删除图片 ============
  delCheckinPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photos = this.data.checkinPhotos.slice();
    photos.splice(idx, 1);
    this.setData({ checkinPhotos: photos });
  },

  // ============ 打卡评价：提交 ============
  async submitCheckinReview() {
    if (this.data.submittingCheckin) return;
    const camp = this.data.camp;
    if (!camp) return;

    const rating = this.data.checkinRating;
    const text = (this.data.checkinText || '').trim();
    const photos = this.data.checkinPhotos;

    // 至少要有星级或文字或图片
    if (rating === 0 && !text && photos.length === 0) {
      util.showToast('至少打个分吧～');
      return;
    }
    if (text.length > 200) {
      util.showToast('评价不超过200字');
      return;
    }

    const userData = util.getUserState();
    const openid = userData.openid || '';

    // 内容安全检测
    if (text) {
      const textSafe = await security.checkTextWithToast(text, openid);
      if (!textSafe) return;
    }

    this.setData({ submittingCheckin: true });
    util.showLoading('提交中...');

    // 上传图片到 OSS
    let photoUrls = [];
    if (photos.length > 0) {
      const paths = photos.map(p => p.path);
      try {
        photoUrls = await oss.uploadBatchToOSS(paths, 'checkins');
        photoUrls = photoUrls.filter(u => u);
        // 图片安全检测
        const imgResult = await security.checkImages(photoUrls, openid);
        if (!imgResult.safe) {
          util.hideLoading();
          this.setData({ submittingCheckin: false });
          wx.showModal({
            title: '图片提醒',
            content: '您上传的图片含违规信息，请更换后重新提交。',
            showCancel: false,
            confirmText: '我知道了',
            confirmColor: '#2d6a4f'
          });
          return;
        }
      } catch (e) {
        console.warn('[checkin] 图片上传失败:', e.message);
      }
    }

    // 构建评价数据
    const ratingData = {
      rating: rating,
      noise_level: this.data.checkinNoise,
      safety_level: this.data.checkinSafety,
      overnight_status: this.data.checkinOvernightStatus
    };

    // 提交评论 (type=checkin)
    const res = await this.addDynamics(
      text || '打卡评价',
      'checkin',
      photoUrls.length > 0 ? photoUrls.join(',') : '',
      ratingData
    );

    util.hideLoading();
    this.setData({ submittingCheckin: false });

    if (res && res.success) {
      // 给积分：基础打卡5分 + 带评价额外10分
      const basePoints = config.POINTS_RULES.camp_checkin;
      const extraPoints = (rating > 0 || text || photos.length > 0) ? config.POINTS_RULES.checkin_review : 0;
      const totalPoints = basePoints + extraPoints;
      const points = util.updatePoints(totalPoints);
      const app = getApp();
      app.globalData.points = points;

      // 关闭评价弹窗，展示成功动画
      this.setData({
        userPoints: points,
        showCheckinReview: false,
        showCheckinSuccess: true,
        checkinPoints: totalPoints
      });

      // 2秒后自动关闭动画
      if (this.data.checkinSuccessTimer) {
        clearTimeout(this.data.checkinSuccessTimer);
      }
      const timer = setTimeout(() => {
        this.setData({ showCheckinSuccess: false });
      }, 2000);
      this.setData({ checkinSuccessTimer: timer });
    } else {
      util.showToast((res && res.msg) || '提交失败，请稍后重试');
    }
  },

  // ============ 用户评价：输入 ============
  onDynamicsInput(e) {
    this.setData({ dynamicsInput: e.detail.value });
  },

  // ============ 用户评价：发布 ============
  async submitDynamics() {
    if (this.data.submittingDynamics) return;

    // 检查登录状态
    if (!util.isLoggedIn()) {
      this.setData({ showNickPopup: true, tempNick: '' });
      return;
    }

    const text = (this.data.dynamicsInput || '').trim();
    const photos = this.data.dynamicsPhotos;
    if (!text && photos.length === 0) {
      util.showToast('请输入内容或添加图片');
      return;
    }
    if (text.length > 200) {
      util.showToast('内容不超过200字');
      return;
    }
    const camp = this.data.camp;
    if (!camp) return;

    // 内容安全检测: 评论文本
    const userData = util.getUserState();
    const openid = userData.openid || '';
    if (text) {
      const textSafe = await security.checkTextWithToast(text, openid);
      if (!textSafe) return;
    }

    this.setData({ submittingDynamics: true });
    util.showLoading('发布中...');

    // 上传图片到 OSS
    let photoUrls = [];
    if (photos.length > 0) {
      const paths = photos.map(p => p.path);
      try {
        photoUrls = await oss.uploadBatchToOSS(paths, 'comments');
        photoUrls = photoUrls.filter(u => u);
        // 图片内容安全检测
        const imgResult = await security.checkImages(photoUrls, openid);
        if (!imgResult.safe) {
          util.hideLoading();
          this.setData({ submittingDynamics: false });
          wx.showModal({
            title: '图片提醒',
            content: '您上传的图片含违规信息，请更换后重新提交。',
            showCancel: false,
            confirmText: '我知道了',
            confirmColor: '#2d6a4f'
          });
          return;
        }
      } catch (e) {
        console.warn('[comment] 图片上传失败:', e.message);
      }
    }

    const res = await this.addDynamics(text, 'comment', photoUrls);
    util.hideLoading();
    this.setData({ submittingDynamics: false });
    if (res && res.success) {
      // 清空内容并收起评论框
      this.setData({ dynamicsInput: '', dynamicsPhotos: [], showPublishBox: false });
      util.showToast('发布成功');
    } else {
      util.showToast((res && res.msg) || '发布失败，请稍后重试');
    }
  },

  // ============ 提交评价到 Supabase 并刷新列表 ============
  // 供发布评价 / 营地打卡复用
  // 返回 { success: boolean, msg?: string }
  async addDynamics(text, type, photoUrls, rating) {
    const camp = this.data.camp;
    if (!camp) return { success: false, msg: '营地信息缺失' };
    const userData = util.getUserState();
    const res = await api.submitComment(
      camp.spot_code,
      userData.openid,
      userData.nick || '微信用户',
      userData.avatarUrl || '🏕',
      text,
      type || 'comment',
      (photoUrls || []).join ? (photoUrls || []).join(',') : (photoUrls || ''),
      rating
    );
    // 重新加载评论列表 (无论成功失败都刷新, 确保数据同步)
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
  },

  // ============ 展开/收起评论框 ============
  togglePublishBox() {
    if (this.data.showPublishBox) {
      this.setData({ showPublishBox: false });
      return;
    }
    // 展开前检查登录 — 未设置昵称则弹出昵称输入
    if (!util.isLoggedIn()) {
      this.setData({ showNickPopup: true, tempNick: '' });
    } else {
      this.setData({ showPublishBox: true });
    }
  },

  // ============ 昵称弹窗 ============
  onNickInput(e) {
    this.setData({ tempNick: e.detail.value });
  },

  onNickBlur(e) {
    if (e.detail.value) {
      this.setData({ tempNick: e.detail.value });
    }
  },

  closeNickPopup() {
    this.setData({ showNickPopup: false });
  },

  confirmNick() {
    const nick = (this.data.tempNick || '').trim();
    if (!nick) {
      util.showToast('请输入昵称');
      return;
    }
    // 确保 openid 存在
    util.wxLogin();
    // 保存昵称
    util.setUserNick(nick);
    const u = util.getUserState();
    this.setData({
      showNickPopup: false,
      currentUserNick: u.nick,
      currentUserOpenid: u.openid,
      showPublishBox: true
    });
  },

  // ============ 删除评论 (仅删除自己的) ============
  async deleteComment(e) {
    const idx = e.currentTarget.dataset.idx;
    const list = this.data.dynamicsList;
    if (!list[idx]) return;

    const comment = list[idx];
    if (!comment.isMine) {
      util.showToast('只能删除自己的评论');
      return;
    }

    wx.showModal({
      title: '提示',
      content: '确定删除这条评论吗？',
      confirmColor: '#e63946',
      success: async (res) => {
        if (!res.confirm) return;
        util.showLoading('删除中...');
        const result = await api.deleteComment(comment.id, this.data.currentUserOpenid);
        util.hideLoading();
        if (result.success) {
          util.showToast('已删除');
          this.loadComments(this.data.camp.spot_code);
        } else {
          util.showToast(result.msg || '删除失败');
        }
      }
    });
  },

  // ============ 评价图片 ============
  addDynamicsPhoto() {
    if (this.data.dynamicsPhotos.length >= 6) {
      util.showToast('最多上传 6 张图片');
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        const photos = this.data.dynamicsPhotos.concat([{
          path: tempFilePath,
          id: 'dp_' + Date.now()
        }]);
        this.setData({ dynamicsPhotos: photos });
      },
      fail: () => {}
    });
  },

  delDynamicsPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photos = this.data.dynamicsPhotos.slice();
    photos.splice(idx, 1);
    this.setData({ dynamicsPhotos: photos });
  },

  previewCommentImg(e) {
    const urls = e.currentTarget.dataset.urls || [];
    const current = e.currentTarget.dataset.current;
    if (urls.length === 0) return;
    wx.previewImage({ current, urls });
  },

  // ============ 营地相册 ============

  // 加载营地照片
  async loadCampPhotos(spotCode) {
    if (!spotCode) return;
    const photos = await api.fetchCampPhotos(spotCode);
    const currentOpenid = this.data.currentUserOpenid;
    const campPhotos = (photos || []).map(p => ({
      id: p.id,
      url: p.photo_url,
      isMine: p.openid === currentOpenid && !!p.openid
    }));
    this.setData({ campPhotos });
  },

  // 选择营地照片 (第一步: 选择, 不立即上传)
  selectCampPhoto() {
    if (this.data.uploadingPhoto) return;
    const maxAdd = 9 - this.data.pendingPhotos.length;
    if (maxAdd <= 0) {
      util.showToast('最多选择9张照片');
      return;
    }
    wx.chooseMedia({
      count: maxAdd,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const newPhotos = res.tempFiles.map(f => ({
          path: f.tempFilePath,
          id: 'cp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)
        }));
        const pendingPhotos = this.data.pendingPhotos.concat(newPhotos);
        this.setData({ pendingPhotos });
      },
      fail: () => {}
    });
  },

  // 移除待上传照片
  removePendingPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const pendingPhotos = this.data.pendingPhotos.slice();
    pendingPhotos.splice(idx, 1);
    this.setData({ pendingPhotos });
  },

  // 提交营地照片 (第二步: 上传到 OSS + 保存到数据库)
  async submitCampPhotos() {
    if (this.data.uploadingPhoto) return;
    const camp = this.data.camp;
    if (!camp) return;
    const pendingPhotos = this.data.pendingPhotos;
    if (pendingPhotos.length === 0) {
      util.showToast('请先选择照片');
      return;
    }

    this.setData({ uploadingPhoto: true });
    util.showLoading('提交中...');

    let successCount = 0;
    let failCount = 0;
    const userData = util.getUserState();

    for (const photo of pendingPhotos) {
      try {
        // 上传到 OSS
        const url = await oss.uploadToOSS(photo.path, 'camps', 'jpg');
        // 图片内容安全检测
        const imgSafe = await security.checkImage(url, userData.openid);
        if (!imgSafe.safe) {
          wx.showModal({
            title: '图片提醒',
            content: '您上传的图片含违规信息，已跳过该图片。',
            showCancel: false,
            confirmText: '我知道了',
            confirmColor: '#2d6a4f'
          });
          failCount++;
          continue;
        }
        // 保存到数据库
        const result = await api.submitCampPhoto(camp.spot_code, userData.openid, url);
        if (result.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (e) {
        console.warn('[camp-photo] upload failed:', e.message);
        failCount++;
      }
    }

    util.hideLoading();
    this.setData({ uploadingPhoto: false, pendingPhotos: [] });

    if (successCount > 0) {
      util.showToast('成功上传' + successCount + '张照片');
      this.loadCampPhotos(camp.spot_code);
    } else {
      util.showToast('上传失败，请重试');
    }
  },

  // 预览营地照片
  previewCampPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photos = this.data.campPhotos;
    if (!photos[idx]) return;
    const urls = photos.map(p => p.url);
    wx.previewImage({ current: urls[idx], urls });
  },

  // 删除营地照片 (仅删除自己的)
  deleteCampPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photos = this.data.campPhotos;
    if (!photos[idx]) return;

    const photo = photos[idx];
    if (!photo.isMine) {
      util.showToast('只能删除自己上传的照片');
      return;
    }

    wx.showModal({
      title: '提示',
      content: '确定删除这张照片吗？',
      confirmColor: '#e63946',
      success: async (res) => {
        if (!res.confirm) return;
        util.showLoading('删除中...');
        const result = await api.deleteCampPhoto(photo.id, this.data.currentUserOpenid);
        util.hideLoading();
        if (result.success) {
          util.showToast('已删除');
          this.loadCampPhotos(this.data.camp.spot_code);
        } else {
          util.showToast(result.msg || '删除失败');
        }
      }
    });
  },

  // ============ 纠错功能 ============

  // 阻止事件冒泡
  noop() {},

  // 检测纠错内容是否有修改
  hasCorrectionChanges() {
    const camp = this.data.camp;
    if (!camp) return false;
    const data = this.data.correctionData || {};
    if ((data.name || '') !== (camp.name || '')) return true;
    if ((data.address || '') !== (camp.address || '')) return true;
    if ((data.intro || '') !== (camp.intro || '')) return true;
    // 检查设施变化
    for (const item of this.data.correctionFacItems) {
      const original = Number(camp[item.key]) > 0;
      if (item.on !== original) return true;
    }
    // 检查照片
    if (this.data.correctionPhotos.length > 0) return true;
    return false;
  },

  // 尝试关闭纠错弹窗（有修改时提示保存）
  tryCloseCorrection() {
    if (this.hasCorrectionChanges()) {
      wx.showModal({
        title: '提示',
        content: '您的修改尚未提交，是否保存？',
        confirmText: '保存',
        cancelText: '不保存',
        confirmColor: '#2d6a4f',
        success: (res) => {
          if (res.confirm) {
            // 用户选择保存，提交纠错
            this.submitCorrection();
          } else {
            // 不保存，直接关闭
            this.setData({ showCorrection: false });
          }
        }
      });
    } else {
      this.setData({ showCorrection: false });
    }
  },

  // 打开纠错弹窗
  openCorrection() {
    const camp = this.data.camp;
    if (!camp) return;

    // 构建设施列表 (所有设施, 带当前状态)
    const facKeys = Object.keys(config.FAC_LABELS);
    const correctionFacItems = facKeys.map(k => ({
      key: k,
      label: config.FAC_LABELS[k],
      emoji: config.FAC_EMOJI[k],
      on: Number(camp[k]) > 0
    }));

    // 拷贝营地数据用于编辑
    const correctionData = {
      name: camp.name || '',
      address: camp.address || '',
      intro: camp.intro || ''
    };

    this.setData({
      showCorrection: true,
      correctionData,
      correctionFacItems,
      correctionPhotos: []
    });
  },

  // 关闭纠错弹窗
  closeCorrection() {
    this.setData({ showCorrection: false });
  },

  // 纠错输入
  onCorrectionInput(e) {
    const key = e.currentTarget.dataset.key;
    const data = this.data.correctionData;
    data[key] = e.detail.value;
    this.setData({ correctionData: data });
  },

  // 纠错设施切换
  toggleCorrectionFac(e) {
    const idx = e.currentTarget.dataset.idx;
    const items = this.data.correctionFacItems.slice();
    items[idx].on = !items[idx].on;
    this.setData({ correctionFacItems: items });
  },

  // 纠错照片
  addCorrectionPhoto() {
    if (this.data.correctionPhotos.length >= 6) {
      util.showToast('最多上传 6 张照片');
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        const photos = this.data.correctionPhotos.concat([{
          path: tempFilePath,
          id: 'cp_' + Date.now()
        }]);
        this.setData({ correctionPhotos: photos });
      },
      fail: () => {}
    });
  },

  delCorrectionPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photos = this.data.correctionPhotos.slice();
    photos.splice(idx, 1);
    this.setData({ correctionPhotos: photos });
  },

  // 提交纠错
  async submitCorrection() {
    if (this.data.submittingCorrection) return;
    const camp = this.data.camp;
    if (!camp) return;

    const data = this.data.correctionData;
    if (!data.name || !data.name.trim()) {
      util.showToast('请填写营地名称');
      return;
    }

    // 内容安全检测: 纠错文本
    const userData = util.getUserState();
    const openid = userData.openid || '';
    const allText = (data.name || '') + ' ' + (data.address || '') + ' ' + (data.intro || '');
    const textSafe = await security.checkTextWithToast(allText, openid);
    if (!textSafe) return;

    this.setData({ submittingCorrection: true });
    util.showLoading('提交纠错...');

    // 上传照片到 OSS
    let photoUrls = [];
    if (this.data.correctionPhotos.length > 0) {
      const paths = this.data.correctionPhotos.map(p => p.path);
      try {
        photoUrls = await oss.uploadBatchToOSS(paths, 'corrections');
        // 图片内容安全检测
        const imgResult = await security.checkImages(photoUrls.filter(u => u), openid);
        if (!imgResult.safe) {
          util.hideLoading();
          this.setData({ submittingCorrection: false });
          wx.showModal({
            title: '图片提醒',
            content: '您上传的图片含违规信息，请更换后重新提交。',
            showCancel: false,
            confirmText: '我知道了',
            confirmColor: '#2d6a4f'
          });
          return;
        }
      } catch (e) {
        console.warn('[correction] 照片上传失败:', e.message);
      }
    }

    // 构建纠错数据
    const facFlags = {};
    this.data.correctionFacItems.forEach(item => {
      facFlags[item.key] = item.on ? 1 : 0;
    });

    const payload = {
      spot_code: camp.spot_code,
      openid: util.getUserState().openid,
      name: data.name.trim(),
      address: (data.address || '').trim(),
      intro: (data.intro || '').trim(),
      photo_urls: photoUrls.filter(u => u).join(','),
      status: 'pending',
      ...facFlags
    };

    try {
      await api.submitCampCorrection(payload);
      util.hideLoading();
      util.showToast('纠错已提交，感谢您的贡献');
      this.setData({ showCorrection: false, submittingCorrection: false });
    } catch (e) {
      util.hideLoading();
      util.showToast('提交失败，请稍后重试');
      this.setData({ submittingCorrection: false });
    }
  }
});
