// pages/tutorial/index.js — 使用教程页逻辑
Page({
  data: {
    statusBarHeight: 20,
    steps: [
      {
        idx: 1,
        icon: '🗺️',
        title: '搜索营地',
        desc: '在地图页面拖动地图查看附近营地，点击营地标记查看详情'
      },
      {
        idx: 2,
        icon: '🧭',
        title: '线路规划',
        desc: '在线路页面选择起点和终点，自动推荐沿途营地'
      },
      {
        idx: 3,
        icon: '📍',
        title: '营地打卡',
        desc: '在营地详情页点击打卡按钮，获得5积分'
      },
      {
        idx: 4,
        icon: '📝',
        title: '营地录入',
        desc: '发现新营地？点击提交，审核通过奖励100积分'
      },
      {
        idx: 5,
        icon: '🪙',
        title: '积分系统',
        desc: '每日签到+10积分，查看详情-1积分，打卡+5积分'
      },
      {
        idx: 6,
        icon: '⚙️',
        title: '筛选功能',
        desc: '点击筛选按钮，按收费、设施等条件筛选营地'
      }
    ]
  },

  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      this.setData({ statusBarHeight: sys.statusBarHeight || 20 });
    } catch (e) {
      this.setData({ statusBarHeight: 20 });
    }
  },

  // 返回
  goBack() {
    wx.navigateBack({ delta: 1 });
  }
});
