// pages/login/index.js — 登录/注册页逻辑
const util = require('../../utils/util');
const security = require('../../utils/security');

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    agreed: false,
    // 微信快捷登录弹窗
    showWxSheet: false,
    wxNick: ''
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
    this.setData({ statusBarHeight: sbh, navHeight: sbh + 44 });
  },

  // ===== 通用 =====
  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/index' });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/map/index' }) });
  },

  checkAgreement() {
    if (!this.data.agreed) {
      util.showToast('请先阅读并同意隐私协议');
      return false;
    }
    return true;
  },

  // ===== 微信快捷登录 =====
  onWeChatLogin() {
    if (!this.checkAgreement()) return;
    this.setData({ showWxSheet: true });
  },

  hideWxSheet() {
    this.setData({ showWxSheet: false });
  },

  onWxNickInput(e) {
    this.setData({ wxNick: e.detail.value });
  },

  onWxNickBlur(e) {
    if (e.detail.value) {
      this.setData({ wxNick: e.detail.value });
    }
  },

  async confirmWxLogin() {
    const nick = (this.data.wxNick || '').trim();
    if (!nick) {
      util.showToast('请获取微信昵称');
      return;
    }

    const userData = util.getUserState();
    const openid = userData.openid || '';

    // 内容安全检测
    const textSafe = await security.checkTextWithToast(nick, openid);
    if (!textSafe) return;

    // 保存昵称
    util.setUserNick(nick);

    const u = util.getUserState();
    u.hasLoggedIn = true;
    util.saveUser(u);

    this.setData({ showWxSheet: false });
    util.showToast('登录成功');
    setTimeout(() => this.goBack(), 800);
  }
});
