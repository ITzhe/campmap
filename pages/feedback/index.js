// pages/feedback/index.js — 意见反馈页逻辑
const util = require('../../utils/util');
const security = require('../../utils/security');

const STORAGE_KEY = 'feedback_list';

Page({
  data: {
    statusBarHeight: 20,
    typeList: [
      { key: 'suggest', label: '功能建议' },
      { key: 'bug', label: 'bug反馈' },
      { key: 'content', label: '内容纠错' },
      { key: 'other', label: '其他' }
    ],
    currentType: 'suggest',
    content: '',
    submitted: false,
    feedbackCount: 0
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {
      this.setData({ statusBarHeight: 20 });
    }
    this.loadCount();
  },

  onShow() {
    this.loadCount();
  },

  // 读取历史反馈数量
  loadCount() {
    let list = [];
    try {
      list = wx.getStorageSync(STORAGE_KEY) || [];
    } catch (e) {
      list = [];
    }
    this.setData({ feedbackCount: list.length });
  },

  // 返回
  goBack() {
    wx.navigateBack({ delta: 1 });
  },

  // 选择反馈类型
  selectType(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ currentType: key });
  },

  // 输入反馈内容
  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  // 提交反馈
  async submit() {
    const content = (this.data.content || '').trim();
    if (content.length < 10) {
      util.showToast('请至少输入 10 个字');
      return;
    }

    // 内容安全检测
    const userData = util.getUserState();
    const openid = userData.openid || '';
    const textSafe = await security.checkTextWithToast(content, openid);
    if (!textSafe) return;

    // 读取已有列表
    let list = [];
    try {
      list = wx.getStorageSync(STORAGE_KEY) || [];
    } catch (e) {
      list = [];
    }

    // 类型文字
    const typeItem = this.data.typeList.find(t => t.key === this.data.currentType);
    const typeLabel = typeItem ? typeItem.label : '其他';

    // 新反馈
    const item = {
      id: 'fb_' + Date.now(),
      type: this.data.currentType,
      typeLabel: typeLabel,
      content: content,
      status: 'pending',
      createTime: this.formatTime(new Date())
    };

    list.unshift(item);
    try {
      wx.setStorageSync(STORAGE_KEY, list);
    } catch (e) {}

    this.setData({
      submitted: true,
      feedbackCount: list.length
    });
    util.showToast('提交成功，感谢反馈');
  },

  // 重置表单继续反馈
  resetForm() {
    this.setData({
      submitted: false,
      currentType: 'suggest',
      content: ''
    });
  },

  // 格式化时间
  formatTime(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }
});
