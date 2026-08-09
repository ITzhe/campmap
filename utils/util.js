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
      nick: '',
      avatarUrl: '',
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
 * 检查用户是否已登录 (有真实昵称)
 */
function isLoggedIn() {
  const u = getUserState();
  return !!(u.nick && u.nick.trim());
}

/**
 * 微信登录 — 获取用户昵称和头像
 * 优先使用 wx.getUserProfile, 降级到手动输入
 */
function wxLogin() {
  return new Promise((resolve, reject) => {
    // 尝试 wx.getUserProfile (部分基础库仍支持)
    if (wx.getUserProfile) {
      wx.getUserProfile({
        desc: '用于评论和互动',
        success: (res) => {
          const userInfo = res.userInfo || {};
          const u = getUserState();
          u.nick = userInfo.nickName || '微信用户';
          u.avatarUrl = userInfo.avatarUrl || '';
          saveUser(u);
          resolve(u);
        },
        fail: () => {
          // 用户拒绝授权, 降级到手动输入
          _manualLogin().then(resolve).catch(reject);
        }
      });
    } else {
      // getUserProfile 不可用, 使用手动输入
      _manualLogin().then(resolve).catch(reject);
    }
  });
}

/**
 * 手动输入昵称登录 (降级方案)
 */
function _manualLogin() {
  return new Promise((resolve, reject) => {
    wx.showModal({
      title: '设置昵称',
      content: '请输入您的昵称，用于评论展示',
      editable: true,
      placeholderText: '如：露营达人',
      confirmText: '确定',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const u = getUserState();
          u.nick = res.content.trim().slice(0, 20);
          saveUser(u);
          resolve(u);
        } else {
          reject(new Error('用户取消'));
        }
      },
      fail: () => reject(new Error('登录失败'))
    });
  });
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

/**
 * 根据坐标查找最近的城市名 (逆向地理编码 - 离线版)
 * 使用全国主要城市坐标表进行最近邻匹配
 */
