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
    // 获取状态栏高度
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      navHeight: (sysInfo.statusBarHeight || 20) + 44
    });

    const spotCode = options.id || options.code || options.spot_code || '';
    if (!spotCode) {
      util.showToast('参数错误');
      wx.navigateBack();
      return;
    }
    this.setData({ spotCode });
    this.loadCampDetail(spotCode);

    // 加载用户信息
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({
      currentUserNick: userInfo.nick || '',
      currentUserOpenid: userInfo.openid || ''
    });
  },

  // ============ 加载营地详情 ============
  async loadCampDetail(spotCode) {
    try {
      util.showLoading('加载中...');
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

    // 过夜友好度数据（兼容安营 camping_spots 和懂营地 dongyingdi_spots 两种格式）
    const ov = config.OVERNIGHT;
    const overnightScore = Number(camp.overnight_score) || 0;

    // 判断是否有过夜数据
    let hasOvernightData = false;
    let overnightInfo = null;

    // 懂营地图格式：dim_noise / dim_safety 是字符串，score_source 是字符串
    const isDydFormat = typeof camp.dim_noise === 'string' && camp.dim_noise !== ''
      || typeof camp.dim_safety === 'string' && camp.dim_safety !== '';

    if (overnightScore > 0 || isDydFormat || Number(camp.overnight_status) > 0) {
      hasOvernightData = true;

      // 过夜状态
      let status = '';
      let statusEmoji = '';
      const ovStatus = Number(camp.overnight_status) || 0;
      if (ovStatus > 0) {
        // 懂营地状态映射：1=可以过夜 2=勉强能住 3=不建议过夜
        if (isDydFormat) {
          const dydStatusMap = { 1: '可以过夜', 2: '勉强能住', 3: '不建议过夜' };
          const dydEmojiMap = { 1: '✅', 2: '😐', 3: '⚠️' };
          status = dydStatusMap[ovStatus] || '';
          statusEmoji = dydEmojiMap[ovStatus] || '';
        } else {
          status = ov.statusLabels[camp.overnight_status] || '';
          statusEmoji = ov.statusEmoji[camp.overnight_status] || '';
        }
      }

      // 维度数据（2~4 个）
      const dims = [];

      if (isDydFormat) {
        // 懂营地：噪音、安全（字符串值）
        if (camp.dim_noise) {
          dims.push({
            emoji: camp.dim_noise === '较安静' ? '🔇' : camp.dim_noise === '较吵' ? '📢' : '🔊',
            label: '噪音',
            value: camp.dim_noise
          });
        }
        if (camp.dim_safety) {
          dims.push({
            emoji: camp.dim_safety === '很安全' ? '🛡️' : camp.dim_safety === '需注意' ? '⚠️' : '😐',
            label: '安全',
            value: camp.dim_safety
          });
        }
      } else {
        // 安营格式：噪音、安全、信号、地面（数值等级）
        if (Number(camp.noise_level) > 0) {
          dims.push({
            emoji: ov.noiseEmoji[camp.noise_level] || '❓',
            label: '噪音',
            value: ov.noiseLabels[camp.noise_level] || '未知'
          });
        }
        if (Number(camp.safety_level) > 0) {
          dims.push({
            emoji: ov.safetyEmoji[camp.safety_level] || '❓',
            label: '安全',
            value: ov.safetyLabels[camp.safety_level] || '未知'
          });
        }
        if (Number(camp.signal_level) > 0) {
          dims.push({
            emoji: ov.signalEmoji[camp.signal_level] || '❓',
            label: '信号',
            value: ov.signalLabels[camp.signal_level] || '未知'
          });
        }
        if (Number(camp.ground_type) > 0) {
          dims.push({
            emoji: ov.groundEmoji[camp.ground_type] || '❓',
            label: '地面',
            value: ov.groundLabels[camp.ground_type] || '未知'
          });
        }
      }

      // 数据来源
      let source = '未标注';
      if (camp.score_source && camp.score_source !== '') {
        const sourceMap = {
          'facility_calculated': '设施计算',
          'user_rated': '用户评价',
          'anying_imported': '安营导入',
          'manual': '人工复核'
        };
        source = sourceMap[camp.score_source] || camp.score_source;
      } else if (camp.overnight_data_source && camp.overnight_data_source !== '') {
        source = ov.sourceLabels[camp.overnight_data_source] || camp.overnight_data_source;
      }

      // 环形进度百分比（0~100）
      const percent = Math.round(Math.min(Math.max(overnightScore / 5, 0), 1) * 100);

      // 评分主题色：根据状态变色
      // 1=可以过夜→绿, 2=勉强能住→橙, 3=不建议过夜→灰
      let scoreTheme = 'green';
      let ringColor = '#2d6a4f';
      let ringTrackColor = 'rgba(45, 106, 79, 0.1)';
      let cardGradFrom = '#e8f5e9';
      let cardGradTo = '#d8f3dc';
      if (ovStatus === 2) {
        scoreTheme = 'orange';
        ringColor = '#f4a261';
        ringTrackColor = 'rgba(244, 162, 97, 0.15)';
        cardGradFrom = '#fff3e0';
        cardGradTo = '#ffe0b2';
      }
      if (ovStatus === 3) {
        scoreTheme = 'gray';
        ringColor = '#9e9e9e';
        ringTrackColor = 'rgba(158, 158, 158, 0.15)';
        cardGradFrom = '#f5f5f5';
        cardGradTo = '#eeeeee';
      }

      overnightInfo = {
        score: overnightScore.toFixed(1),
        status,
        statusEmoji,
        dims,
        source,
        scoreTheme,
        ringPercent: percent,
        ringColor,
        ringTrackColor,
        cardGradFrom,
        cardGradTo
      };
    }

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
    const favorites = wx.getStorageSync('favorites') || [];
    const isFav = favorites.some(f => f.spot_code === spotCode);
    this.setData({ isFavorited: isFav });
  },

  // ============ 切换收藏 ============
  toggleFavorite() {
    const { camp, isFavorited } = this.data;
    if (!camp) return;

    let favorites = wx.getStorageSync('favorites') || [];
    if (isFavorited) {
      favorites = favorites.filter(f => f.spot_code !== camp.spot_code);
      util.showToast('已取消收藏');
    } else {
      favorites.unshift({
        spot_code: camp.spot_code,
        name: camp.name,
        address: camp.address,
        addedAt: Date.now()
      });
      util.showToast('收藏成功');
    }
    wx.setStorageSync('favorites', favorites);
    this.setData({ isFavorited: !isFavorited });
  },

  // ============ 展开/收起简介 ============
  toggleIntro() {
    this.setData({ introExpanded: !this.data.introExpanded });
  },

  // ============ 构建动态列表 ============
  buildNews(camp) {
    const items = [];
    if (camp.latest_checkin_time) {
      const rel = util.formatRelative(camp.latest_checkin_time);
      items.push({
        date: rel,
        text: `有车友${rel}打卡过此地`
      });
    }
    if (camp.latest_comment_time) {
      const rel = util.formatRelative(camp.latest_comment_time);
      items.push({
        date: rel,
        text: `有车友${rel}留下了评价`
      });
    }
    if (items.length === 0) {
      items.push({
        date: '欢迎',
        text: '还没有动态，快来发布第一条吧～'
      });
    }
    return items;
  },

  // ============ 返回 ============
  goBack() {
    wx.navigateBack();
  },

  // ============ 导航 ============
  navigateCamp() {
    const { camp } = this.data;
    if (!camp) return;
    const lat = Number(camp.latitude);
    const lng = Number(camp.longitude);
    if (!lat || !lng) {
      util.showToast('坐标信息不完整');
      return;
    }
    wx.openLocation({
      latitude: lat,
      longitude: lng,
      name: camp.name || '营地',
      address: camp.address || '',
      scale: 16
    });
  },

  // ============ 分享 ============
  shareCamp() {
    const { camp } = this.data;
    if (!camp) return;
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    });
    // 微信会自动调用 onShareAppMessage
  },

  onShareAppMessage() {
    const { camp } = this.data;
    return {
      title: camp ? camp.name : '营地详情',
      path: `/pages/detail/index?id=${this.data.spotCode}`,
      imageUrl: ''
    };
  },

  // ============ 打卡 ============
  checkinCamp() {
    const { currentUserNick } = this.data;
    if (!currentUserNick) {
      this.setData({ showNickPopup: true });
      return;
    }
    this.setData({ showCheckinReview: true });
  },

  // ============ 打卡评价弹窗 ============
  closeCheckinReview() {
    this.setData({ showCheckinReview: false });
  },

  onCheckinStarTap(e) {
    const star = Number(e.currentTarget.dataset.star);
    this.setData({ checkinRating: star });
  },

  onCheckinTagTap(e) {
    const dim = e.currentTarget.dataset.dim;
    const value = Number(e.currentTarget.dataset.value);
    const key = 'checkin' + dim.charAt(0).toUpperCase() + dim.slice(1);
    this.setData({ [key]: this.data[key] === value ? 0 : value });
  },

  onCheckinTextInput(e) {
    this.setData({ checkinText: e.detail.value });
  },

  addCheckinPhoto() {
    const { checkinPhotos } = this.data;
    if (checkinPhotos.length >= 6) {
      util.showToast('最多6张照片');
      return;
    }
    wx.chooseImage({
      count: 6 - checkinPhotos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPhotos = res.tempFilePaths.map((p, i) => ({
          id: Date.now() + '_' + i,
          path: p
        }));
        this.setData({ checkinPhotos: checkinPhotos.concat(newPhotos) });
      }
    });
  },

  delCheckinPhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const photos = this.data.checkinPhotos.filter((_, i) => i !== idx);
    this.setData({ checkinPhotos: photos });
  },

  // ============ 提交打卡评价 ============
  async submitCheckinReview() {
    const { checkinRating, camp, currentUserNick, currentUserOpenid, checkinText, checkinPhotos, submittingCheckin } = this.data;
    if (submittingCheckin) return;
    if (checkinRating === 0) {
      util.showToast('请先评分');
      return;
    }

    this.setData({ submittingCheckin: true });
    try {
      // 上传图片
      let photoUrls = [];
      if (checkinPhotos.length > 0) {
        util.showLoading('上传图片中...');
        const uploadPromises = checkinPhotos.map(p => oss.uploadImage(p.path, 'checkin'));
        photoUrls = await Promise.all(uploadPromises);
        util.hideLoading();
      }

      const result = await api.submitCheckin({
        spot_code: camp.spot_code,
        openid: currentUserOpenid,
        nick: currentUserNick,
        rating: checkinRating,
        overnight_status: this.data.checkinOvernightStatus,
        noise_level: this.data.checkinNoise,
        safety_level: this.data.checkinSafety,
        text: checkinText,
        photo_urls: photoUrls
      });

      // 关闭弹窗
      this.setData({
        showCheckinReview: false,
        checkinRating: 0,
        checkinOvernightStatus: 0,
        checkinNoise: 0,
        checkinSafety: 0,
        checkinText: '',
        checkinPhotos: [],
        submittingCheckin: false
      });

      // 显示成功动画
      const points = result.points || 15;
      this.setData({
        showCheckinSuccess: true,
        checkinPoints: points
      });

      // 3秒后自动关闭
      const timer = setTimeout(() => {
        this.hideCheckinSuccess();
      }, 2500);
      this.setData({ checkinSuccessTimer: timer });

      // 刷新评论列表
      this.loadComments(camp.spot_code);
    } catch (e) {
      util.showToast('提交失败');
      this.setData({ submittingCheckin: false });
    }
  },

  // ============ 打卡成功动画 ============
  hideCheckinSuccess() {
    if (this.data.checkinSuccessTimer) {
      clearTimeout(this.data.checkinSuccessTimer);
    }
    this.setData({ showCheckinSuccess: false, checkinSuccessTimer: null });
  },

  // ============ 加载评论 ============
  async loadComments(spotCode) {
    this.setData({ commentsLoading: true });
    try {
      const comments = await api.fetchComments(spotCode);
      const list = comments.map(c => ({
        id: c.id,
        nick: c.nick || '匿名车友',
        avatar: c.avatar_emoji || '🏕️',
        avatarIsUrl: false,
        text: c.content || c.text || '',
        date: c.created_at ? util.formatRelative(c.created_at) : '',
        likes: c.likes || 0,
        liked: false,
        isMine: c.openid === this.data.currentUserOpenid,
        type: c.type || 'comment',
        photo_urls: c.photo_urls || (c.photos ? JSON.parse(c.photos) : [])
      }));

      // 统计打卡记录
      const checkins = list.filter(c => c.type === 'checkin');
      const checkinCount = checkins.length;
      const recentCheckins = checkins.slice(0, 3).map(c => ({
        id: c.id,
        nick: c.nick,
        relTime: c.date
      }));

      this.setData({
        dynamicsList: list,
        dynamicsCount: list.length,
        commentsLoading: false,
        checkinCount,
        recentCheckins
      });
    } catch (e) {
      this.setData({ commentsLoading: false });
    }
  },

  // ============ 展开/收起评价 ============
  toggleDynamics() {
    this.setData({ dynamicsExpanded: !this.data.dynamicsExpanded });
  },

  // ============ 点赞评论 ============
  async likeDynamics(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const list = this.data.dynamicsList;
    if (!list[idx]) return;
    if (list[idx].liked) return; // 已点赞过

    const { currentUserOpenid } = this.data;
    if (!currentUserOpenid) {
      util.showToast('请先登录');
      return;
    }

    try {
      const res = await api.likeComment(list[idx].id, currentUserOpenid);
      list[idx].liked = true;
      list[idx].likes = (list[idx].likes || 0) + 1;
      this.setData({ dynamicsList: list });
    } catch (e) {
      // 静默失败
    }
  },

  // ============ 删除评论 ============
  async deleteComment(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const list = this.data.dynamicsList;
    if (!list[idx] || !list[idx].isMine) return;

    const result = await new Promise(resolve => {
      wx.showModal({
        title: '提示',
        content: '确定删除这条评论吗？',
        success: (res) => resolve(res.confirm)
      });
    });
    if (!result) return;

    try {
      const { currentUserOpenid } = this.data;
      const res = await api.deleteComment(list[idx].id, currentUserOpenid);
      list.splice(idx, 1);
      this.setData({
        dynamicsList: list,
        dynamicsCount: this.data.dynamicsCount - 1
      });
      util.showToast('已删除');
    } catch (e) {
      util.showToast('删除失败');
    }
  },

  // ============ 评论输入 ============
  onDynamicsInput(e) {
    this.setData({ dynamicsInput: e.detail.value });
  },

  togglePublishBox() {
    this.setData({ showPublishBox: !this.data.showPublishBox });
  },

  // ============ 发布评论 ============
  async submitDynamics() {
    const { dynamicsInput, camp, currentUserNick, currentUserOpenid, submittingDynamics, dynamicsPhotos } = this.data;
    if (submittingDynamics) return;
    if (!dynamicsInput.trim()) {
      util.showToast('请输入评论内容');
      return;
    }
    if (!currentUserNick) {
      this.setData({ showNickPopup: true });
      return;
    }

    this.setData({ submittingDynamics: true });
    try {
      // 上传图片
      let photoUrls = [];
      if (dynamicsPhotos.length > 0) {
        util.showLoading('上传图片中...');
        const uploadPromises = dynamicsPhotos.map(p => oss.uploadImage(p.path, 'comment'));
        photoUrls = await Promise.all(uploadPromises);
        util.hideLoading();
      }

      const res = await api.submitComment({
        spot_code: camp.spot_code,
        openid: currentUserOpenid,
        nick: currentUserNick,
        content: dynamicsInput.trim(),
        photo_urls: photoUrls
      });

      // 清空输入
      this.setData({
        dynamicsInput: '',
        dynamicsPhotos: [],
        showPublishBox: false,
        submittingDynamics: false
      });

      // 刷新列表
      this.loadComments(camp.spot_code);
      util.showToast('发布成功');
    } catch (e) {
      util.showToast('发布失败');
      this.setData({ submittingDynamics: false });
    }
  },

  addDynamicsPhoto() {
    const { dynamicsPhotos } = this.data;
    if (dynamicsPhotos.length >= 6) {
      util.showToast('最多6张照片');
      return;
    }
    wx.chooseImage({
      count: 6 - dynamicsPhotos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPhotos = res.tempFilePaths.map((p, i) => ({
          id: Date.now() + '_' + i,
          path: p
        }));
        this.setData({ dynamicsPhotos: dynamicsPhotos.concat(newPhotos) });
      }
    });
  },

  delDynamicsPhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const photos = this.data.dynamicsPhotos.filter((_, i) => i !== idx);
    this.setData({ dynamicsPhotos: photos });
  },

  previewCommentImg(e) {
    const urls = e.currentTarget.dataset.urls;
    const current = e.currentTarget.dataset.current;
    wx.previewImage({
      current: current,
      urls: urls
    });
  },

  // ============ 加载营地照片 ============
  async loadCampPhotos(spotCode) {
    try {
      const photos = await api.fetchCampPhotos(spotCode);
      this.setData({ campPhotos: photos || [] });
    } catch (e) {
      // 静默失败
    }
  },

  selectCampPhoto() {
    const { pendingPhotos, uploadingPhoto } = this.data;
    if (uploadingPhoto) return;
    wx.chooseImage({
      count: 6 - pendingPhotos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPhotos = res.tempFilePaths.map((p, i) => ({
          id: Date.now() + '_' + i,
          path: p
        }));
        this.setData({ pendingPhotos: pendingPhotos.concat(newPhotos) });
      }
    });
  },

  removePendingPhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const photos = this.data.pendingPhotos.filter((_, i) => i !== idx);
    this.setData({ pendingPhotos: photos });
  },

  previewCampPhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const urls = this.data.campPhotos.map(p => p.url);
    wx.previewImage({
      current: urls[idx],
      urls: urls
    });
  },

  async submitCampPhotos() {
    const { pendingPhotos, camp, currentUserOpenid, uploadingPhoto } = this.data;
    if (uploadingPhoto || pendingPhotos.length === 0) return;
    this.setData({ uploadingPhoto: true });
    try {
      util.showLoading('上传中...');
      const uploadPromises = pendingPhotos.map(p => oss.uploadImage(p.path, 'camp'));
      const urls = await Promise.all(uploadPromises);
      const result = await api.submitCampPhoto(camp.spot_code, currentUserOpenid, urls);
      util.hideLoading();

      this.setData({
        pendingPhotos: [],
        uploadingPhoto: false
      });

      // 刷新相册
      this.loadCampPhotos(camp.spot_code);
      util.showToast('上传成功');
    } catch (e) {
      util.hideLoading();
      util.showToast('上传失败');
      this.setData({ uploadingPhoto: false });
    }
  },

  async deleteCampPhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const list = this.data.campPhotos;
    if (!list[idx] || !list[idx].isMine) return;

    const result = await new Promise(resolve => {
      wx.showModal({
        title: '提示',
        content: '确定删除这张照片吗？',
        success: (res) => resolve(res.confirm)
      });
    });
    if (!result) return;

    try {
      const { currentUserOpenid } = this.data;
      const res = await api.deleteCampPhoto(list[idx].id, currentUserOpenid);
      list.splice(idx, 1);
      this.setData({ campPhotos: list });
      util.showToast('已删除');
    } catch (e) {
      util.showToast('删除失败');
    }
  },

  // ============ 纠错弹窗 ============
  openCorrection() {
    const { camp } = this.data;
    if (!camp) return;

    const facItems = config.FAC_GROUPS.flatMap(g => g.keys.map(k => ({
      key: k,
      label: config.FAC_LABELS[k],
      emoji: config.FAC_EMOJI[k],
      on: Number(camp[k]) > 0
    })));

    this.setData({
      showCorrection: true,
      correctionData: {
        name: camp.name || '',
        address: camp.address || '',
        intro: camp.intro || ''
      },
      correctionFacItems: facItems
    });
  },

  tryCloseCorrection() {
    this.setData({ showCorrection: false });
  },

  onCorrectionInput(e) {
    const key = e.currentTarget.dataset.key;
    const val = e.detail.value;
    this.setData({ [`correctionData.${key}`]: val });
  },

  toggleCorrectionFac(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const items = this.data.correctionFacItems;
    items[idx].on = !items[idx].on;
    this.setData({ correctionFacItems: items });
  },

  addCorrectionPhoto() {
    const { correctionPhotos } = this.data;
    if (correctionPhotos.length >= 6) {
      util.showToast('最多6张照片');
      return;
    }
    wx.chooseImage({
      count: 6 - correctionPhotos.length,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newPhotos = res.tempFilePaths.map((p, i) => ({
          id: Date.now() + '_' + i,
          path: p
        }));
        this.setData({ correctionPhotos: correctionPhotos.concat(newPhotos) });
      }
    });
  },

  delCorrectionPhoto(e) {
    const idx = Number(e.currentTarget.dataset.idx);
    const photos = this.data.correctionPhotos.filter((_, i) => i !== idx);
    this.setData({ correctionPhotos: photos });
  },

  async submitCorrection() {
    const { correctionData, correctionFacItems, correctionPhotos, camp, submittingCorrection } = this.data;
    if (submittingCorrection) return;
    if (!correctionData.name.trim()) {
      util.showToast('请输入营地名称');
      return;
    }

    this.setData({ submittingCorrection: true });
    try {
      // 上传图片
      let photoUrls = [];
      if (correctionPhotos.length > 0) {
        util.showLoading('上传图片中...');
        const uploadPromises = correctionPhotos.map(p => oss.uploadImage(p.path, 'correction'));
        photoUrls = await Promise.all(uploadPromises);
        util.hideLoading();
      }

      const payload = {
        spot_code: camp.spot_code,
        name: correctionData.name.trim(),
        address: correctionData.address.trim(),
        intro: correctionData.intro.trim(),
        facilities: {},
        photo_urls: photoUrls
      };
      correctionFacItems.forEach(item => {
        payload.facilities[item.key] = item.on ? 1 : 0;
      });

      await api.submitCampCorrection(payload);
      this.setData({
        showCorrection: false,
        correctionPhotos: [],
        submittingCorrection: false
      });
      util.showToast('提交成功，感谢反馈');
    } catch (e) {
      util.showToast('提交失败');
      this.setData({ submittingCorrection: false });
    }
  },

  // ============ 昵称弹窗 ============
  closeNickPopup() {
    this.setData({ showNickPopup: false });
  },

  onNickInput(e) {
    this.setData({ tempNick: e.detail.value });
  },

  onNickBlur(e) {
    // 尝试获取微信昵称
    const value = e.detail.value;
    if (!value) {
      this.setData({ tempNick: wx.getStorageSync('userInfo').nick || '' });
    }
  },

  confirmNick() {
    const { tempNick } = this.data;
    if (!tempNick.trim()) {
      util.showToast('请输入昵称');
      return;
    }
    const userInfo = wx.getStorageSync('userInfo') || {};
    userInfo.nick = tempNick.trim();
    wx.setStorageSync('userInfo', userInfo);
    this.setData({
      showNickPopup: false,
      currentUserNick: tempNick.trim()
    });
  },

  noop() {}
});
