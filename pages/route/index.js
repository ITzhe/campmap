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
    waypoints: [],      // [{id, name, lat, lng}]
    showResult: false,
    routeDist: 0,
    routeCamps: 0,
    routeTime: '',
    routeCampList: [],
    routePlanning: false,
    showCancelBtn: false,

    // 地图
    latitude: 36.0671,
    longitude: 120.3826,
    scale: 5,
    markers: [],
    polyline: [],

    // 营地缓存
    allCamps: []
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
    // 不再预加载全国营地, 改为规划路线时按路线范围加载

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

  onShow() {
    // 切页返回后恢复地图标记和路线 (先清空再恢复, 强制地图组件重新渲染)
    if (this.data.showResult && this.data.polyline.length > 0) {
      const savedMarkers = this.data.markers;
      const savedPolyline = this.data.polyline;
      const savedLat = this.data.latitude;
      const savedLng = this.data.longitude;
      const savedScale = this.data.scale;
      this.setData({ markers: [], polyline: [] });
      setTimeout(() => {
        this.setData({
          markers: savedMarkers,
          polyline: savedPolyline,
          latitude: savedLat,
          longitude: savedLng,
          scale: savedScale
        });
      }, 150);
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

  // ============ 添加途经点 ============
  addWaypoint() {
    if (this.data.waypoints.length >= 5) {
      util.showToast('最多添加5个途经点');
      return;
    }
    // 弹出位置选择
    const cur = this.data.startCoord || this.data.endCoord || {
      lat: this.data.latitude,
      lng: this.data.longitude
    };
    wx.chooseLocation({
      latitude: cur.lat,
      longitude: cur.lng,
      success: (res) => {
        const wp = {
          id: 'wp_' + Date.now(),
          name: res.name || res.address,
          lat: res.latitude,
          lng: res.longitude
        };
        const waypoints = this.data.waypoints.concat([wp]);
        this.setData({ waypoints });
      },
      fail: () => {}
    });
  },

  // ============ 重新选择途经点 ============
  chooseWaypoint(e) {
    const idx = e.currentTarget.dataset.idx;
    const cur = this.data.waypoints[idx] || this.data.startCoord || {
      lat: this.data.latitude,
      lng: this.data.longitude
    };
    wx.chooseLocation({
      latitude: cur.lat,
      longitude: cur.lng,
      success: (res) => {
        const waypoints = this.data.waypoints.slice();
        waypoints[idx] = {
          id: waypoints[idx].id,
          name: res.name || res.address,
          lat: res.latitude,
          lng: res.longitude
        };
        this.setData({ waypoints });
      },
      fail: () => {}
    });
  },

  // ============ 删除途经点 ============
  removeWaypoint(e) {
    const idx = e.currentTarget.dataset.idx;
    const waypoints = this.data.waypoints.slice();
    waypoints.splice(idx, 1);
    this.setData({ waypoints });
  },

  // ============ 调用腾讯地图驾车路线 API ============
  fetchDrivingRoute(fromLat, fromLng, toLat, toLng) {
    const key = config.MAP_KEY || '';
    return new Promise((resolve) => {
      if (!key) {
        console.error('[Route] MAP_KEY 未配置');
        resolve({ success: false, error: '地图 Key 未配置，请在 config.js 中设置 MAP_KEY' });
        return;
      }
      console.log('[Route] 请求驾车路线 API, from:', fromLat + ',' + fromLng, 'to:', toLat + ',' + toLng);
      wx.request({
        url: 'https://apis.map.qq.com/ws/direction/v1/driving/',
        data: {
          from: fromLat + ',' + fromLng,
          to: toLat + ',' + toLng,
          key: key
        },
        method: 'GET',
        timeout: 8000,
        success: (res) => {
          console.log('[Route] API 响应状态码:', res.statusCode);
          console.log('[Route] API 响应数据:', JSON.stringify(res.data).slice(0, 500));

          if (res.statusCode !== 200) {
            resolve({ success: false, error: 'HTTP ' + res.statusCode + ': 服务器错误' });
            return;
          }

          if (!res.data) {
            resolve({ success: false, error: 'API 返回空数据' });
            return;
          }

          // 兼容 status 为数字 0 或字符串 "0"
          const status = res.data.status;
          if (status !== 0 && status !== '0') {
            const msg = res.data.message || ('状态码: ' + status);
            console.error('[Route] API 返回错误:', msg);
            // 常见错误提示
            let userTip = msg;
            if (status === 120 || status === '120') {
              userTip = 'API Key 未开通路径规划服务，请在腾讯地图控制台启用';
            } else if (status === 311 || status === '311') {
              userTip = '请求频率超限，请稍后重试';
            } else if (status === 310 || status === '310') {
              userTip = 'API Key 无效或被禁用';
            }
            resolve({ success: false, error: userTip, apiError: true });
            return;
          }

          const routes = res.data.result && res.data.result.routes;
          if (routes && routes.length > 0 && routes[0].polyline) {
            resolve({ success: true, route: routes[0] });
          } else {
            resolve({ success: false, error: '未找到可用路线，可能是起终点距离过近或道路不通' });
          }
        },
        fail: (err) => {
          console.error('[Route] API 请求失败:', err);
          let errMsg = '网络请求失败';
          if (err.errMsg && err.errMsg.indexOf('not in domain list') > -1) {
            errMsg = '域名未配置: 请在小程序后台添加 apis.map.qq.com 为合法域名';
          } else if (err.errMsg) {
            errMsg = '网络错误: ' + err.errMsg;
          }
          resolve({ success: false, error: errMsg, apiError: true });
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

  // ============ 规划路线 (支持途经点) ============
  async calcRoute() {
    const startName = (this.data.routeStart || '').trim();
    const endName = (this.data.routeEnd || '').trim();
    if (!startName) { util.showToast('请选择起点'); return; }
    if (!endName) { util.showToast('请选择终点'); return; }

    let s = this.data.startCoord;
    let e = this.data.endCoord;

    if (!s) { util.showToast('请点击起点输入框选择位置'); return; }
    if (!e) { util.showToast('请点击终点输入框选择位置'); return; }

    const waypoints = this.data.waypoints || [];

    this.setData({ routePlanning: true, showCancelBtn: true });
    util.showLoading('规划路线中...');

    // 构建路径点序列: 起点 → 途经点1 → ... → 途经点N → 终点
    const allPoints = [s];
    for (const wp of waypoints) {
      if (wp.lat && wp.lng) {
        allPoints.push({ lat: wp.lat, lng: wp.lng, name: wp.name });
      }
    }
    allPoints.push(e);

    // 分段请求路线 (每两相邻点之间请求一次)
    let allRoutePoints = [];
    let totalDist = 0;
    let totalDuration = 0;
    let allUsedReal = true;
    let apiErrors = [];

    this._cancelled = false;

    for (let i = 0; i < allPoints.length - 1; i++) {
      if (this._cancelled) {
        util.hideLoading();
        this.setData({ routePlanning: false, showCancelBtn: false });
        return;
      }
      const from = allPoints[i];
      const to = allPoints[i + 1];
      const segResult = await this.fetchDrivingRoute(from.lat, from.lng, to.lat, to.lng);

      if (segResult && segResult.success && segResult.route && segResult.route.polyline) {
        const segPoints = this.decodePolyline(segResult.route.polyline);
        // 避免重复点: 第一段加入所有点, 后续段跳过第一个点(与上段终点重合)
        if (i === 0) {
          allRoutePoints = allRoutePoints.concat(segPoints);
        } else {
          allRoutePoints = allRoutePoints.concat(segPoints.slice(1));
        }
        totalDist += segResult.route.distance;
        totalDuration += segResult.route.duration;
      } else {
        // 降级: 直线
        allUsedReal = false;
        const err = (segResult && segResult.error) || '未知';
        apiErrors.push(err);
        console.warn('[Route] 分段' + (i + 1) + '降级为直线:', err);
        const straight = util.distance(from.lat, from.lng, to.lat, to.lng);
        totalDist += straight * 1.3 * 1000; // m
        totalDuration += straight * 1.3 / 80 * 60; // 分钟 (80km/h -> 分钟)
        const stepCount = Math.max(8, Math.min(30, Math.round(straight / 20)));
        const segPoints = this.genRoutePoints(from.lat, from.lng, to.lat, to.lng, stepCount);
        if (i === 0) {
          allRoutePoints = allRoutePoints.concat(segPoints);
        } else {
          allRoutePoints = allRoutePoints.concat(segPoints.slice(1));
        }
      }
    }

    if (this._cancelled) {
      util.hideLoading();
      this.setData({ routePlanning: false, showCancelBtn: false });
      return;
    }

    const dist = Math.round((totalDist / 1000) * 10) / 10; // m -> km
    const duration = totalDuration;

    // 预计时长 (腾讯地图 API 返回的 duration 单位为分钟)
    const minutes = Math.max(1, Math.round(duration));
    const hh = Math.floor(minutes / 60);
    const mm = minutes % 60;
    const timeStr = hh > 0 ? (hh + '小时' + mm + '分') : (mm + '分钟');

    // 按路线范围加载营地 (不再预加载全国数据)
    // 改为后台异步加载, 不阻塞路线结果显示
    const routeBounds = this._getRouteBounds(allRoutePoints, 0.05); // 0.05度≈5km padding

    if (this._cancelled) {
      util.hideLoading();
      this.setData({ routePlanning: false, showCancelBtn: false });
      return;
    }

    // 沿途营地: 先用已有数据 (可能为空), 后台加载后再更新
    const dbCamps = this.findCampsAlongRoute(allRoutePoints);
    const campList = dbCamps;

    // 构建标记: 起点 + 途经点 + 终点 + 营地
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

    // 途经点标记
    waypoints.forEach((wp, i) => {
      markers.push({
        id: i + 100,
        latitude: wp.lat,
        longitude: wp.lng,
        width: 26,
        height: 26,
        callout: {
          content: '途经' + (i + 1),
          color: '#ffffff',
          fontSize: 11,
          bgColor: '#f4a261',
          borderRadius: 8,
          borderWidth: 0,
          padding: 5,
          display: 'ALWAYS',
          textAlign: 'center'
        }
      });
    });

    // 沿途营地标记
    campList.forEach((c, i) => {
      const isFree = c.parking_status == 0;
      let iconPath = '/assets/markers/free.png';
      if (!isFree) iconPath = '/assets/markers/paid.png';
      if (c.rv_friendly == 1) iconPath = '/assets/markers/rv.png';
      markers.push({
        id: i + 200,
        latitude: c.latitude,
        longitude: c.longitude,
        iconPath: iconPath,
        width: 28,
        height: 32,
        anchor: { x: 0.5, y: 1 }
      });
    });

    const polyline = [{
      points: allRoutePoints,
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
      routePlanning: false,
      showCancelBtn: false
    });

    util.hideLoading();
    if (allUsedReal) {
      util.showToast(`已规划驾车路线，沿途${campList.length}个营地`);
    } else {
      // 显示详细的错误信息
      const errMsg = apiErrors[0] || '未知错误';
      wx.showModal({
        title: '路线规划提醒',
        content: '部分路段无法获取真实路线，已用直线连接。\n\n错误原因: ' + errMsg + '\n\n请检查:\n1. 腾讯地图Key是否已开通"路径规划"服务\n2. 小程序后台是否已添加 apis.map.qq.com 为合法域名',
        showCancel: false,
        confirmText: '知道了',
        confirmColor: '#2d6a4f'
      });
    }

    // 后台异步加载路线范围内的营地, 加载完后更新营地列表
    this._loadRouteCampsAsync(routeBounds, allRoutePoints);
  },

  // ============ 后台异步加载路线范围内营地 ============
  async _loadRouteCampsAsync(routeBounds, allRoutePoints) {
    try {
      console.log('[Route] 后台加载路线范围内营地...');
      // 添加5秒超时, 防止无限等待
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('营地加载超时')), 5000);
      });
      const routeCamps = await Promise.race([
        api.fetchCampsites({ fee: 'all' }, routeBounds, 2000),
        timeoutPromise
      ]);
      this.data.allCamps = routeCamps || [];
      console.log('[Route] 路线范围内营地数:', this.data.allCamps.length);

      // 重新计算沿途营地
      const dbCamps = this.findCampsAlongRoute(allRoutePoints);

      // 重建标记 (保留起终点和途经点, 更新营地标记)
      const s = this.data.startCoord;
      const e = this.data.endCoord;
      const waypoints = this.data.waypoints || [];
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

      // 途经点标记
      waypoints.forEach((wp, i) => {
        markers.push({
          id: i + 100,
          latitude: wp.lat,
          longitude: wp.lng,
          width: 26,
          height: 26,
          callout: {
            content: '途经' + (i + 1),
            color: '#ffffff',
            fontSize: 11,
            bgColor: '#f4a261',
            borderRadius: 8,
            borderWidth: 0,
            padding: 5,
            display: 'ALWAYS',
            textAlign: 'center'
          }
        });
      });

      // 营地标记
      dbCamps.forEach((c, i) => {
        const isFree = c.parking_status == 0;
        let iconPath = '/assets/markers/free.png';
        if (!isFree) iconPath = '/assets/markers/paid.png';
        if (c.rv_friendly == 1) iconPath = '/assets/markers/rv.png';
        markers.push({
          id: i + 200,
          latitude: c.latitude,
          longitude: c.longitude,
          iconPath: iconPath,
          width: 28,
          height: 32,
          anchor: { x: 0.5, y: 1 }
        });
      });

      this.setData({
        routeCamps: dbCamps.length,
        routeCampList: dbCamps,
        markers
      });
      console.log('[Route] 营地加载完成, 沿途营地数:', dbCamps.length);
    } catch (err) {
      console.error('[Route] 后台加载营地失败:', err.message);
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

    // 走廊宽度固定3公里, 只显示路线附近3km内的营地
    const corridor = 3;

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

  // ============ 沿途POI搜索 (腾讯地图地点搜索) ============
  async searchPOIAlongRoute(routePoints) {
    if (!routePoints || routePoints.length < 2) return [];
    const key = config.MAP_KEY || '';
    if (!key) return [];

    // 沿路线每约50km采样一个搜索点 (更密集, 覆盖更多沿途营地)
    let accumulated = 0;
    const samplePoints = [routePoints[0]];
    for (let i = 1; i < routePoints.length; i++) {
      const d = util.distance(
        routePoints[i - 1].latitude, routePoints[i - 1].longitude,
        routePoints[i].latitude, routePoints[i].longitude
      );
      accumulated += d;
      if (accumulated >= 50) {
        samplePoints.push(routePoints[i]);
        accumulated = 0;
      }
    }
    // 确保终点也搜索
    const lastPt = routePoints[routePoints.length - 1];
    if (samplePoints[samplePoints.length - 1].latitude !== lastPt.latitude) {
      samplePoints.push(lastPt);
    }

    console.log('[Route] POI搜索采样点数:', samplePoints.length);
    // 使用更精确的关键词, 避免匹配到"教育基地""考研基地"等无关场所
    const keywords = ['露营地', '房车营地', '帐篷营地', '露营', '房车露营'];
    const allPOIs = [];
    const seen = new Set();

    // 限制并发为3, 避免触发API频率限制
    const tasks = [];
    for (const pt of samplePoints) {
      for (const kw of keywords) {
        // 每个关键词搜索2页, 获取更多结果
        for (let page = 1; page <= 2; page++) {
          tasks.push(this._fetchPOI(pt, kw, page, key));
        }
      }
    }

    console.log('[Route] POI搜索总请求数:', tasks.length, '(并发限制: 3)');
    const results = await this._runWithConcurrency(tasks, 3);

    for (const res of results) {
      if (res && res.data && res.data.status === 0 && res.data.data) {
        for (const poi of res.data.data) {
          const lat = poi.location ? poi.location.lat : 0;
          const lng = poi.location ? poi.location.lng : 0;
          if (!lat || !lng) continue;

          // 名称过滤: 必须包含露营相关词, 排除"教育基地""考研基地"等
          const name = poi.title || '';
          const campingTerms = ['露营', '房车', '帐篷', '野营', '露天生', 'caravan', 'camping', 'RV'];
          const hasCampingTerm = campingTerms.some(term => name.indexOf(term) > -1);
          if (!hasCampingTerm) continue;

          // 排除明确不是营地的场所
          const excludeTerms = ['教育', '培训', '考研', '帮教', '实习', '拓展', '书法', '实训', '种植', '养殖', '科研', '实验', '产业'];
          const hasExcludeTerm = excludeTerms.some(term => name.indexOf(term) > -1);
          if (hasExcludeTerm) continue;

          // 去重: 用坐标前4位作为key
          const dedupKey = lat.toFixed(4) + ',' + lng.toFixed(4);
          if (seen.has(dedupKey)) continue;
          seen.add(dedupKey);
          allPOIs.push({
            spot_code: 'POI_' + poi.id,
            name: poi.title,
            latitude: lat,
            longitude: lng,
            address: poi.address || '',
            parking_status: 0,
            toilet_status: 0,
            water_status: 0,
            power_status: 0,
            charging_status: 0,
            rv_friendly: 0,
            trailer_friendly: 0,
            tent_friendly: 1,
            shower_status: 0,
            fishing_status: 0,
            cooking_status: 0,
            fire_status: 0,
            repair_status: 0,
            grocery_status: 0,
            dining_status: 0,
            accommodation_status: 0,
            intro: '地图搜索结果',
            memo: '',
            _source: 'poi'
          });
        }
      }
    }

    console.log('[Route] POI搜索到露营点:', allPOIs.length);
    return allPOIs;
  },

  // POI搜索单个请求
  _fetchPOI(pt, keyword, pageIndex, key) {
    return new Promise((resolve) => {
      wx.request({
        url: 'https://apis.map.qq.com/ws/place/v1/search',
        data: {
          keyword: keyword,
          boundary: 'nearby(' + pt.latitude + ',' + pt.longitude + ',50000)',
          key: key,
          page_size: 20,
          page_index: pageIndex
        },
        method: 'GET',
        success: (r) => resolve(r),
        fail: () => resolve(null)
      });
    });
  },

  // ============ 并发控制 (最大并发数限制) ============
  async _runWithConcurrency(tasks, maxConcurrent) {
    const results = [];
    let index = 0;

    async function runNext() {
      while (index < tasks.length) {
        const current = index++;
        results[current] = await tasks[current];
      }
    }

    // 启动 maxConcurrent 个工作线程
    const workers = [];
    for (let i = 0; i < Math.min(maxConcurrent, tasks.length); i++) {
      workers.push(runNext());
    }
    await Promise.all(workers);
    return results;
  },

  // ============ 合并数据库营地和POI搜索结果 ============
  mergeCamps(dbCamps, poiCamps, routePoints) {
    const startPt = routePoints && routePoints.length > 0 ? routePoints[0] : null;

    // 走廊宽度 (与 findCampsAlongRoute 一致)
    const endPt = routePoints && routePoints.length > 1 ? routePoints[routePoints.length - 1] : startPt;
    const straight = startPt && endPt ? util.distance(startPt.latitude, startPt.longitude, endPt.latitude, endPt.longitude) : 0;
    const corridor = Math.max(15, Math.min(60, straight / 10));

    const result = [].concat(dbCamps);
    for (const poi of poiCamps) {
      let isDup = false;
      for (const db of dbCamps) {
        const d = util.distance(poi.latitude, poi.longitude, db.latitude, db.longitude);
        if (d < 1) {
          isDup = true;
          break;
        }
      }
      if (!isDup) {
        // 计算POI点到路线的偏移距离
        let minOffset = Infinity;
        if (routePoints && routePoints.length >= 2) {
          for (let i = 0; i < routePoints.length - 1; i++) {
            const offset = this.distToSegment(
              poi.latitude, poi.longitude,
              routePoints[i].latitude, routePoints[i].longitude,
              routePoints[i + 1].latitude, routePoints[i + 1].longitude
            );
            if (offset < minOffset) minOffset = offset;
          }
        }
        // 过滤掉偏离路线太远的POI
        if (minOffset <= corridor) {
          poi.distance = startPt ? Math.round(util.distance(poi.latitude, poi.longitude, startPt.latitude, startPt.longitude) * 10) / 10 : 0;
          poi.offset = Math.round(minOffset * 10) / 10;
          result.push(poi);
        }
      }
    }
    // 按名称排序去重 (相同名称只保留一个)
    const nameSet = new Set();
    const uniqueResult = [];
    for (const c of result) {
      const nameKey = c.name.replace(/\s/g, '').substring(0, 8);
      if (!nameSet.has(nameKey)) {
        nameSet.add(nameKey);
        uniqueResult.push(c);
      }
    }
    // 按距起点距离排序
    uniqueResult.sort((a, b) => (a.distance || 0) - (b.distance || 0));
    return uniqueResult;
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

  // ============ 取消路线规划 ============
  cancelRoutePlanning() {
    this._cancelled = true;
    util.hideLoading();
    this.setData({ routePlanning: false, showCancelBtn: false });
    util.showToast('已取消');
  },

  // ============ 计算路线折线的地理范围 ============
  _getRouteBounds(points, padding) {
    if (!points || points.length === 0) return null;
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
    for (const p of points) {
      if (p.latitude < minLat) minLat = p.latitude;
      if (p.latitude > maxLat) maxLat = p.latitude;
      if (p.longitude < minLng) minLng = p.longitude;
      if (p.longitude > maxLng) maxLng = p.longitude;
    }
    const pad = padding || 0.05;
    return {
      minLat: minLat - pad,
      maxLat: maxLat + pad,
      minLng: minLng - pad,
      maxLng: maxLng + pad
    };
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
