// pages/login/index.js — 登录/注册页逻辑
const util = require('../../utils/util');
const config = require('../../utils/config');
const oss = require('../../utils/oss');
const security = require('../../utils/security');

Page({
  data: {
    statusBarHeight: 20,
    tempNick: '',
    tempAvatarUrl: '',
    avatarChanged: false,
    phoneText: '点击获取手机号',
    phoneCode: '',
    canLogin: false,
    agreed: false,
    nickFocus: false
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

  // 昵称输入
  onNickInput(e) {
    this.setData({ tempNick: e.detail.value });
    this._updateCanLogin();
  },

  onNickBlur(e) {
    if (e.detail.value) {
      this.setData({ tempNick: e.detail.value });
      this._updateCanLogin();
    }
    this.setData({ nickFocus: false });
  },

  // 从相册/相机选择头像
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

  // 手机号授权
  onGetPhoneNumber(e) {
    if (e.detail.errMsg === 'getPhoneNumber:ok') {
      // e.detail.code 可在后端解密获取手机号
      // 前端先用授权成功标记
      this.setData({
        phoneCode: e.detail.code,
        phoneText: '✓ 已获取手机号'
      });
    } else {
      util.showToast('未获取手机号授权');
    }
  },

  // 协议勾选
  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
    this._updateCanLogin();
  },

  goPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/index' });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/map/index' }) });
  },

  // 更新可登录状态
  _updateCanLogin() {
    const canLogin = !!(this.data.tempNick && this.data.tempNick.trim() && this.data.agreed);
    this.setData({ canLogin });
  },

  // 完成登录
  async doLogin() {
    if (!this.data.canLogin) {
      if (!this.data.tempNick || !this.data.tempNick.trim()) {
        util.showToast('请输入昵称');
        return;
      }
      if (!this.data.agreed) {
        util.showToast('请先同意隐私协议');
        return;
      }
      return;
    }

    const nick = this.data.tempNick.trim();
    const userData = util.getUserState();
    const openid = userData.openid || '';

    // 内容安全检测
    const textSafe = await security.checkTextWithToast(nick, openid);
    if (!textSafe) return;

    // 保存昵称
    util.setUserNick(nick);

    // 保存手机号
    const u = util.getUserState();
    if (this.data.phoneCode) {
      u.phoneCode = this.data.phoneCode;
      u.phone = '已绑定';
    }
    u.hasLoggedIn = true;
    util.saveUser(u);

    // 上传头像
    if (this.data.avatarChanged && this.data.tempAvatarUrl) {
      util.showLoading('保存中...');
      try {
        const url = await oss.uploadToOSS(this.data.tempAvatarUrl, 'avatars', 'jpg');
        const imgSafe = await security.checkImage(url, openid);
        if (!imgSafe.safe) {
          util.hideLoading();
          wx.showModal({
            title: '图片提醒',
            content: '您上传的头像图片含违规信息，请更换后重新提交。',
            showCancel: false,
            confirmText: '我知道了',
            confirmColor: '#2d6a4f'
          });
          return;
        }
        const u2 = util.getUserState();
        u2.avatarUrl = url;
        util.saveUser(u2);
      } catch (e) {
        console.error('[login] avatar upload failed:', e);
        util.hideLoading();
        util.showToast('头像上传失败，昵称已保存');
        this.goBack();
        return;
      }
      util.hideLoading();
    }

    util.showToast('登录成功');
    setTimeout(() => this.goBack(), 800);
  }
});
