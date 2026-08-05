// components/filter-sheet/index.js — 筛选弹窗组件
const config = require('../../utils/config');

Component({
  properties: {
    visible: { type: Boolean, value: false },
    filters: {
      type: Object,
      value: { fee: 'all', park: [], fac: [] }
    },
    campCount: { type: Number, value: 0 }
  },

  data: {
    feeOptions: config.FILTER_OPTIONS.fee,
    parkOptions: config.FILTER_OPTIONS.park,
    facOptions: config.FILTER_OPTIONS.fac,
    matchCount: 0,
    // 内部筛选状态 (避免直接修改 properties)
    innerFilters: { fee: 'all', park: [], fac: [] }
  },

  observers: {
    'visible': function(val) {
      if (val) {
        // 打开时同步外部 filters 到内部
        this.setData({
          innerFilters: JSON.parse(JSON.stringify(this.data.filters))
        });
        this.updateMatchCount();
      }
    }
  },

  methods: {
    // 单选 (费用)
    pickSingle(e) {
      const { key, value } = e.currentTarget.dataset;
      const filters = this.data.innerFilters;
      filters[key] = value;
      this.setData({ innerFilters: filters });
      this.updateMatchCount();
    },

    // 多选切换
    toggleMulti(e) {
      const { key, value } = e.currentTarget.dataset;
      const filters = this.data.innerFilters;
      const arr = filters[key];
      const idx = arr.indexOf(value);
      if (idx > -1) {
        arr.splice(idx, 1);
      } else {
        arr.push(value);
      }
      this.setData({ innerFilters: filters });
      this.updateMatchCount();
    },

    // 计算匹配数量
    updateMatchCount() {
      const f = this.data.innerFilters;
      const app = getApp();
      const camps = app.globalData.selectedCamp ? [] : [];
      // 从页面获取营地数据
      const pages = getCurrentPages();
      const mapPage = pages.find(p => p.route === 'pages/map/index');
      const allCamps = mapPage ? mapPage.data.camps : [];

      const matched = allCamps.filter(c => {
        if (f.fee !== 'all' && c.parking_status != f.fee) return false;
        if (f.park.length && !f.park.every(k => c[k] == 1)) return false;
        if (f.fac.length && !f.fac.every(k => c[k] == 1)) return false;
        return true;
      });

      this.setData({ matchCount: matched.length });
    },

    // 确定
    onConfirm() {
      const f = this.data.innerFilters;
      const count = (f.fee !== 'all' ? 1 : 0) + f.park.length + f.fac.length;
      this.triggerEvent('confirm', {
        filters: f,
        count: count
      });
    },

    // 重置
    onReset() {
      this.setData({
        innerFilters: { fee: 'all', park: [], fac: [] }
      });
      this.updateMatchCount();
      this.triggerEvent('reset');
    },

    // 关闭
    onClose() {
      this.triggerEvent('close');
    }
  }
});
