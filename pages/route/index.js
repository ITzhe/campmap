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
    allCamps: [],

    // 营地概述弹窗
    showCampPopup: false,
    popupCamp: null,
    popupTags: [],
    popupIsFree: true
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

  // ============ 跳转到地图首页 ============
  goToMap() {
    wx.switchTab({ url: '/pages/map/index' });
  },

  // ============ 选择起点 (微信默认位置选择) ============
  chooseStart() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          routeStart: res.name || res.address,
          startCoord: { lat: res.latitude, lng: res.longitude, name: res.name || res.address }
        });
      }
    });
  },

  // ============ 选择终点 (微信默认位置选择) ============
  chooseEnd() {
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          routeEnd: res.name || res.address,
          endCoord: { lat: res.latitude, lng: res.longitude, name: res.name || res.address }
        });
      }
    });
  },

  // ============ 添加途经点 (微信默认位置选择, 无数量限制) ============
  addWaypoint() {
    wx.chooseLocation({
      success: (res) => {
        const wp = {
          id: 'wp_' + Date.now(),
          name: res.name || res.address,
          lat: res.latitude,
          lng: res.longitude
        };
        this.setData({ waypoints: this.data.waypoints.concat([wp]) });
      }
    });
  },

  // ============ 重新选择途经点 (微信默认位置选择) ============
  chooseWaypoint(e) {
    const idx = e.currentTarget.dataset.idx;
    wx.chooseLocation({
      success: (res) => {
        const waypoints = this.data.waypoints.slice();
        waypoints[idx] = {
          id: waypoints[idx].id,
          name: res.name || res.address,
          lat: res.latitude,
          lng: res.longitude
        };
        this.setData({ waypoints });
      }
    });
  },

  // ============ 删除途经点 ============
  removeWaypoint(e) {
    const idx = e.currentTarget.dataset.idx;
    const waypoints = this.data.waypoints.slice();
    waypoints.splice(idx, 1);
    this.setData({ waypoints });
  },

  // ============ 途经点上移 ============
  moveWaypointUp(e) {
    const idx = e.currentTarget.dataset.idx;
    if (idx <= 0) return;
    const waypoints = this.data.waypoints.slice();
    const tmp = waypoints[idx - 1];
    waypoints[idx - 1] = waypoints[idx];
    waypoints[idx] = tmp;
    this.setData({ waypoints });
  },

  // ============ 途经点下移 ============
  moveWaypointDown(e) {
    const idx = e.currentTarget.dataset.idx;
    if (idx >= this.data.waypoints.length - 1) return;
    const waypoints = this.data.waypoints.slice();
    const tmp = waypoints[idx + 1];
    waypoints[idx + 1] = waypoints[idx];
    waypoints[idx] = tmp;
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
    const routeBounds = this._getRouteBounds(allRoutePoints, 0.1);

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
      const routeCamps = await api.fetchCampsites({ fee: 'all' }, routeBounds, 2000);
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

    const corridor = 5;
    const startPt = routePoints[0];

    console.log('[Route] 开始筛选沿途营地, 数据库营地数:', this.data.allCamps.length, '路线点数:', routePoints.length, '走廊宽度:', corridor + 'km');

    const list = this.data.allCamps.map(c => {
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

    console.log('[Route] 筛选后沿途营地数:', list.length, '(总营地:', this.data.allCamps.length + ')');

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
  },

  // ============ 取消路线规划 ============
  cancelRoutePlanning() {
    this._cancelled = true;
    util.hideLoading();
    this.setData({ routePlanning: false, showCancelBtn: false });
    util.showToast('已取消');
  },

  // ============ 营地点击 — 显示信息概述弹窗 ============
  onCampTap(e) {
    const idx = e.currentTarget.dataset.idx;
    const camp = this.data.routeCampList[idx];
    if (!camp) return;

    // 构建设施标签 (只显示已有的)
    const facKeys = [
      { key: 'toilet_status', label: '厕所' },
      { key: 'water_status', label: '接水' },
      { key: 'power_status', label: '市电' },
      { key: 'charging_status', label: '充电' },
      { key: 'rv_friendly', label: '房车' },
      { key: 'tent_friendly', label: '帐篷' },
      { key: 'shower_status', label: '淋浴' },
      { key: 'cooking_status', label: '做饭' },
      { key: 'grocery_status', label: '买菜' },
      { key: 'dining_status', label: '餐饮' }
    ];
    const tags = facKeys.filter(t => Number(camp[t.key]) > 0).map(t => t.label);

    this.setData({
      showCampPopup: true,
      popupCamp: camp,
      popupTags: tags,
      popupIsFree: camp.parking_status == 0
    });
  },

  // ============ 关闭营地弹窗 ============
  closeCampPopup() {
    this.setData({ showCampPopup: false });
  },

  // ============ 从弹窗跳转详情页 ============
  popupGoDetail() {
    const camp = this.data.popupCamp;
    if (!camp) return;
    this.setData({ showCampPopup: false });
    const app = getApp();
    app.globalData.selectedCamp = camp;
    wx.navigateTo({
      url: '/pages/detail/index?spot_code=' + camp.spot_code
    });
  },

  // ============ 从弹窗添加为途经点 ============
  popupAddWaypoint() {
    const camp = this.data.popupCamp;
    if (!camp) return;

    const existing = this.data.waypoints.some(wp =>
      wp.lat === camp.latitude && wp.lng === camp.longitude
    );
    if (existing) {
      util.showToast('该营地已在途经点中');
      return;
    }

    const wp = {
      id: 'wp_' + Date.now(),
      name: camp.name,
      lat: camp.latitude,
      lng: camp.longitude
    };
    this.setData({
      waypoints: this.data.waypoints.concat([wp]),
      showCampPopup: false
    });
    util.showToast('已添加为途经点');
  },

  // ============ 添加营地为途经点 (列表内按钮) ============
  addCampToRoute(e) {
    const idx = e.currentTarget.dataset.idx;
    const camp = this.data.routeCampList[idx];
    if (!camp) return;

    // 检查是否已在途经点列表中
    const existing = this.data.waypoints.some(wp =>
      wp.latitude === camp.latitude && wp.longitude === camp.longitude
    );
    if (existing) {
      util.showToast('该营地已在途经点中');
      return;
    }

    const newWaypoint = {
      name: camp.name,
      address: camp.address || '',
      latitude: camp.latitude,
      longitude: camp.longitude
    };

    const waypoints = [...this.data.waypoints, newWaypoint];
    this.setData({ waypoints });
    util.showToast('已添加为途经点');
  }
});
