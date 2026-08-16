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
    // 先尝试定位，再加载营地
    this.tryLocateAndLoad();
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
      const tags = tagConfigs.slice(0, 5).map(t => ({
        label: t.label,
        on: t.always ? true : Number(camp[t.key]) > 0
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

  // ============ 定位 + 加载 ============
  tryLocateAndLoad() {
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
        this.loadCamps();
      },
      fail: () => {
        // 定位失败，用默认中心
        this.setData({ cityName: '青岛' });
        this.loadCamps();
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

  // ============ 加载营地数据 (数据库 + 腾讯地图POI搜索) ============
  async loadCamps() {
    if (this.data.loadingCamps) return;
    this.setData({ loadingCamps: true });

    const bounds = this.getMapBounds();

    util.showLoading('加载营地...');

    try {
      // 并行请求: 数据库营地 + 腾讯地图POI搜索
      const [dbCamps, poiCamps] = await Promise.all([
        api.fetchCampsites(this.data.filters, bounds, 5000),
        this.searchPOI(bounds)
      ]);

      // 合并去重
      const merged = this.mergeCamps(dbCamps, poiCamps);

      this.setData({
        camps: merged,
        campCount: merged.length
      });
      this.buildMarkers(merged);

      // 数据库请求失败时提示用户
      if (dbCamps.length === 0 && poiCamps.length === 0) {
        util.showToast('数据加载失败，请检查网络');
      }
    } catch (e) {
      util.showToast('加载失败，请重试');
    }
    util.hideLoading();
    this.setData({ loadingCamps: false });
  },

  // ============ 腾讯地图POI搜索 (补充数据库没有的营地) ============
  searchPOI(bounds) {
    const key = config.MAP_KEY || '';
    if (!key || !bounds) return Promise.resolve([]);

    const centerLat = (bounds.minLat + bounds.maxLat) / 2;
    const centerLng = (bounds.minLng + bounds.maxLng) / 2;
    // 搜索半径: 根据bounds跨度计算 (米)
    const latSpan = (bounds.maxLat - bounds.minLat) * 111000;
    const radius = Math.min(50000, Math.max(10000, latSpan / 2));

    const keywords = ['露营地', '房车营地', '帐篷营地', '露营基地', '房车露营'];
    const allPOIs = [];
    const seen = new Set();

    // 并行搜索多个关键词
    const tasks = keywords.map(kw => {
      return new Promise((resolve) => {
        wx.request({
          url: 'https://apis.map.qq.com/ws/place/v1/search',
          data: {
            keyword: kw,
            boundary: 'nearby(' + centerLat + ',' + centerLng + ',' + radius + ')',
            key: key,
            page_size: 20,
            page_index: 1
          },
          method: 'GET',
          success: (r) => resolve(r),
          fail: () => resolve(null)
        });
      });
    });

    return Promise.all(tasks).then(results => {
      for (const res of results) {
        if (res && res.data && res.data.status === 0 && res.data.data) {
          for (const poi of res.data.data) {
            const lat = poi.location ? poi.location.lat : 0;
            const lng = poi.location ? poi.location.lng : 0;
            if (!lat || !lng) continue;

            // 名称过滤: 必须包含露营地/房车营地等具体营地词
            // 注意: 单独的"露营"太宽泛, 会匹配到"北京自驾蔚县露营徒步之旅"等旅行路线
            const poiName = poi.title || '';
            const campingTerms = ['露营地', '房车营地', '帐篷营地', '野营地', '露营基地', '露营公园', '房车露营地', 'campground', 'camping site', 'RV park'];
            const hasCampingTerm = campingTerms.some(term => poiName.toLowerCase().indexOf(term.toLowerCase()) > -1);
            if (!hasCampingTerm) continue;

            // 排除明确不是营地的场所
            const excludeTerms = ['教育', '培训', '考研', '帮教', '实习', '拓展', '书法', '实训', '种植', '养殖', '科研', '实验', '产业',
              '旅行', '之旅', '徒步', '自驾', '攻略', '路线', '俱乐部', '用品', '装备', '销售', '体验', '农庄', '度假', '民宿',
              '旅游', '行程', '游记', '户外店', '专卖店', '工厂', '批发', '租赁'
            ];
            const hasExcludeTerm = excludeTerms.some(term => poiName.indexOf(term) > -1);
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
      console.log('[Map] POI搜索到露营点:', allPOIs.length);
      return allPOIs;
    });
  },

  // ============ 合并数据库营地和POI搜索结果 (去重) ============
  mergeCamps(dbCamps, poiCamps) {
    const result = [].concat(dbCamps);
    for (const poi of poiCamps) {
      let isDup = false;
      for (const db of dbCamps) {
        const d = util.distance(poi.latitude, poi.longitude, db.latitude, db.longitude);
        if (d < 1) { isDup = true; break; }
      }
      if (!isDup) result.push(poi);
    }
    return result;
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

    // 构建标签
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

    const tags = tagConfigs.slice(0, 5).map(t => ({
      label: t.label,
      on: t.always ? true : Number(camp[t.key]) > 0
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
    util.showToast('搜索功能开发中');
  },

  // ============ 跳转营地录入 ============
  goSubmit() {
    wx.navigateTo({ url: '/pages/submit/index' });
  }
});
