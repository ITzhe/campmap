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
    routePlanning: false,

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

    // 恢复待定路线 (从收藏页跳来)
    if (app.globalData.pendingRoute) {
      const pr = app.globalData.pendingRoute;
      app.globalData.pendingRoute = null;
      this.setData({
        routeStart: pr.startName,
        routeEnd: pr.endName,
        startCoord: pr.startCoord,
        endCoord: pr.endCoord
      });
      setTimeout(() => this.calcRoute(), 500);
    }
  },

  // ============ 加载营地数据 (全国范围,用于线路沿途搜索) ============
  async loadCamps() {
    try {
      const camps = await api.fetchCampsites({ fee: 'all' }, null, 10000);
      this.setData({ allCamps: camps || [] });
    } catch (e) {
      this.setData({ allCamps: [] });
    }
  },

  // ============ 选择起点 ============
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

  // ============ 选择终点 ============
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

  addWaypoint() {
    util.showToast('途经点功能开发中');
  },

  // ============ 调用腾讯地图驾车路线 API ============
  fetchDrivingRoute(fromLat, fromLng, toLat, toLng) {
    const key = config.MAP_KEY || '';
    return new Promise((resolve) => {
      if (!key) {
        console.error('[Route] MAP_KEY 未配置');
        resolve({ success: false, error: '地图 Key 未配置' });
        return;
      }
      console.log('[Route] 请求驾车路线 API, from:', fromLat + ',' + fromLng, 'to:', toLat + ',' + toLng);
      wx.request({
        url: 'https://apis.map.qq.com/ws/direction/v1/driving/',
        data: {
          from: `${fromLat},${fromLng}`,
          to: `${toLat},${toLng}`,
          key: key
        },
        method: 'GET',
        success: (res) => {
          console.log('[Route] API 响应状态码:', res.statusCode);
          console.log('[Route] API 响应数据:', JSON.stringify(res.data).slice(0, 500));

          if (!res.data) {
            resolve({ success: false, error: 'API 返回空数据' });
            return;
          }

          // 兼容 status 为数字 0 或字符串 "0"
          const status = res.data.status;
          if (status !== 0 && status !== '0') {
            const msg = res.data.message || ('状态码: ' + status);
            console.error('[Route] API 返回错误:', msg);
            resolve({ success: false, error: msg });
            return;
          }

          const routes = res.data.result && res.data.result.routes;
          if (routes && routes.length > 0) {
            resolve({ success: true, route: routes[0] });
          } else {
            resolve({ success: false, error: '未找到可用路线' });
          }
        },
        fail: (err) => {
          console.error('[Route] API 请求失败:', err);
          resolve({ success: false, error: '网络请求失败: ' + (err.errMsg || '未知错误') });
        }
      });
    });
  },

  // ============ 解码腾讯地图 polyline ============
  // 腾讯地图 polyline 格式: [lat1, lng1, dlat2, dlng2, ...]
  // 第一个点为绝对坐标, 后续为前一个点的偏移量
  decodePolyline(polyline) {
    if (!polyline || polyline.length < 2) return [];
    const points = [];
    let prevLat = 0;
    let prevLng = 0;
    for (let i = 0; i < polyline.length; i += 2) {
      if (i === 0) {
        prevLat = polyline[i];
        prevLng = polyline[i + 1];
      } else {
        prevLat += polyline[i] / 1000000;
        prevLng += polyline[i + 1] / 1000000;
      }
      points.push({
        latitude: prevLat,
        longitude: prevLng
      });
    }
    return points;
  },

  // ============ 规划路线 ============
  async calcRoute() {
    const startName = (this.data.routeStart || '').trim();
    const endName = (this.data.routeEnd || '').trim();
    if (!startName) { util.showToast('请选择起点'); return; }
    if (!endName) { util.showToast('请选择终点'); return; }

    let s = this.data.startCoord;
    let e = this.data.endCoord;

    if (!s) { util.showToast('请点击起点输入框选择位置'); return; }
    if (!e) { util.showToast('请点击终点输入框选择位置'); return; }

    this.setData({ routePlanning: true });
    util.showLoading('规划路线中...');

    // 尝试调用腾讯地图驾车路线 API
    const routeResult = await this.fetchDrivingRoute(s.lat, s.lng, e.lat, e.lng);

    let routePoints = [];
    let dist = 0;
    let duration = 0;
    let usedRealRoute = false;
    let apiError = '';

    if (routeResult && routeResult.success && routeResult.route && routeResult.route.polyline) {
      // API 成功: 使用真实驾车路线
      routePoints = this.decodePolyline(routeResult.route.polyline);
      dist = Math.round((routeResult.route.distance / 1000) * 10) / 10; // m -> km
      duration = routeResult.route.duration; // seconds
      usedRealRoute = true;
    } else {
      // 降级: 使用直线 + 多采样点
      apiError = (routeResult && routeResult.error) || '未知原因';
      console.warn('[Route] 腾讯地图 API 不可用，降级为直线:', apiError);
      const straight = util.distance(s.lat, s.lng, e.lat, e.lng);
      dist = Math.round(straight * 1.3 * 10) / 10;
      duration = dist / 80 * 3600; // 80km/h
      const stepCount = Math.max(8, Math.min(50, Math.round(dist / 20)));
      routePoints = this.genRoutePoints(s.lat, s.lng, e.lat, e.lng, stepCount);
    }

    // 预计时长
    const minutes = Math.max(1, Math.round(duration / 60));
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const timeStr = hh > 0 ? `${hh}小时${mm}分` : `${mm}分钟`;

    // 沿途营地 (使用真实路线点搜索)
    const campList = this.findCampsAlongRoute(routePoints);

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
      points: routePoints,
      color: '#2d6a4f',
      width: 6,
      arrowLine: true,
      dottedLine: false
    }];

    // 地图中心 = 中点，缩放随距离调整
    const midLat = (s.lat + e.lat) / 2;
    const midLng = (s.lng + e.lng) / 2;
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
      scale,
      routePlanning: false
    });

    util.hideLoading();
    if (usedRealRoute) {
      util.showToast(`已规划驾车路线，沿途${campList.length}个营地`);
    } else {
      util.showToast(`路线API异常(${apiError})，显示直线`);
    }
  },

  // ============ 生成直线采样点 (降级用) ============
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

  // ============ 查找沿途营地 (基于真实路线折线) ============
  findCampsAlongRoute(routePoints) {
    if (!routePoints || routePoints.length < 2) return [];

    // 走廊宽度根据路线总长度自适应
    const startPt = routePoints[0];
    const endPt = routePoints[routePoints.length - 1];
    const straight = util.distance(startPt.latitude, startPt.longitude, endPt.latitude, endPt.longitude);
    const corridor = Math.max(15, Math.min(60, straight / 10));

    const list = this.data.allCamps.map(c => {
      // 计算到路线每一段的最小距离
      let minOffset = Infinity;

      for (let i = 0; i < routePoints.length - 1; i++) {
        const offset = this.distToSegment(
          c.latitude, c.longitude,
          routePoints[i].latitude, routePoints[i].longitude,
          routePoints[i + 1].latitude, routePoints[i + 1].longitude
        );
        if (offset < minOffset) {
          minOffset = offset;
        }
      }

      const distFromStart = util.distance(c.latitude, c.longitude, startPt.latitude, startPt.longitude);
      return { camp: c, offset: minOffset, distFromStart };
    }).filter(o => o.offset <= corridor);

    list.sort((a, b) => a.distFromStart - b.distFromStart);

    return list.map(o => {
      const c = o.camp;
      const result = {};
      for (const k in c) { result[k] = c[k]; }
      result.distance = Math.round(o.distFromStart * 10) / 10;
      result.offset = Math.round(o.offset * 10) / 10;
      return result;
    });
  },

  // ============ 营地点击 ============
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
