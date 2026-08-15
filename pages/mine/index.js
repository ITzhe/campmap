// pages/mine/index.js — 我的页面逻辑
const util = require('../../utils/util');
const config = require('../../utils/config');
const oss = require('../../utils/oss');

Page({
  data: {
    statusBarHeight: 20,
    userName: '',
    avatar: '🏕',
    avatarUrl: '',
    points: 0,
    streak: 0,
    joinDays: 1,
    checkedToday: false,
    checkinAmt: config.POINTS_RULES.daily_checkin,
    checkinBtnText: '📅 签到 +10',

    // 核心功能 (推广期隐藏积分明细)
    coreFuncs: [
      { key: 'submit', icon: '📝', label: '营地录入' },
      { key: 'fav', icon: '❤️', label: '我的收藏' },
      { key: 'mysub', icon: '📋', label: '我的提交' }
    ],

    // 其他功能
    otherFuncs: [
      { key: 'routefav', icon: '🧭', label: '线路收藏' },
      { key: 'feedback', icon: '💬', label: '意见反馈' },
      { key: 'tutorial', icon: '📖', label: '使用教程' },
      { key: 'about', icon: 'ℹ️', label: '关于我们' }
    ],

    // 设置列表
    settings: [
      { key: 'service', label: '联系客服' },
      { key: 'faq', label: '常见问题' },
      { key: 'privacy', label: '隐私协议' },
      { key: 'logout', label: '退出登录', danger: true }
    ],

    // 昵称编辑弹窗
    showNickPopup: false,
    tempNick: '',
    tempAvatarUrl: '',
    avatarChanged: false
  },

  onLoad() {
    let sbh = 20;
    try {
      if (wx.getWindowInfo) {
        sbh = wx.getWindowInfo().statusBarHeight;
      } else {
        sbh = wx.getSystemInfoSync().statusBarHeight;
      }
    } catch (e) {}
    this.setData({ statusBarHeight: sbh });
  },

  onShow() {
    this.loadUser();
  },

  // 加载用户数据
  loadUser() {
    const u = util.getUserState();
    const today = util.todayStr();
    const checkedToday = u.lastCheckin === today;
    this.setData({
      userName: u.nick || '微信用户',
      avatarUrl: u.avatarUrl || '',
      points: u.points || 0,
      streak: u.streak || 0,
      joinDays: util.calcJoinDays(u.joinDate),
      checkedToday: checkedToday,
      checkinBtnText: checkedToday ? '✓ 已签到' : ('📅 签到 +' + this.data.checkinAmt)
    });
    // 同步全局
    const app = getApp();
    app.globalData.points = u.points;
    app.globalData.streak = u.streak;
  },

  // ============ 签到 ============
  doCheckin() {
    if (this.data.checkedToday) {
      util.showToast('今日已签到，明天再来吧');
      return;
    }
    const result = util.doCheckin();
    if (result.success) {
      this.setData({
        points: result.points,
        streak: result.streak,
        checkedToday: true,
        checkinBtnText: '✓ 已签到'
      });
      const app = getApp();
      app.globalData.points = result.points;
      app.globalData.streak = result.streak;
      util.showToast('签到成功 +' + config.POINTS_RULES.daily_checkin + ' 积分');
    } else {
      util.showToast(result.msg);
    }
  },

  tapGear() {
    wx.navigateTo({ url: '/pages/settings/index' });
  },

  // ============ 点击头像 — 打开编辑弹窗 ============
  tapAvatar() {
    const u = util.getUserState();
    this.setData({
      showNickPopup: true,
      tempNick: (u.nick && u.nick !== '微信用户') ? u.nick : '',
      tempAvatarUrl: u.avatarUrl || '',
      avatarChanged: false
    });
  },

  // 昵称输入 (type="nickname" 会触发微信原生选择)
  onNickInput(e) {
    this.setData({ tempNick: e.detail.value });
  },

  // 昵称失焦
  onNickBlur(e) {
    if (e.detail.value) {
      this.setData({ tempNick: e.detail.value });
    }
  },

  // 选择微信头像 (button open-type="chooseAvatar")
  onChooseAvatar(e) {
    if (e.detail.avatarUrl) {
      this.setData({
        tempAvatarUrl: e.detail.avatarUrl,
        avatarChanged: true
      });
    }
  },

  // 从相册选择头像
  chooseAvatarFromAlbum() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        this.setData({
          tempAvatarUrl: res.tempFiles[0].tempFilePath,
          avatarChanged: true
        });
      },
      fail: () => {}
    });
  },

  // 关闭弹窗
  closeNickPopup() {
    this.setData({ showNickPopup: false });
  },

  // 阻止冒泡
  noop() {},

  // 保存昵称和头像
  async saveNick() {
    const nick = (this.data.tempNick || '').trim();
    if (!nick) {
      util.showToast('请输入昵称');
      return;
    }

    // 保存昵称
    util.setUserNick(nick);

    // 如果头像有变化, 上传到 OSS
    if (this.data.avatarChanged && this.data.tempAvatarUrl) {
      util.showLoading('保存中...');
      try {
        const url = await oss.uploadToOSS(this.data.tempAvatarUrl, 'avatars', 'jpg');
        const u = util.getUserState();
        u.avatarUrl = url;
        util.saveUser(u);
      } catch (e) {
        console.error('[avatar] upload failed:', e);
        util.hideLoading();
        util.showToast('头像上传失败，昵称已保存');
        this.setData({ showNickPopup: false });
        this.loadUser();
        return;
      }
      util.hideLoading();
    }

    this.setData({ showNickPopup: false });
    this.loadUser();
    util.showToast('保存成功');
  },

  // ============ 跳转 ============
  goPoints() {
    wx.navigateTo({
      url: '/pages/points/index',
      fail: () => { util.showToast('积分明细页开发中'); }
    });
  },

  goSubmit() {
    wx.navigateTo({
      url: '/pages/submit/index',
      fail: () => { util.showToast('营地录入页开发中'); }
    });
  },

  goAbout() {
    wx.navigateTo({
      url: '/pages/about/index',
      fail: () => { util.showToast('关于我们页开发中'); }
    });
  },

  // 功能区点击
  onFuncTap(e) {
    const key = e.currentTarget.dataset.key;
    switch (key) {
      case 'submit': this.goSubmit(); break;
      case 'points': this.goPoints(); break;
      case 'about': this.goAbout(); break;
      case 'fav':
        wx.navigateTo({ url: '/pages/favorites/index' });
        break;
      case 'mysub':
        wx.navigateTo({ url: '/pages/submissions/index' });
        break;
      case 'routefav':
        wx.navigateTo({ url: '/pages/route-fav/index' });
        break;
      case 'feedback':
        wx.navigateTo({ url: '/pages/feedback/index' });
        break;
      case 'tutorial':
        wx.navigateTo({ url: '/pages/tutorial/index' });
        break;
      default: util.showToast('功能开发中'); break;
    }
  },

  // 设置项点击
  onSettingTap(e) {
    const key = e.currentTarget.dataset.key;
    switch (key) {
      case 'service':
        util.showToast('客服微信：camp-map');
        break;
      case 'faq':
        wx.navigateTo({ url: '/pages/tutorial/index' });
        break;
      case 'privacy':
        wx.navigateTo({ url: '/pages/privacy/index' });
        break;
      case 'logout':
        this.logout();
        break;
    }
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '提示',
      content: '确定要退出登录吗？',
      confirmColor: '#ee6c4d',
      success: (res) => {
        if (res.confirm) {
          try { wx.removeStorageSync('camp_user'); } catch (e) {}
          const app = getApp();
          app.globalData.points = 0;
          app.globalData.streak = 0;
          util.showToast('已退出登录');
          this.loadUser();
        }
      }
    });
  }
});
