// pages/points/index.js — 积分页面逻辑
const util = require('../../utils/util');
const config = require('../../utils/config');

Page({
  data: {
    statusBarHeight: 20,
    points: 0,
    streak: 0,
    weekDays: [],
    historyGroups: [],
    checkedToday: false,
    checkinReward: config.POINTS_RULES.daily_checkin,
    rules: []
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {
      this.setData({ statusBarHeight: 20 });
    }
    this.buildRules();
  },

  onShow() {
    this.loadData();
  },

  // ============ 构建积分规则 ============
  buildRules() {
    const r = config.POINTS_RULES;
    const list = [
      { label: '每日签到', v: r.daily_checkin },
      { label: '营地录入（审核通过）', v: r.camp_submit },
      { label: '查看营地详情', v: r.view_detail },
      { label: '营地打卡', v: r.camp_checkin }
    ];
    list.forEach(it => {
      it.vStr = it.v > 0 ? '+' + it.v : '−' + (-it.v);
    });
    this.setData({ rules: list });
  },

  // ============ 加载数据 ============
  loadData() {
    const user = util.getUserState();
    const today = util.todayStr();
    const checkedToday = user.lastCheckin === today;
    const weekDays = util.getWeekCalendar(user.streak, user.lastCheckin);
    const history = util.getPointsHistory();
    const historyGroups = this.groupHistory(history);

    // 同步全局积分
    const app = getApp();
    app.globalData.points = user.points;
    app.globalData.streak = user.streak;

    this.setData({
      points: user.points,
      streak: user.streak,
      weekDays,
      checkedToday,
      historyGroups
    });
  },

  // ============ 按日期分组积分明细 ============
  groupHistory(list) {
    const map = {};
    const order = [];
    list.forEach(it => {
      if (!map[it.d]) {
        map[it.d] = [];
        order.push(it.d);
      }
      map[it.d].push({
        t: it.t,
        v: it.v,
        vStr: it.v > 0 ? '+' + it.v : '−' + (-it.v)
      });
    });
    return order.map(d => ({ date: this.fmtDate(d), items: map[d] }));
  },

  // ============ 日期格式化 YYYY-MM-DD -> M月D日 周X ============
  fmtDate(s) {
    const p = s.split('-');
    const m = parseInt(p[1], 10);
    const d = parseInt(p[2], 10);
    const days = ['日', '一', '二', '三', '四', '五', '六'];
    const dt = new Date(parseInt(p[0], 10), m - 1, d);
    return m + '月' + d + '日 周' + days[dt.getDay()];
  },

  // ============ 签到 ============
  doCheckin() {
    if (this.data.checkedToday) {
      util.showToast('今日已签到，明天再来吧');
      return;
    }
    const result = util.doCheckin();
    if (result.success) {
      const app = getApp();
      app.globalData.points = result.points;
      app.globalData.streak = result.streak;

      const weekDays = util.getWeekCalendar(result.streak, util.todayStr());
      this.setData({
        points: result.points,
        streak: result.streak,
        checkedToday: true,
        weekDays
      });
      util.showToast('签到成功 +' + config.POINTS_RULES.daily_checkin + ' 积分');
    } else {
      util.showToast(result.msg);
    }
  },

  // ============ 返回 ============
  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
