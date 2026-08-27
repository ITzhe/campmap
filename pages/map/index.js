// pages/map/index.js — 地图首页逻辑
const config = require('../../utils/config');
const api = require('../../utils/api');
const util = require('../../utils/util');

Page({
  data: {
    // 状态栏高度 (px)
    statusBarHeight: 20,
    // 顶部栏总高度 (statusBar + 导航栏)
    topbarHeight: 64,

    // 地图状态
    latitude: 36.0671,
    longitude: 120.3826,
    scale: 11,
    cityName: '定位中...',
    showLocation: true,

    // 营地数据
    camps: [],
    markers: [],

    // 底部卡片
    showBottomCard: false,
    selectedCamp: null,
    selectedCampDist: 0,
    bottomCardTags: [],

    // 天气信息
    weatherInfo: '',
    weatherLoading: false,

    // 筛选
    filterVisible: false,
    filters: { fee: 'all', park: [], fac: [] },
    filterCount: 0,
    filterSummaryText: '',
    filteredCount: 0,

    // 积分
    userPoints: 0,
    showPointsModal: false,

    // 状态
    loadingCamps: false,
    campCount: 0
  },

  // 防抖定时器
  _reloadTimer: null,
  _firstLoad: true,

  onLoad() {
    // 获取状态栏高度
    let sbh = 20;
    try {
      if (wx.getWindowInfo) {
        sbh = wx.getWindowInfo().statusBarHeight;
      } else {
        sbh = wx.getSystemInfoSync().statusBarHeight;
      }
    } catch (e) {}

    // 读取用户设置的默认缩放级别
    let defaultScale = 11;
    try {
      const settings = wx.getStorageSync('camp_settings') || {};
      if (typeof settings.zoomIndex === 'number') {
        const zoomMap = [6, 11, 14, 17]; // 低/中/高/超高
        defaultScale = zoomMap[settings.zoomIndex] || 11;
      }
    } catch (e) {}

    const app = getApp();
    this.setData({
      statusBarHeight: sbh,
      topbarHeight: sbh + 44,
      latitude: app.globalData.cityCenter.latitude,
      longitude: app.globalData.cityCenter.longitude,
      scale: defaultScale,
      cityName: app.globalData.cityName,
      userPoints: app.globalData.points
    });

    // 立即用默认中心加载营地 (不等待定位)
    this.loadCamps();

    // 异步定位, 成功后刷新 (用 try-catch 防止任何错误中断页面生命周期)
    try {
      this.tryLocate();
    } catch (e) {
      console.error('[map] tryLocate 异常:', e.message);
      this.setData({ cityName: '青岛' });
    }
  },

  onShow() {
    const app = getApp();
    const userData = util.getUserState();
    app.globalData.points = userData.points;
    this.setData({ userPoints: userData.points });

    // 从城市选择页返回时，更新地图中心和城市名
    if (app.globalData.cityChanged) {
      app.globalData.cityChanged = false;
      this.setData({
        latitude: app.globalData.cityCenter.latitude,
        longitude: app.globalData.cityCenter.longitude,
        cityName: app.globalData.cityName,
        scale: 11
      });
      this.loadCamps();
    }

    // 从搜索页返回时，聚焦到选中的营地
    if (app.globalData.mapFocus) {
      const focus = app.globalData.mapFocus;
      app.globalData.mapFocus = null;
      this.setData({
        latitude: focus.latitude,
        longitude: focus.longitude,
        scale: 15
      });
      this.loadCamps();
      // 延迟跳转详情页
      if (focus.spotCode) {
        setTimeout(() => {
          wx.navigateTo({ url: '/pages/detail/index?spotCode=' + focus.spotCode });
        }, 500);
      }
    }

    // 如果有筛选变化，重新加载
    if (JSON.stringify(app.globalData.filters) !== JSON.stringify(this.data.filters)) {
      this.setData({ filters: app.globalData.filters });
      this.applyFilters();
    }

    // 从线路规划页跳回时，展示选中营地的底部卡片
    if (app.globalData.pendingCampFocus && app.globalData.selectedCamp) {
      const camp = app.globalData.selectedCamp;
      app.globalData.pendingCampFocus = false;
      const dist = util.distance(
        camp.latitude, camp.longitude,
        this.data.latitude, this.data.longitude
      );
      const tagConfigs = [
        { key: 'parking_status', label: camp.parking_status == 0 ? '免费' : '收费', always: true },
        { key: 'toilet_status', label: '厕所' },
        { key: 'water_status', label: '接水' },
        { key: 'power_status', label: '市电' },
        { key: 'grocery_status', label: '买菜' },
        { key: 'rv_friendly', label: '房车' }
      ];
      const tags = tagConfigs.filter(t => t.always || Number(camp[t.key]) > 0).map(t => ({
        label: t.label,
        on: true
      }));
      this.setData({
        showBottomCard: true,
        selectedCamp: camp,
        selectedCampDist: camp.distance || dist,
        bottomCardTags: tags,
        weatherInfo: '',
        weatherLoading: true
      });

      // 获取营地天气信息
      this.fetchWeather(camp.latitude, camp.longitude);
    }
  },

  // ============ 异步定位 (不阻塞营地加载) ============
  tryLocate() {
    // 先检查是否已有定位授权
    wx.getSetting({
      success: (settingRes) => {
        const auth = settingRes.authSetting || {};
        if (auth['scope.userLocation'] === false) {
          // 用户曾拒绝授权, 需引导重新授权
          console.log('[map] 定位授权曾被拒绝, 使用默认城市');
          this.setData({ cityName: '青岛' });
          return;
        }
        // 未授权或已授权, 都尝试 getLocation
        this.doGetLocation();
      },
      fail: () => {
        // getSetting 失败, 直接尝试定位
        this.doGetLocation();
      }
    });
  },

  // ============ 执行定位 ============
  doGetLocation() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        const app = getApp();
        const cityName = util.getNearestCity(res.latitude, res.longitude);
        app.globalData.cityCenter = {
          latitude: res.latitude,
          longitude: res.longitude
        };
        app.globalData.cityName = cityName;
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          scale: 12,
          cityName: cityName
        });
        // 定位成功后, 用新坐标重新加载营地
        this._needReload = true;
        this.loadCamps();
      },
      fail: (err) => {
        console.log('[map] 定位失败, 使用默认城市中心:', err.errMsg || '');
        this.setData({ cityName: '青岛' });
      }
    });
  },

  // ============ 计算当前地图可见范围 ============
  getMapBounds() {
    const lat = this.data.latitude;
    const lng = this.data.longitude;
    // 根据缩放级别计算搜索半径 (度)
    // 增大搜索范围: scale越小(视野越大)半径越大
    const scale = this.data.scale || 11;
    // 每级缩放对应大约2倍的视野范围
    // scale 11 -> ~1.5度 (~166km), scale 12 -> ~0.8度 (~88km)
    // scale 13 -> ~0.4度 (~44km), scale 14 -> ~0.2度 (~22km)
    const radiusDeg = Math.max(0.15, 3.0 / Math.pow(2, scale - 9));
    const cosLat = Math.cos(lat * Math.PI / 180) || 0.01;
    return {
      minLat: lat - radiusDeg,
      maxLat: lat + radiusDeg,
      minLng: lng - radiusDeg / cosLat,
      maxLng: lng + radiusDeg / cosLat
    };
  },

  // ============ 加载营地数据 (仅数据库) ============
  async loadCamps() {
    // 如果正在加载, 标记需要重新加载
    if (this.data.loadingCamps) {
      this._needReload = true;
      return;
    }
    this._needReload = false;
    this.setData({ loadingCamps: true });

    const bounds = this.getMapBounds();

    util.showLoading('加载营地...');

    try {
      const dbCamps = await api.fetchCampsites(this.data.filters, bounds, 5000);

      this.setData({
        camps: dbCamps,
        campCount: dbCamps.length
      });
      this.buildMarkers(dbCamps);

      if (dbCamps.length === 0) {
        util.showToast('当前区域暂无营地数据');
      }
    } catch (e) {
      console.error('[map] loadCamps 异常:', e.message);
      util.showToast('加载失败，请重试');
    }
    util.hideLoading();
    this.setData({ loadingCamps: false });

    // 如果在加载期间有新的定位完成, 重新加载一次
    if (this._needReload) {
      this._needReload = false;
      this.loadCamps();
    }
  },

  // ============ 构建地图标记 ============
  buildMarkers(camps) {
    const markers = camps.map((c, idx) => {
      const isFree = c.parking_status == 0;
      let iconPath = '/assets/markers/free.png';
      if (!isFree) iconPath = '/assets/markers/paid.png';

      return {
        id: idx,
        latitude: c.latitude,
        longitude: c.longitude,
        iconPath: iconPath,
        width: 32,
        height: 36,
        anchor: { x: 0.5, y: 1 }
      };
    });
    this.setData({ markers, filteredCount: camps.length });
  },

  // ============ 标记点击 ============
  onMarkerTap(e) {
    const markerId = e.markerId;
    const camp = this.data.camps[markerId];
    if (!camp) return;

    const dist = util.distance(
      camp.latitude, camp.longitude,
      this.data.latitude, this.data.longitude
    );

    // 构建标签 (只显示已开启的设施)
    const tagConfigs = [
      { key: 'parking_status', label: camp.parking_status == 0 ? '免费' : '收费', always: true },
      { key: 'toilet_status', label: '厕所' },
      { key: 'water_status', label: '接水' },
      { key: 'power_status', label: '市电' },
      { key: 'charging_status', label: '充电' },
      { key: 'rv_friendly', label: '房车' },
      { key: 'grocery_status', label: '买菜' },
      { key: 'tent_friendly', label: '帐篷' }
    ];

    const tags = tagConfigs.filter(t => t.always || Number(camp[t.key]) > 0).map(t => ({
      label: t.label,
      on: true
    }));

    this.setData({
      showBottomCard: true,
      selectedCamp: camp,
      selectedCampDist: dist,
      bottomCardTags: tags,
      weatherInfo: '',
      weatherLoading: true
    });

    // 获取营地天气信息
    this.fetchWeather(camp.latitude, camp.longitude);
  },

  // ============ 获取天气信息 (腾讯地图天气API) ============
  fetchWeather(lat, lng) {
    const key = config.MAP_KEY || '';
    if (!key) {
      this.setData({ weatherInfo: '', weatherLoading: false });
      return;
    }

    wx.request({
      url: 'https://apis.map.qq.com/ws/weather/v1/',
      data: {
        key: key,
        location: lat + ',' + lng,
        type: 'now'
      },
      method: 'GET',
      success: (res) => {
        if (res.data && res.data.status === 0 && res.data.result &&
            res.data.result.realtime && res.data.result.realtime.length > 0) {
          const rt = res.data.result.realtime[0];
          const info = rt.infos || {};
          const weather = info.weather || '';
          const temp = (info.temperature !== undefined && info.temperature !== null) ? info.temperature + '°' : '';
          const windDir = info.wind_direction || '';
          const windPower = info.wind_power_v2 || info.wind_power || '';
          const humidity = (info.humidity !== undefined && info.humidity !== null) ? info.humidity + '%' : '';

          const emoji = this.getWeatherEmoji(weather);
          const parts = [];
          if (temp) parts.push(temp);
          if (weather) parts.push(weather);
          if (windDir && windPower) parts.push(windDir + ' ' + windPower);
          if (humidity) parts.push('湿度' + humidity);

          this.setData({
            weatherInfo: emoji + ' ' + parts.join(' · '),
            weatherLoading: false
          });
        } else {
          this.setData({ weatherInfo: '', weatherLoading: false });
        }
      },
      fail: () => {
        this.setData({ weatherInfo: '', weatherLoading: false });
      }
    });
  },

  // 天气描述转 emoji
  getWeatherEmoji(weather) {
    const emojiMap = {
      '晴': '☀️',
      '多云': '⛅',
      '阴': '☁️',
      '阵雨': '🌦',
      '雷阵雨': '⛈',
      '小雨': '🌦',
      '中雨': '🌧',
      '大雨': '🌧',
      '暴雨': '⛈',
      '小雪': '🌨',
      '中雪': '🌨',
      '大雪': '❄️',
      '暴雪': '❄️',
      '雨夹雪': '🌨',
      '雾': '🌫',
      '霾': '🌫',
      '沙尘': '🌪',
      '浮尘': '🌫',
      '扬沙': '🌫'
    };
    for (const key in emojiMap) {
      if (weather.indexOf(key) > -1) return emojiMap[key];
    }
    return '🌡';
  },

  closeBottomCard() {
    this.setData({ showBottomCard: false, weatherInfo: '', weatherLoading: false });
  },

  // ============ 查看详情 (推广期免费, 无积分限制) ============
  viewDetail() {
    const camp = this.data.selectedCamp;
    if (!camp) return;

    // 保存选中营地到全局
    const app = getApp();
    app.globalData.selectedCamp = camp;

    // 跳转详情页
    wx.navigateTo({
      url: `/pages/detail/index?spot_code=${camp.spot_code}`
    });
  },

  // ============ 积分不足弹窗 ============
  closePointsModal() {
    this.setData({ showPointsModal: false });
  },

  onModalCheckin() {
    const result = util.doCheckin();
    if (result.success) {
      const app = getApp();
      app.globalData.points = result.points;
      app.globalData.streak = result.streak;
      this.setData({
        showPointsModal: false,
        userPoints: result.points
      });
      util.showToast('签到成功 +10 积分');
      setTimeout(() => this.viewDetail(), 800);
    } else {
      util.showToast(result.msg);
    }
  },

  // ============ 筛选弹窗 ============
  openFilter() {
    this.setData({ filterVisible: true });
  },

  onFilterClose() {
    this.setData({ filterVisible: false });
  },

  onFilterConfirm(e) {
    const filters = e.detail.filters;
    const count = e.detail.count;
    this.setData({
      filters,
      filterVisible: false,
      filterCount: count
    });

    const app = getApp();
    app.globalData.filters = filters;

    if (count > 0) {
      let parts = [];
      if (filters.fee !== 'all') parts.push(filters.fee == '0' ? '免费' : '收费');
      filters.park.forEach(k => parts.push(config.FAC_LABELS[k]));
      filters.fac.forEach(k => parts.push('有' + config.FAC_LABELS[k]));
      this.setData({ filterSummaryText: parts.join(' · ') });
    }

    this.applyFilters();
  },

  onFilterReset() {
    this.setData({
      filters: { fee: 'all', park: [], fac: [] },
      filterCount: 0,
      filterSummaryText: ''
    });
    const app = getApp();
    app.globalData.filters = { fee: 'all', park: [], fac: [] };
    this.loadCamps();
  },

  // ============ 本地筛选 ============
  applyFilters() {
    const f = this.data.filters;
    let list = this.data.camps;

    list = list.filter(c => {
      if (f.fee !== 'all' && c.parking_status != f.fee) return false;
      if (f.park.length && !f.park.every(k => c[k] == 1)) return false;
      if (f.fac.length && !f.fac.every(k => c[k] == 1)) return false;
      return true;
    });

    this.buildMarkers(list);
    this.setData({ filteredCount: list.length });
  },

  clearFilters() {
    this.setData({
      filters: { fee: 'all', park: [], fac: [] },
      filterCount: 0,
      filterSummaryText: ''
    });
    const app = getApp();
    app.globalData.filters = { fee: 'all', park: [], fac: [] };
    this.loadCamps();
  },

  // ============ 定位 ============
  locateMe() {
    wx.getLocation({
      type: 'gcj02',
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude,
          scale: 13
        });
        this.loadCamps();
        util.showToast('已定位到当前位置');
      },
      fail: () => {
        util.showToast('定位失败，请检查权限');
      }
    });
  },

  // ============ 地图区域变化 (拖动/缩放后重新加载) ============
  onRegionChange(e) {
    if (e.type !== 'end') return;

    // 兼容不同 SDK 版本: causedBy 可能在 e 或 e.detail 上
    const causedBy = e.causedBy || (e.detail && e.detail.causedBy) || '';

    // 尝试从事件中获取坐标 (部分 SDK 版本不提供)
    const detail = e.detail || {};
    if (detail.latitude !== undefined && detail.latitude !== null) {
      this.setData({
        latitude: detail.latitude,
        longitude: detail.longitude,
        scale: detail.scale || this.data.scale
      });
    }

    // 拖动、缩放、手势结束后重新加载（防抖 1.5 秒）
    if (causedBy === 'drag' || causedBy === 'scale' || causedBy === 'gesture') {
      if (this._reloadTimer) clearTimeout(this._reloadTimer);
      this._reloadTimer = setTimeout(() => {
        this.updateCenterAndLoad();
      }, 1500);
    }
  },

  // ============ 获取地图中心坐标并重新加载 ============
  updateCenterAndLoad() {
    const mapCtx = wx.createMapContext('campMap', this);
    mapCtx.getCenterLocation({
      success: (res) => {
        this.setData({
          latitude: res.latitude,
          longitude: res.longitude
        });
        this.loadCamps();
      },
      fail: () => {
        // 获取中心失败时直接用当前 data 中的坐标加载
        this.loadCamps();
      }
    });
  },

  // ============ 城市选择 ============
  onCityTap() {
    wx.navigateTo({ url: '/pages/city-picker/index' });
  },

  //Search tap
  onSearchTap() {
    wx.navigateTo({ url: '/pages/search/index' });
  },

  // ============ 跳转营地录入 ============
  goSubmit() {
    wx.navigateTo({ url: '/pages/submit/index' });
  }
});
