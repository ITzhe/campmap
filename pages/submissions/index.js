// pages/submissions/index.js — 我的提交页逻辑
const util = require('../../utils/util');
const config = require('../../utils/config');

const STORAGE_KEY = 'camp_submissions';
const SEED_FLAG = 'camp_submissions_seeded';

// 状态文案 & 样式映射
const STATUS_MAP = {
  pending: { label: '审核中', cls: 'pending' },
  approved: { label: '已通过', cls: 'approved' },
  rejected: { label: '已拒绝', cls: 'rejected' }
};

// 演示数据 (首次访问自动种入一次，方便预览全部状态；正式上线可移除)
const MOCK_SUBMISSIONS = [
  {
    id: 'sub_1722916320',
    name: '崂山湾滨海露营地',
    address: '山东省青岛市崂山区崂山风景区东侧海湾',
    latitude: 36.1571,
    longitude: 120.6240,
    parking_status: 0,
    facilities: ['water_status', 'power_status', 'toilet_status', 'rv_friendly', 'tent_friendly'],
    status: 'approved',
    submit_time: '2026-08-06 14:32'
  },
  {
    id: 'sub_1722830100',
    name: '黄岛银沙滩自驾营地',
    address: '山东省青岛市黄岛区银沙滩路 88 号',
    latitude: 35.9640,
    longitude: 120.1660,
    parking_status: 1,
    facilities: ['power_status', 'charging_status', 'shower_status', 'rv_friendly'],
    status: 'pending',
    submit_time: '2026-08-05 09:15'
  },
  {
    id: 'sub_1722689400',
    name: '即墨鹤山脚下营地',
    address: '山东省青岛市即墨区鳌山卫镇鹤山东麓',
    latitude: 36.3210,
    longitude: 120.7120,
    parking_status: 0,
    facilities: ['water_status', 'tent_friendly', 'cooking_status'],
    status: 'approved',
    submit_time: '2026-08-03 18:40'
  },
  {
    id: 'sub_1722307680',
    name: '胶州少海湿地营地',
    address: '山东省青岛市胶州市少海国家湿地公园北门',
    latitude: 36.2480,
    longitude: 120.0330,
    parking_status: 0,
    facilities: ['toilet_status', 'fishing_status', 'grocery_status'],
    status: 'rejected',
    submit_time: '2026-07-30 11:08'
  }
];

Page({
  data: {
    statusBarHeight: 20,
    list: [],
    stats: {
      total: 0,
      approved: 0,
      pending: 0,
      points: 0
    },
    isEmpty: true
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
    this.loadList();
  },

  // 读取提交列表
  loadList() {
    // 首次访问种入演示数据 (仅一次)
    this._seedIfFirstVisit();

    let list = [];
    try {
      list = wx.getStorageSync(STORAGE_KEY) || [];
    } catch (e) {
      list = [];
    }

    // 装饰每条记录: 状态文案 + 设施标签
    list = list.map((item) => this._decorate(item));

    // 按提交时间倒序 (格式 YYYY-MM-DD HH:mm 可直接字符串比较)
    list.sort((a, b) => {
      return (b.submit_time || '').localeCompare(a.submit_time || '');
    });

    this.setData({
      list: list,
      stats: this._calcStats(list),
      isEmpty: list.length === 0
    });
  },

  // 首次访问种入演示数据
  _seedIfFirstVisit() {
    let seeded = false;
    try {
      seeded = !!wx.getStorageSync(SEED_FLAG);
    } catch (e) {}
    if (seeded) return;
    try {
      wx.setStorageSync(STORAGE_KEY, MOCK_SUBMISSIONS);
      wx.setStorageSync(SEED_FLAG, 1);
    } catch (e) {}
  },

  // 装饰单条数据: 补充状态文案、停车文案、设施标签
  _decorate(item) {
    const s = STATUS_MAP[item.status] || STATUS_MAP.pending;
    const facilities = (item.facilities || []).map((key) => ({
      key: key,
      label: config.FAC_LABELS[key] || key,
      emoji: config.FAC_EMOJI[key] || ''
    }));
    return Object.assign({}, item, {
      statusLabel: s.label,
      statusCls: s.cls,
      parkingText: Number(item.parking_status) === 1 ? '收费' : '免费',
      facilities: facilities
    });
  },

  // 统计: 总数 / 已通过 / 审核中 / 获得积分
  _calcStats(list) {
    let approved = 0;
    let pending = 0;
    list.forEach((it) => {
      if (it.status === 'approved') approved++;
      else if (it.status === 'pending') pending++;
    });
    return {
      total: list.length,
      approved: approved,
      pending: pending,
      points: approved * config.POINTS_RULES.camp_submit
    };
  },

  // 返回上一页
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // 去提交营地
  goSubmit() {
    wx.navigateTo({ url: '/pages/submit/index' });
  },

  // 点击列表项
  onItemTap(e) {
    const id = e.currentTarget.dataset.id;
    const item = this.data.list.find((s) => s.id === id);
    if (!item) return;

    if (item.status === 'approved') {
      // 已通过 -> 跳转营地详情
      const code = item.spot_code || item.id;
      wx.navigateTo({
        url: '/pages/detail/index?spot_code=' + code,
        fail: () => { util.showToast('详情页打开失败'); }
      });
    } else if (item.status === 'pending') {
      util.showToast('该营地正在审核中');
    } else {
      util.showToast('该营地未通过审核');
    }
  }
});
