// pages/profile/index.js — 编辑个人资料页逻辑
const util = require('../../utils/util');
const oss = require('../../utils/oss');
const security = require('../../utils/security');

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
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
    this.setData({ statusBarHeight: sbh, navHeight: sbh + 44 });

    const u = util.getUserState();
    this.setData({
      tempNick: (u.nick && u.nick !== '微信用户') ? u.nick : '',
      tempAvatarUrl: u.avatarUrl || ''
    });
  },

  onNickInput(e) {
    this.setData({ tempNick: e.detail.value });
  },

  onNickBlur(e) {
    if (e.detail.value) {
      this.setData({ tempNick: e.detail.value });
    }
  },

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

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/mine/index' }) });
  },

  async saveProfile() {
    const nick = (this.data.tempNick || '').trim();
    if (!nick) {
      util.showToast('请输入昵称');
      return;
    }

    const userData = util.getUserState();
    const openid = userData.openid || '';
    const textSafe = await security.checkTextWithToast(nick, openid);
    if (!textSafe) return;

    util.setUserNick(nick);

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
        const u = util.getUserState();
        u.avatarUrl = url;
        util.saveUser(u);
      } catch (e) {
        console.error('[profile] avatar upload failed:', e);
        util.hideLoading();
        util.showToast('头像上传失败，昵称已保存');
        this.goBack();
        return;
      }
      util.hideLoading();
    }

    util.showToast('保存成功');
    setTimeout(() => this.goBack(), 600);
  }
});
