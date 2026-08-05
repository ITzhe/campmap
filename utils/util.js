// util.js — 工具函数

const config = require('./config');

/**
 * 日期格式化为 YYYY-MM-DD
 */
function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 昨天日期字符串
 */
function yesterdayStr() {
  const d = new Date(Date.now() - 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Haversine 距离计算 (km)
 */
function distance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toR = d => d * Math.PI / 180;
  const dLat = toR(lat2 - lat1);
  const dLng = toR(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/**
 * 15km 范围 Bounding Box 查询参数
 */
function radiusBBox(lat, lng, radiusKm) {
  const R = radiusKm || config.RADIUS_KM;
  const latRad = lat * Math.PI / 180;
  const latOffset = R / 111;
  const lngOffset = R / (111 * Math.cos(latRad));
  return {
    latMin: lat - latOffset,
    latMax: lat + latOffset,
    lngMin: lng - lngOffset,
    lngMax: lng + lngOffset
  };
}

/**
 * 初始化用户 (LocalStorage 模拟)
 */
function initUser() {
  let data = wx.getStorageSync('camp_user');
  if (!data) {
    data = {
      openid: 'mock_' + Math.random().toString(36).slice(2, 10),
      points: config.POINTS_RULES.initial,
      streak: 0,
      lastCheckin: null,
      joinDate: todayStr()
    };
    saveUser(data);
  }
  return data;
}

/**
 * 保存用户数据
 */
function saveUser(data) {
  wx.setStorageSync('camp_user', data);
}

/**
 * 获取用户状态
 */
function getUserState() {
  return wx.getStorageSync('camp_user') || initUser();
}

/**
 * 更新用户积分
 */
function updatePoints(delta) {
  const data = getUserState();
  data.points = Math.max(0, data.points + delta);
  saveUser(data);
  return data.points;
}

/**
 * 签到
 */
function doCheckin() {
  const data = getUserState();
  const today = todayStr();
  if (data.lastCheckin === today) {
    return { success: false, msg: '今日已签到，明天再来吧' };
  }
  const yesterday = yesterdayStr();
  data.streak = (data.lastCheckin === yesterday) ? data.streak + 1 : 1;
  data.lastCheckin = today;
  data.points += config.POINTS_RULES.daily_checkin;
  saveUser(data);
  return { success: true, points: data.points, streak: data.streak };
}

/**
 * 计算加入天数
 */
function calcJoinDays(joinDate) {
  if (!joinDate) return 1;
  const diff = Date.now() - new Date(joinDate).getTime();
  return Math.max(1, Math.floor(diff / 86400000) + 1);
}

/**
 * 显示 toast
 */
function showToast(msg) {
  wx.showToast({
    title: msg,
    icon: 'none',
    duration: 1800
  });
}

/**
 * 显示 loading
 */
function showLoading(title) {
  wx.showLoading({
    title: title || '加载中...',
    mask: true
  });
}

/**
 * 隐藏 loading
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 生成周历数据
 */
function getWeekCalendar(streak, lastCheckin) {
  const days = ['日', '一', '二', '三', '四', '五', '六'];
  const today = new Date();
  const todayStrVal = todayStr();
  const checked = lastCheckin === todayStrVal;
  const result = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const isToday = (i === 6);
    const isChecked = checked && i >= (7 - Math.min(streak, 7));
    result.push({
      weekday: '周' + days[d.getDay()],
      date: d.getDate(),
      isChecked,
      isToday
    });
  }
  return result;
}

/**
 * 获取积分明细 mock 数据
 */
function getPointsHistory() {
  return [
    { d: '2026-08-05', t: '每日签到', v: 10 },
    { d: '2026-08-04', t: '每日签到', v: 10 },
    { d: '2026-08-04', t: '查看营地详情', v: -1 },
    { d: '2026-08-03', t: '每日签到', v: 10 },
    { d: '2026-08-03', t: '营地打卡', v: 5 },
    { d: '2026-08-02', t: '营地录入审核通过', v: 100 }
  ];
}

module.exports = {
  todayStr,
  yesterdayStr,
  distance,
  radiusBBox,
  initUser,
  saveUser,
  getUserState,
  updatePoints,
  doCheckin,
  calcJoinDays,
  showToast,
  showLoading,
  hideLoading,
  getWeekCalendar,
  getPointsHistory
};
