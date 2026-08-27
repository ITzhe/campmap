// pages/search/index.js — 营地搜索页
const config = require('../../utils/config');
const util = require('../../utils/util');

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    keyword: '',
    results: [],
    searching: false,
    searched: false,
    history: []
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

    // 加载搜索历史
    try {
      const h = wx.getStorageSync('camp_search_history');
      if (h) this.setData({ history: h });
    } catch (e) {}
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value });
  },

  // 搜索
  onSearch() {
    const kw = (this.data.keyword || '').trim();
    if (!kw) {
      util.showToast('请输入搜索关键词');
      return;
    }

    // 保存搜索历史
    this._saveHistory(kw);

    this.setData({ searching: true, searched: true, results: [] });

    // 用 Supabase ilike 模糊搜索 name 和 address
    const url = `${config.API_BASE}/camping_spots?select=spot_code,name,longitude,latitude,address,parking_status,toilet_status,water_status,power_status,charging_status,rv_friendly,trailer_friendly,tent_friendly&or=(name.ilike.*${encodeURIComponent(kw)}*,address.ilike.*${encodeURIComponent(kw)}*)&limit=50`;

    wx.request({
      url: url,
      method: 'GET',
      header: config.getHeaders(),
      timeout: 8000,
      success: (res) => {
        if (res.statusCode === 200 && Array.isArray(res.data)) {
          const results = res.data.map(c => ({
            ...c,
            isFree: c.parking_status === 0,
            tags: this._buildTags(c)
          }));
          this.setData({ results: results });
        } else {
          util.showToast('搜索失败');
        }
      },
      fail: () => {
        util.showToast('网络错误');
      },
      complete: () => {
        this.setData({ searching: false });
      }
    });
  },

  _buildTags(camp) {
    const tags = [];
    if (camp.toilet_status) tags.push('🚻');
    if (camp.water_status) tags.push('💧');
    if (camp.power_status) tags.push('🔌');
    if (camp.charging_status) tags.push('🔋');
    if (camp.rv_friendly) tags.push('🚐');
    if (camp.tent_friendly) tags.push('⛺');
    return tags.join(' ');
  },

  _saveHistory(kw) {
    let h = this.data.history.filter(k => k !== kw);
    h.unshift(kw);
    h = h.slice(0, 10);
    this.setData({ history: h });
    try { wx.setStorageSync('camp_search_history', h); } catch (e) {}
  },

  // 点击历史关键词
  onTapHistory(e) {
    const kw = e.currentTarget.dataset.kw;
    this.setData({ keyword: kw });
    this.onSearch();
  },

  // 清除历史
  onClearHistory() {
    wx.showModal({
      title: '提示',
      content: '清除搜索历史？',
      confirmColor: '#2d6a4f',
      success: (res) => {
        if (res.confirm) {
          this.setData({ history: [] });
          try { wx.removeStorageSync('camp_search_history'); } catch (e) {}
        }
      }
    });
  },

  // 点击搜索结果
  onTapResult(e) {
    const spot = e.currentTarget.dataset.spot;
    wx.navigateTo({
      url: `/pages/detail/index?spotCode=${spot.spot_code}`
    });
  },

  // 在地图上查看
  onShowOnMap(e) {
    const spot = e.currentTarget.dataset.spot;
    const app = getApp();
    app.globalData.mapFocus = {
      latitude: spot.latitude,
      longitude: spot.longitude,
      spotCode: spot.spot_code
    };
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/map/index' }) });
  },

  goBack() {
    wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/map/index' }) });
  }
});
