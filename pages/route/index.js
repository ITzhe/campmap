// pages/route/index.js — 线路规划页逻辑
const config = require('../../utils/config');
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    routeStart: '',
    routeEnd: '',
    startCoord: null,   // {lat, lng, name}
    endCoord: null,     // {lat, lng, name}
    showResult: false,
    routeDist: 0,
    routeCamps: 0,
    routeTime: '',
    routeCampList: [],

    // 地图
    latitude: 36.0671,
    longitude: 120.3826,
    scale: 5,
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

  // ============ 选择起点 (使用地图选点) ============
  chooseStart() {
    const cur = this.data.startCoord || {
      lat: this.data.latitude,
      lng: this.data.longitude
    };
    wx.chooseLocation({
      latitude: cur.lat,
      longitude: cur.lng,
      success: (res) => {
        this.setData({
          routeStart: res.name || res.address,
          startCoord: { lat: res.latitude, lng: res.longitude, name: res.name || res.address }
        });
      },
      fail: () => {}
    });
  },

  // ============ 选择终点 (使用地图选点) ============
  chooseEnd() {
    const cur = this.data.endCoord || this.data.startCoord || {
      lat: this.data.latitude,
      lng: this.data.longitude
    };
    wx.chooseLocation({
      latitude: cur.lat,
      longitude: cur.lng,
      success: (res) => {
        this.setData({
          routeEnd: res.name || res.address,
          endCoord: { lat: res.latitude, lng: res.longitude, name: res.name || res.address }
        });
      },
      fail: () => {}
    });
  },

  // ============ 手动输入回退 ============
  onStartInput(e) {
    this.setData({ routeStart: e.detail.value, startCoord: null });
  },

  onEndInput(e) {
    this.setData({ routeEnd: e.detail.value, endCoord: null });
  },

  addWaypoint() {
    util.showToast('途经点功能开发中');
  },

  // ============ 规划路线 ============
  calcRoute() {
    const startName = (this.data.routeStart || '').trim();
    const endName = (this.data.routeEnd || '').trim();
    if (!startName) { util.showToast('请选择起点'); return; }
    if (!endName) { util.showToast('请选择终点'); return; }

    // 必须有坐标（通过 chooseLocation 选择）
    let s = this.data.startCoord;
    let e = this.data.endCoord;

    // 如果没有坐标，提示用户通过地图选点
    if (!s) {
      util.showToast('请点击起点输入框选择位置');
      return;
    }
    if (!e) {
      util.showToast('请点击终点输入框选择位置');
      return;
    }

    // 里程 (直线距离 × 1.3 道路系数)
    const straight = util.distance(s.lat, s.lng, e.lat, e.lng);
    const dist = Math.round(straight * 1.3 * 10) / 10;

    // 预计时长 (按 80km/h 均速)
    const minutes = Math.max(1, Math.round(dist / 80 * 60));
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const timeStr = hh > 0 ? `${hh}小时${mm}分` : `${mm}分钟`;

    // 沿途营地
    const campList = this.findCampsAlong(s.lat, s.lng, e.lat, e.lng);

    // 路径点（根据距离自动增加采样点）
    const stepCount = Math.max(8, Math.min(50, Math.round(dist / 20)));
    const points = this.genRoutePoints(s.lat, s.lng, e.lat, e.lng, stepCount);

    // 起点 / 终点标记
    const markers = [
      {
        id: 0,
        latitude: s.lat,
        longitude: s.lng,
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
    // 根据距离自适应缩放级别
    let scale;
    if (dist > 800) scale = 5;
    else if (dist > 400) scale = 6;
    else if (dist > 200) scale = 7;
    else if (dist > 100) scale = 8;
    else if (dist > 50) scale = 9;
    else if (dist > 20) scale = 10;
    else scale = 11;

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
  genRoutePoints(lat1, lng1, lat2, lng2, steps) {
    steps = steps || 8;
    const pts = [];
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
    // 走廊宽度根据距离自适应：长途路线宽一点，短途窄一点
    const straight = util.distance(lat1, lng1, lat2, lng2);
    const corridor = Math.max(8, Math.min(30, straight / 20));

    const list = this.data.allCamps.map(c => {
      const offset = this.distToSegment(c.latitude, c.longitude, lat1, lng1, lat2, lng2);
      const distFromStart = util.distance(c.latitude, c.longitude, lat1, lng1);
      return { camp: c, offset, distFromStart };
    }).filter(o => o.offset <= corridor);

    list.sort((a, b) => a.distFromStart - b.distFromStart);

    return list.map(o => {
      const c = o.camp;
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
      util.showToast('请重新选择起终点位置');
    }
  },

  // ============ 交换起终点 ============
  swapRoute() {
    this.setData({
      routeStart: this.data.routeEnd,
      routeEnd: this.data.routeStart,
      startCoord: this.data.endCoord,
      endCoord: this.data.startCoord
    });
  }
});
