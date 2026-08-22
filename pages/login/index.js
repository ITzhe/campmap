// pages/login/index.js — 登录/注册页逻辑
const util = require('../../utils/util');
const oss = require('../../utils/oss');
const security = require('../../utils/security');
const config = require('../../utils/config');

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    agreed: false,
    // 微信快捷登录弹窗
    showWxSheet: false,
    wxNick: '',
    phoneObtained: false,
    phoneCode: '',
    // 手机验证码登录弹窗
    showPhoneSheet: false,
    phoneInput: '',
    smsCode: '',
    smsCountdown: 0
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

  onGetPhoneNumber(e) {
    if (e.detail.errMsg === 'getPhoneNumber:ok' || e.detail.code) {
      this.setData({
        phoneObtained: true,
        phoneCode: e.detail.code || ''
      });
      util.showToast('手机号获取成功');
    } else {
      util.showToast('已取消获取手机号');
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

    // 保存手机号code
    const u = util.getUserState();
    if (this.data.phoneCode) {
      u.phoneCode = this.data.phoneCode;
      u.phone = '已绑定';
    }
    u.hasLoggedIn = true;
    util.saveUser(u);

    this.setData({ showWxSheet: false });
    util.showToast('登录成功');
    setTimeout(() => this.goBack(), 800);
  },

  // ===== 手机号验证码登录 =====
  onPhoneCodeLogin() {
    if (!this.checkAgreement()) return;
    util.showToast('手机号验证码登录功能开发中');
    // this.setData({ showPhoneSheet: true });
  },

  hidePhoneSheet() {
    this.setData({ showPhoneSheet: false });
  },

  onPhoneInput(e) {
    this.setData({ phoneInput: e.detail.value });
  },

  onSmsCodeInput(e) {
    this.setData({ smsCode: e.detail.value });
  },

  sendSmsCode() {
    if (this.data.smsCountdown > 0) return;
    const phone = (this.data.phoneInput || '').trim();
    if (!phone || phone.length !== 11) {
      util.showToast('请输入正确的手机号');
      return;
    }
    util.showToast('功能开发中');
  },

  confirmPhoneLogin() {
    util.showToast('功能开发中');
  },

  onUnload() {
    if (this._countdownTimer) clearTimeout(this._countdownTimer);
  }
});
