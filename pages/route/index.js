// pages/route/index.js — 线路规划页逻辑
const config = require('../../utils/config');
const api = require('../../utils/api');
const util = require('../../utils/util');

// 常用 POI 坐标 (青岛)
const POIS = {
  '青岛火车站': { lat: 36.0648, lng: 120.3199 },
  '崂山风景区': { lat: 36.1571, lng: 120.6240 },
  '黄岛金沙滩': { lat: 35.9647, lng: 120.1669 },
  '胶东国际机场': { lat: 36.3671, lng: 120.3730 },
  '五四广场': { lat: 36.0661, lng: 120.3858 },
  '栈桥': { lat: 36.0591, lng: 120.3176 },
  '即墨鳌山湾': { lat: 36.3814, lng: 120.7122 },
  '北九水': { lat: 36.2330, lng: 120.5910 }
};

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    routeStart: '青岛火车站',
    routeEnd: '崂山风景区',
    showResult: false,
    routeDist: 0,
    routeCamps: 0,
    routeTime: '',
    routeCampList: [],

    // 地图
    latitude: 36.0671,
    longitude: 120.3826,
    scale: 11,
    markers: [],
    polyline: [],

    // 营地缓存
    allCamps: [],

    // 最近路线
    historyList: [
      { name: '青岛火车站 → 崂山风景区', meta: '32.6 km · 沿途3个营地 · 今天 09:12' },
      { name: '五四广场 → 黄岛金沙滩', meta: '21.4 km · 沿途2个营地 · 昨天 18:30' }
    ]
  },

  onLoad() {
    const sys = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()) || {};
    const statusBarHeight = sys.statusBarHeight || 20;
    this.setData({ statusBarHeight, navHeight: statusBarHeight + 44 });

    const app = getApp();
    this.setData({
      latitude: app.globalData.cityCenter.latitude,
      longitude: app.globalData.cityCenter.longitude
    });
    this.loadCamps();
  },

  // ============ 加载营地数据 (全国范围,用于线路沿途搜索) ============
  async loadCamps() {
    try {
      // 线路规划需要全国数据,不传 bounds
      const camps = await api.fetchCampsites({ fee: 'all' }, null);
      this.setData({ allCamps: camps || [] });
    } catch (e) {
      this.setData({ allCamps: [] });
    }
  },

  // ============ 输入 ============
  onStartInput(e) {
    this.setData({ routeStart: e.detail.value });
  },

  onEndInput(e) {
    this.setData({ routeEnd: e.detail.value });
  },

  addWaypoint() {
    util.showToast('途经点功能开发中');
  },

  // ============ 地理编码 (POI 匹配) ============
  geoCode(name) {
    const key = (name || '').trim();
    if (!key) return null;
    if (POIS[key]) return POIS[key];
    for (const k in POIS) {
      if (k.indexOf(key) >= 0 || key.indexOf(k) >= 0) return POIS[k];
    }
    return null;
  },

  // ============ 规划路线 ============
  calcRoute() {
    const startName = (this.data.routeStart || '').trim();
    const endName = (this.data.routeEnd || '').trim();
    if (!startName) { util.showToast('请输入起点'); return; }
    if (!endName) { util.showToast('请输入终点'); return; }

    // 解析坐标 (未识别时使用默认城市中心偏移)
    const s = this.geoCode(startName) || { lat: 36.0671, lng: 120.3826 };
    const e = this.geoCode(endName) || { lat: 36.1571, lng: 120.6240 };

    // 里程 (直线距离 × 1.3 道路系数)
    const straight = util.distance(s.lat, s.lng, e.lat, e.lng);
    const dist = Math.round(straight * 1.3 * 10) / 10;

    // 预计时长 (按 60km/h 均速)
    const minutes = Math.max(1, Math.round(dist / 60 * 60));
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const timeStr = hh > 0 ? `${hh}小时${mm}分` : `${mm}分钟`;

    // 沿途营地
    const campList = this.findCampsAlong(s.lat, s.lng, e.lat, e.lng);

    // 路径点
    const points = this.genRoutePoints(s.lat, s.lng, e.lat, e.lng);

    // 起点 / 终点标记
    const markers = [
      {
        id: 0,
        latitude: s.lat,
        longitude: s.lng,
        iconPath: '/assets/markers/location.png',
        width: 30,
        height: 30,
        callout: {
          content: '起点',
          color: '#ffffff',
          fontSize: 12,
          bgColor: '#2d6a4f',
          borderRadius: 8,
          borderWidth: 0,
          padding: 6,
          display: 'ALWAYS',
          textAlign: 'center'
        }
      },
      {
        id: 1,
        latitude: e.lat,
        longitude: e.lng,
        iconPath: '/assets/markers/location.png',
        width: 30,
        height: 30,
        callout: {
          content: '终点',
          color: '#ffffff',
          fontSize: 12,
          bgColor: '#ee6c4d',
          borderRadius: 8,
          borderWidth: 0,
          padding: 6,
          display: 'ALWAYS',
          textAlign: 'center'
        }
      }
    ];

    // 沿途营地标记
    campList.forEach((c, i) => {
      markers.push({
        id: i + 2,
        latitude: c.latitude,
        longitude: c.longitude,
        iconPath: '/assets/markers/free.png',
        width: 24,
        height: 28,
        callout: {
          content: c.name,
          color: '#1a2e1f',
          fontSize: 11,
          bgColor: '#ffffff',
          borderRadius: 8,
          borderWidth: 1,
          borderColor: '#dde6e0',
          padding: 5,
          display: 'BYCLICK',
          textAlign: 'center'
        }
      });
    });

    const polyline = [{
      points: points,
      color: '#2d6a4f',
      width: 6,
      arrowLine: true,
      dottedLine: false
    }];

    // 地图中心 = 中点，缩放随距离调整
    const midLat = (s.lat + e.lat) / 2;
    const midLng = (s.lng + e.lng) / 2;
    const scale = dist > 40 ? 9 : (dist > 20 ? 10 : 11);

    this.setData({
      showResult: true,
      routeDist: dist,
      routeCamps: campList.length,
      routeTime: timeStr,
      routeCampList: campList,
      markers,
      polyline,
      latitude: midLat,
      longitude: midLng,
      scale
    });

    util.showToast(`已规划路线，沿途${campList.length}个营地`);
  },

  // ============ 生成路径点 ============
  genRoutePoints(lat1, lng1, lat2, lng2) {
    const pts = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      pts.push({
        latitude: lat1 + (lat2 - lat1) * t,
        longitude: lng1 + (lng2 - lng1) * t
      });
    }
    return pts;
  },

  // ============ 点到线段距离 (km) ============
  distToSegment(plat, plng, lat1, lng1, lat2, lng2) {
    const lat0 = (lat1 + lat2) / 2;
    const toXY = (lat, lng) => ({
      x: lng * Math.cos(lat0 * Math.PI / 180) * 111.32,
      y: lat * 110.57
    });
    const p = toXY(plat, plng);
    const a = toXY(lat1, lng1);
    const b = toXY(lat2, lng2);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let t = 0;
    if (lenSq > 0) {
      t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    const ddx = p.x - projX;
    const ddy = p.y - projY;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  },

  // ============ 查找沿途营地 ============
  findCampsAlong(lat1, lng1, lat2, lng2) {
    const corridor = 8; // 8km 走廊宽度
    const list = this.data.allCamps.map(c => {
      const offset = this.distToSegment(c.latitude, c.longitude, lat1, lng1, lat2, lng2);
      const distFromStart = util.distance(c.latitude, c.longitude, lat1, lng1);
      return { camp: c, offset, distFromStart };
    }).filter(o => o.offset <= corridor);

    list.sort((a, b) => a.distFromStart - b.distFromStart);

    return list.map(o => {
      const c = o.camp;
      // 保留完整营地数据 + 距离信息
      const result = {};
      for (const k in c) { result[k] = c[k]; }
      result.distance = Math.round(o.distFromStart * 10) / 10;
      return result;
    });
  },

  // ============ 营地点击：切换到地图页并展示底部卡片 ============
  onCampTap(e) {
    const idx = e.currentTarget.dataset.idx;
    const camp = this.data.routeCampList[idx];
    if (!camp) return;
    // 写入全局选中营地，供地图页展示底部卡片
    const app = getApp();
    app.globalData.selectedCamp = camp;
    app.globalData.pendingCampFocus = true;
    wx.switchTab({ url: '/pages/map/index' });
  },

  // ============ 历史路线点击 ============
  onHistoryTap(e) {
    const idx = e.currentTarget.dataset.idx;
    const item = this.data.historyList[idx];
    if (!item || !item.name) return;
    const parts = item.name.split('→').map(s => s.trim());
    if (parts.length === 2) {
      this.setData({ routeStart: parts[0], routeEnd: parts[1] });
      this.calcRoute();
    }
  }
});