const MAJOR_CITIES = [
  { name: '北京', lat: 39.9042, lng: 116.4074 },
  { name: '上海', lat: 31.2304, lng: 121.4737 },
  { name: '广州', lat: 23.1291, lng: 113.2644 },
  { name: '深圳', lat: 22.5431, lng: 114.0579 },
  { name: '成都', lat: 30.5728, lng: 104.0668 },
  { name: '杭州', lat: 30.2741, lng: 120.1551 },
  { name: '武汉', lat: 30.5928, lng: 114.3055 },
  { name: '西安', lat: 34.3416, lng: 108.9398 },
  { name: '重庆', lat: 29.5630, lng: 106.5516 },
  { name: '天津', lat: 39.0842, lng: 117.2009 },
  { name: '南京', lat: 32.0603, lng: 118.7969 },
  { name: '苏州', lat: 31.2989, lng: 120.5853 },
  { name: '青岛', lat: 36.0671, lng: 120.3826 },
  { name: '沈阳', lat: 41.8057, lng: 123.4315 },
  { name: '大连', lat: 38.9140, lng: 121.6147 },
  { name: '哈尔滨', lat: 45.8038, lng: 126.5350 },
  { name: '长春', lat: 43.8171, lng: 125.3235 },
  { name: '济南', lat: 36.6512, lng: 117.1201 },
  { name: '郑州', lat: 34.7472, lng: 113.6253 },
  { name: '长沙', lat: 28.2278, lng: 112.9388 },
  { name: '合肥', lat: 31.8206, lng: 117.2272 },
  { name: '福州', lat: 26.0745, lng: 119.2965 },
  { name: '厦门', lat: 24.4798, lng: 118.0894 },
  { name: '南昌', lat: 28.6820, lng: 115.8579 },
  { name: '南宁', lat: 22.8170, lng: 108.3669 },
  { name: '昆明', lat: 25.0389, lng: 102.7183 },
  { name: '贵阳', lat: 26.6470, lng: 106.6302 },
  { name: '兰州', lat: 36.0611, lng: 103.8343 },
  { name: '太原', lat: 37.8706, lng: 112.5489 },
  { name: '石家庄', lat: 38.0428, lng: 114.5149 },
  { name: '呼和浩特', lat: 40.8426, lng: 111.7491 },
  { name: '乌鲁木齐', lat: 43.8256, lng: 87.6168 },
  { name: '银川', lat: 38.4872, lng: 106.2309 },
  { name: '西宁', lat: 36.6232, lng: 101.7782 },
  { name: '拉萨', lat: 29.6500, lng: 91.1409 },
  { name: '海口', lat: 20.0440, lng: 110.1990 },
  { name: '三亚', lat: 18.2528, lng: 109.5119 },
  { name: '珠海', lat: 22.2710, lng: 113.5767 },
  { name: '佛山', lat: 23.0218, lng: 113.1219 },
  { name: '东莞', lat: 23.0207, lng: 113.7518 },
  { name: '无锡', lat: 31.4912, lng: 120.3119 },
  { name: '宁波', lat: 29.8683, lng: 121.5440 },
  { name: '温州', lat: 28.0016, lng: 120.6720 },
  { name: '烟台', lat: 37.4638, lng: 121.4478 },
  { name: '威海', lat: 37.5128, lng: 122.1200 },
  { name: '桂林', lat: 25.2734, lng: 110.2907 },
  { name: '洛阳', lat: 34.6197, lng: 112.4540 },
  { name: '唐山', lat: 39.6306, lng: 118.1804 },
  { name: '徐州', lat: 34.2058, lng: 117.2839 },
  { name: '潍坊', lat: 36.7068, lng: 119.1620 },
  { name: '临沂', lat: 35.1045, lng: 118.3564 },
  { name: '保定', lat: 38.8740, lng: 115.4646 },
  { name: '大庆', lat: 46.5907, lng: 125.1037 },
  { name: '包头', lat: 40.6574, lng: 109.8403 },
  { name: '宜昌', lat: 30.6918, lng: 111.2864 },
  { name: '遵义', lat: 27.7256, lng: 106.9273 },
  { name: '绵阳', lat: 31.4677, lng: 104.6796 },
  { name: '张家口', lat: 40.7686, lng: 114.8869 },
  { name: '承德', lat: 40.9510, lng: 117.9626 },
  { name: '秦皇岛', lat: 39.9354, lng: 119.6005 },
  { name: '连云港', lat: 34.5969, lng: 119.2216 },
  { name: '南通', lat: 31.9802, lng: 120.8942 },
  { name: '常州', lat: 31.7727, lng: 119.9469 },
  { name: '扬州', lat: 32.3946, lng: 119.4127 },
  { name: '泰州', lat: 32.4554, lng: 119.9229 },
  { name: '盐城', lat: 33.3776, lng: 120.1573 },
  { name: '嘉兴', lat: 30.7522, lng: 120.7555 },
  { name: '湖州', lat: 30.8949, lng: 120.0865 },
  { name: '绍兴', lat: 30.0303, lng: 120.5848 },
  { name: '金华', lat: 29.0784, lng: 119.6474 },
  { name: '台州', lat: 28.6562, lng: 121.4209 },
  { name: '芜湖', lat: 31.3345, lng: 118.4326 },
  { name: '泉州', lat: 24.8741, lng: 118.6757 },
  { name: '九江', lat: 29.7050, lng: 116.0019 },
  { name: '赣州', lat: 25.8294, lng: 114.9350 },
  { name: '淄博', lat: 36.8131, lng: 118.0548 },
  { name: '泰安', lat: 36.2000, lng: 117.0880 },
  { name: '济宁', lat: 35.4145, lng: 116.5873 },
  { name: '德州', lat: 37.4341, lng: 116.3575 },
  { name: '滨州', lat: 37.3827, lng: 117.9707 },
  { name: '聊城', lat: 36.4558, lng: 115.9855 },
  { name: '菏泽', lat: 35.2326, lng: 115.4811 },
  { name: '日照', lat: 35.4164, lng: 119.5269 },
  { name: '莱芜', lat: 36.2144, lng: 117.6776 },
  { name: '南阳', lat: 32.9906, lng: 112.5283 },
  { name: '开封', lat: 34.7972, lng: 114.3080 },
  { name: '平顶山', lat: 33.7662, lng: 113.1925 },
  { name: '安阳', lat: 36.0997, lng: 114.3926 },
  { name: '新乡', lat: 35.3030, lng: 113.9268 },
  { name: '许昌', lat: 34.0357, lng: 113.8523 },
  { name: '焦作', lat: 35.2159, lng: 113.2418 },
  { name: '商丘', lat: 34.4147, lng: 115.6562 },
  { name: '信阳', lat: 32.1264, lng: 114.0913 },
  { name: '周口', lat: 33.6259, lng: 114.6498 },
  { name: '驻马店', lat: 32.9802, lng: 114.0248 },
  { name: '黄石', lat: 30.1991, lng: 115.0385 },
  { name: '十堰', lat: 32.6292, lng: 110.7980 },
  { name: '宜昌', lat: 30.6918, lng: 111.2864 },
  { name: '襄阳', lat: 32.0091, lng: 112.1228 },
  { name: '荆门', lat: 31.0354, lng: 112.2046 },
  { name: '孝感', lat: 30.9244, lng: 113.9268 },
  { name: '荆州', lat: 30.3263, lng: 112.2390 },
  { name: '黄冈', lat: 30.4539, lng: 114.8724 },
  { name: '咸宁', lat: 29.8413, lng: 114.3224 },
  { name: '随州', lat: 31.6901, lng: 113.3826 },
  { name: '株洲', lat: 27.8274, lng: 113.1339 },
  { name: '湘潭', lat: 27.8297, lng: 112.9442 },
  { name: '衡阳', lat: 26.8935, lng: 112.5718 },
  { name: '岳阳', lat: 29.3563, lng: 113.1284 },
  { name: '常德', lat: 29.0316, lng: 111.6986 },
  { name: '张家界', lat: 29.1170, lng: 110.4793 },
  { name: '益阳', lat: 28.5530, lng: 112.3553 },
  { name: '郴州', lat: 25.7706, lng: 113.0147 },
  { name: '永州', lat: 26.4325, lng: 111.6133 },
  { name: '怀化', lat: 27.5492, lng: 110.0017 },
  { name: '韶关', lat: 24.8107, lng: 113.5975 },
  { name: '湛江', lat: 21.2706, lng: 110.3594 },
  { name: '肇庆', lat: 23.0472, lng: 112.4658 },
  { name: '江门', lat: 22.5787, lng: 113.0823 },
  { name: '茂名', lat: 21.6630, lng: 110.9254 },
  { name: '惠州', lat: 23.1116, lng: 114.4162 },
  { name: '梅州', lat: 24.2884, lng: 116.1175 },
  { name: '汕尾', lat: 22.7787, lng: 115.3759 },
  { name: '河源', lat: 23.7432, lng: 114.6978 },
  { name: '清远', lat: 23.6817, lng: 113.0560 },
  { name: '潮州', lat: 23.6568, lng: 116.6226 },
  { name: '揭阳', lat: 23.5497, lng: 116.3729 },
  { name: '云浮', lat: 22.9151, lng: 112.0444 },
  { name: '北海', lat: 21.4812, lng: 109.1198 },
  { name: '柳州', lat: 24.3264, lng: 109.4156 },
  { name: '防城港', lat: 21.6146, lng: 108.3545 },
  { name: '钦州', lat: 21.9513, lng: 108.6242 },
  { name: '贵港', lat: 23.1114, lng: 109.5984 },
  { name: '玉林', lat: 22.6540, lng: 110.1546 },
  { name: '百色', lat: 23.9025, lng: 106.6182 },
  { name: '贺州', lat: 24.4033, lng: 111.5527 },
  { name: '河池', lat: 24.6926, lng: 108.0853 },
  { name: '来宾', lat: 23.7335, lng: 109.2214 },
  { name: '崇左', lat: 22.3770, lng: 107.3537 },
  { name: '三亚', lat: 18.2528, lng: 109.5119 },
  { name: '儋州', lat: 19.5211, lng: 109.5769 },
  { name: '丽江', lat: 26.8721, lng: 100.2272 },
  { name: '大理', lat: 25.6065, lng: 100.2679 },
  { name: '西昌', lat: 27.8945, lng: 102.2645 },
  { name: '乐山', lat: 29.5522, lng: 103.7660 },
  { name: '宜宾', lat: 28.7513, lng: 104.6234 },
  { name: '南充', lat: 30.8373, lng: 106.1107 },
  { name: '达州', lat: 31.2090, lng: 107.4682 },
  { name: '雅安', lat: 29.9805, lng: 103.0010 },
  { name: '阿坝', lat: 31.8990, lng: 102.2214 },
  { name: '甘孜', lat: 30.0486, lng: 101.9625 },
  { name: '酒泉', lat: 39.7321, lng: 98.4941 },
  { name: '张掖', lat: 38.9262, lng: 100.4495 },
  { name: '天水', lat: 34.5810, lng: 105.7249 },
  { name: '宝鸡', lat: 34.3736, lng: 107.2384 },
  { name: '汉中', lat: 33.0674, lng: 107.0238 },
  { name: '延安', lat: 36.5853, lng: 109.4898 },
  { name: '咸阳', lat: 34.3296, lng: 108.7089 },
  { name: '中卫', lat: 37.5149, lng: 105.1966 },
  { name: '喀什', lat: 39.4704, lng: 75.9898 },
  { name: '伊犁', lat: 43.9191, lng: 81.3243 },
  { name: '阿勒泰', lat: 47.8484, lng: 88.1396 },
  { name: '吐鲁番', lat: 42.9513, lng: 89.1895 },
  { name: '林芝', lat: 29.6485, lng: 94.3624 },
  { name: '海西', lat: 37.3737, lng: 97.3708 },
];

function getNearestCity(lat, lng) {
  let nearest = null;
  let minDist = Infinity;
  for (const city of MAJOR_CITIES) {
    const d = distance(lat, lng, city.lat, city.lng);
    if (d < minDist) {
      minDist = d;
      nearest = city;
    }
  }
  return nearest ? nearest.name : '当前位置';
}

module.exports = {
  todayStr,
  yesterdayStr,
  distance,
  radiusBBox,
  initUser,
  saveUser,
  getUserState,
  isLoggedIn,
  wxLogin,
  updatePoints,
  doCheckin,
  calcJoinDays,
  showToast,
  showLoading,
  hideLoading,
  getWeekCalendar,
  getPointsHistory,
  getNearestCity
};
