// pages/submit/index.js — 营地录入页逻辑
const config = require('../../utils/config');
const api = require('../../utils/api');
const util = require('../../utils/util');

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

    // 配套设施（多选）
    facSelected: [],

    // 更多选项（多选）
    moreOptions: [
      { v: 'rv_friendly', l: '停房车' },
      { v: 'grocery_status', l: '能买菜' },
      { v: 'fire_status', l: '可明火' }
    ],
    moreSelected: [],

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
    const emoji = PHOTO_EMOJIS[this.data.photos.length % PHOTO_EMOJIS.length];
    const photos = this.data.photos.concat([{
      emoji: emoji,
      id: 'p_' + Date.now() + '_' + this.data.photos.length
    }]);
    this.setData({ photos: photos });
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

  // ============ 更多选项多选 ============
  toggleMore(e) {
    this._toggleArray('moreSelected', e.currentTarget.dataset.v);
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
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          location: {
            latitude: res.latitude,
            longitude: res.longitude,
            name: res.name,
            address: res.address
          },
          subAddr: this.data.subAddr || res.address || res.name
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
    if (!contact) { util.showToast('请填写联系人姓名'); return; }
    if (!phone) { util.showToast('请填写联系电话'); return; }
    if (!/^1\d{10}$/.test(phone)) { util.showToast('请输入正确的手机号'); return; }

    this.setData({ submitting: true });
    util.showLoading('提交中...');

    // 合并所有设施标记
    const flags = {};
    this.data.parkSelected
      .concat(this.data.facSelected)
      .concat(this.data.moreSelected)
      .forEach((k) => { flags[k] = 1; });
    // 停车费用以 feeSelected 为准
    flags.parking_status = this.data.feeSelected;

    const payload = Object.assign({
      name: name,
      address: addr,
      contact_name: contact,
      contact_phone: phone,
      intro: this.data.subIntro.trim(),
      photo_count: this.data.photos.length,
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
