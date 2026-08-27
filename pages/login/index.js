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
    console.log('getPhoneNumber回调:', JSON.stringify(e.detail));
    // 新版基础库返回 code，旧版返回 errMsg
    // 用户拒绝: errMsg 包含 "fail" 或 "deny"
    const errMsg = e.detail.errMsg || '';
    const isDenied = errMsg.indexOf('fail') >= 0 || errMsg.indexOf('deny') >= 0;
    
    if (isDenied) {
      util.showToast('已取消获取手机号');
      return;
    }
    
    // 有 code 或 errMsg 为 ok 都算成功
    if (e.detail.code || errMsg.indexOf('ok') >= 0) {
      this.setData({
        phoneObtained: true,
        phoneCode: e.detail.code || ''
      });
      util.showToast('手机号获取成功');
    } else {
      // 回调但没有 code 也没有明确失败，可能是能力未开通
      util.showToast('获取失败，请检查手机号能力是否开通');
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
    this.setData({ showPhoneSheet: true });
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

    util.showLoading('发送中...');
    wx.request({
      url: config.SUPABASE_URL + '/functions/v1/sms-send',
      method: 'POST',
      data: { phone: phone },
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.ANON_KEY,
        'apikey': config.ANON_KEY
      },
      success: (res) => {
        util.hideLoading();
        if (res.statusCode === 200 && res.data && res.data.success) {
          util.showToast('验证码已发送');
          this.setData({ smsCountdown: 60 });
          this._startCountdown();
        } else {
          util.showToast(res.data && res.data.message || '发送失败');
        }
      },
      fail: (err) => {
        util.hideLoading();
        console.error('发送验证码失败:', err);
        util.showToast('网络错误，请重试');
      }
    });
  },

  _startCountdown() {
    if (this.data.smsCountdown <= 0) return;
    this._countdownTimer = setTimeout(() => {
      this.setData({ smsCountdown: this.data.smsCountdown - 1 });
      this._startCountdown();
    }, 1000);
  },

  confirmPhoneLogin() {
    const phone = (this.data.phoneInput || '').trim();
    const code = (this.data.smsCode || '').trim();
    if (!phone || phone.length !== 11) {
      util.showToast('请输入正确的手机号');
      return;
    }
    if (!code || code.length < 4) {
      util.showToast('请输入验证码');
      return;
    }

    util.showLoading('登录中...');
    wx.request({
      url: config.SUPABASE_URL + '/functions/v1/sms-verify',
      method: 'POST',
      data: { phone: phone, code: code },
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + config.ANON_KEY,
        'apikey': config.ANON_KEY
      },
      success: (res) => {
        util.hideLoading();
        if (res.statusCode === 200 && res.data && res.data.success) {
          // 验证成功，保存用户登录状态
          const u = util.getUserState();
          u.phone = phone;
          u.hasLoggedIn = true;
          util.saveUser(u);

          this.setData({ showPhoneSheet: false });
          util.showToast('登录成功');
          setTimeout(() => this.goBack(), 800);
        } else {
          util.showToast(res.data && res.data.message || '验证码错误或已过期');
        }
      },
      fail: (err) => {
        util.hideLoading();
        console.error('验证失败:', err);
        util.showToast('网络错误，请重试');
      }
    });
  },

  onUnload() {
    if (this._countdownTimer) clearTimeout(this._countdownTimer);
  }
});
