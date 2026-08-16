// pages/submit/index.js — 营地录入页逻辑
const config = require('../../utils/config');
const api = require('../../utils/api');
const util = require('../../utils/util');
const oss = require('../../utils/oss');
const security = require('../../utils/security');

// 照片占位 emoji 池
const PHOTO_EMOJIS = ['🏕️', '⛰️', '🌲', '🌅', '🔥', '🚐', '⛺', '🏞️', '🌄'];

Page({
  data: {
    statusBarHeight: 20,
    rewardPoints: config.POINTS_RULES.camp_submit,
    facItems: config.SUBMIT_FAC_ITEMS,

    // 照片
    photos: [],

    // 费用（单选，0 免费 / 1 收费）
    feeSelected: 0,
    feeOptions: [
      { v: 0, l: '免费' },
      { v: 1, l: '收费' }
    ],

    // 停车类型（多选）
    parkOptions: [
      { v: 'rv_friendly', l: '房车可停' },
      { v: 'trailer_friendly', l: '停拖挂' },
      { v: 'tent_friendly', l: '帐篷可搭' }
    ],
    parkSelected: [],

    // 配套设施（多选, 合并了原"更多选项"）
    facSelected: [],

    // 表单字段
    subName: '',
    subAddr: '',
    subContact: '',
    subPhone: '',
    subIntro: '',

    // 地图选点
    location: null,

    submitting: false
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

    // 获取用户当前位置作为默认地址
    this.getDefaultLocation();
  },

  // 获取用户当前位置并逆向地理编码
  getDefaultLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const location = {
          latitude: res.latitude,
          longitude: res.longitude
        };
        this.setData({ location: location });

        // 调用腾讯地图逆向地理编码 API 获取地址
        const key = config.MAP_KEY || '';
        if (key) {
          wx.request({
            url: 'https://apis.map.qq.com/ws/geocoder/v1/',
            data: {
              location: res.latitude + ',' + res.longitude,
              key: key
            },
            method: 'GET',
            success: (r) => {
              if (r.data && r.data.status === 0 && r.data.result) {
                const addr = r.data.result.address || '';
                this.setData({ subAddr: addr });
              }
            },
            fail: () => {}
          });
        }
      },
      fail: () => {
        console.log('[submit] 获取定位失败, 用户需手动输入地址');
      }
    });
  },

  // 返回上一页
  onBack() {
    wx.navigateBack({ delta: 1 });
  },

  // ============ 照片 ============
  addPhoto() {
    if (this.data.photos.length >= 9) {
      util.showToast('最多上传 9 张照片');
      return;
    }
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        const photos = this.data.photos.concat([{
          path: tempFilePath,
          id: 'p_' + Date.now() + '_' + this.data.photos.length
        }]);
        this.setData({ photos: photos });
      },
      fail: () => {}
    });
  },

  delPhoto(e) {
    const idx = e.currentTarget.dataset.idx;
    const photos = this.data.photos.slice();
    photos.splice(idx, 1);
    this.setData({ photos: photos });
  },

  // ============ 输入框 ============
  onInput(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ [key]: e.detail.value });
  },

  // ============ 费用单选 ============
  pickFee(e) {
    this.setData({ feeSelected: e.currentTarget.dataset.v });
  },

  // ============ 停车类型多选 ============
  togglePark(e) {
    this._toggleArray('parkSelected', e.currentTarget.dataset.v);
  },

  // ============ 配套设施多选 ============
  toggleFac(e) {
    this._toggleArray('facSelected', e.currentTarget.dataset.v);
  },

  _toggleArray(field, value) {
    const arr = this.data[field].slice();
    const i = arr.indexOf(value);
    if (i > -1) {
      arr.splice(i, 1);
    } else {
      arr.push(value);
    }
    this.setData({ [field]: arr });
  },

  // ============ 地图选点 ============
  pickLocation() {
    const cur = this.data.location || {
      latitude: 36.0671,
      longitude: 120.3826
    };
    wx.chooseLocation({
      latitude: cur.latitude,
      longitude: cur.longitude,
      success: (res) => {
        this.setData({
          location: {
            latitude: res.latitude,
            longitude: res.longitude,
            name: res.name,
            address: res.address
          },
          subAddr: res.address || res.name || this.data.subAddr
        });
        util.showToast('已选点：' + (res.name || res.address || ''));
      },
      fail: () => {
        util.showToast('未选择位置');
      }
    });
  },

  // ============ 提交审核 ============
  async submitCamp() {
    if (this.data.submitting) return;

    const name = this.data.subName.trim();
    const addr = this.data.subAddr.trim();
    const contact = this.data.subContact.trim();
    const phone = this.data.subPhone.trim();

    if (!name) { util.showToast('请填写营地名称'); return; }
    if (!addr) { util.showToast('请填写详细地址'); return; }
    // 联系人信息非必填, 但如果填了电话则校验格式
    if (phone && !/^1\d{10}$/.test(phone)) { util.showToast('请输入正确的手机号'); return; }

    // 内容安全检测: 合并所有文本字段
    const userData = util.getUserState();
    const openid = userData.openid || '';
    const allText = name + ' ' + addr + ' ' + contact + ' ' + this.data.subIntro.trim();
    const textSafe = await security.checkTextWithToast(allText, openid);
    if (!textSafe) return;

    this.setData({ submitting: true });
    util.showLoading('提交中...');

    // 上传照片到 OSS
    let photoUrls = [];
    if (this.data.photos.length > 0) {
      const paths = this.data.photos.map(p => p.path);
      try {
        photoUrls = await oss.uploadBatchToOSS(paths, 'camps');
        // 图片内容安全检测
        const imgResult = await security.checkImages(photoUrls.filter(u => u), openid);
        if (!imgResult.safe) {
          util.hideLoading();
          this.setData({ submitting: false });
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
        console.warn('[submit] 照片上传失败:', e.message);
      }
    }

    // 合并所有设施标记
    const flags = {};
    this.data.parkSelected
      .concat(this.data.facSelected)
      .forEach((k) => { flags[k] = 1; });
    // 停车费用以 feeSelected 为准
    flags.parking_status = this.data.feeSelected;

    const payload = Object.assign({
      name: name,
      address: addr,
      contact_name: contact || '',
      contact_phone: phone || '',
      intro: this.data.subIntro.trim(),
      photo_urls: photoUrls.filter(u => u).join(','),
      photo_count: photoUrls.filter(u => u).length,
      status: 'pending'
    }, flags);

    if (this.data.location) {
      payload.latitude = this.data.location.latitude;
      payload.longitude = this.data.location.longitude;
    }

    try {
      await api.submitCampsite(payload);
    } catch (e) {
      console.warn('[submit] 提交异常:', e);
    }

    util.hideLoading();
    this.setData({ submitting: false });
    util.showToast('提交成功，等待审核');

    setTimeout(() => {
      wx.navigateBack({ delta: 1 });
    }, 1200);
  }
});
