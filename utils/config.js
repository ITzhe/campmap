// config.js — 全局配置

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRya3RkeWZ3YXdwZnVnaHV6cXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyMzYsImV4cCI6MjA5NTI2NTIzNn0.X2KV2LA3ofvhQCTJl3pLIV84VlYSYx0Vf4L3Etr1NEs';

const config = {
  // Supabase 配置
  SUPABASE_URL: 'https://drktdyfwawpfughuzqvs.supabase.co',
  API_BASE: 'https://drktdyfwawpfughuzqvs.supabase.co/rest/v1',
  ANON_KEY: ANON_KEY,

  // 请求头
  getHeaders() {
    return {
      'apikey': ANON_KEY,
      'Authorization': 'Bearer ' + ANON_KEY,
      'Accept-Profile': 'map',
      'Content-Profile': 'map',
      'Content-Type': 'application/json'
    };
  },

  // 默认城市中心 (青岛, 定位失败时使用)
  CITY_CENTER: { latitude: 36.0671, longitude: 120.3826 },
  CITY_NAME: '当前位置',
  DEFAULT_ZOOM: 11,
  RADIUS_KM: 50, // 加载半径 km, 拖动地图时按可见范围加载

  // 设施中文名映射
  FAC_LABELS: {
    toilet_status: '厕所',
    water_status: '接水',
    power_status: '接市电',
    charging_status: '充电桩',
    rv_friendly: '停房车',
    trailer_friendly: '停拖挂',
    tent_friendly: '搭帐篷',
    shower_status: '淋浴',
    fishing_status: '钓鱼',
    cooking_status: '做饭',
    fire_status: '明火',
    repair_status: '修车',
    grocery_status: '买菜',
    dining_status: '餐饮',
    accommodation_status: '住宿'
  },

  // 设施 emoji 映射
  FAC_EMOJI: {
    toilet_status: '🚻',
    water_status: '💧',
    power_status: '🔌',
    charging_status: '🔋',
    rv_friendly: '🚐',
    trailer_friendly: '🚛',
    tent_friendly: '⛺',
    shower_status: '🚿',
    fishing_status: '🎣',
    cooking_status: '🍳',
    fire_status: '🔥',
    repair_status: '🔧',
    grocery_status: '🛒',
    dining_status: '🍽',
    accommodation_status: '🏠'
  },

  // 设施分组 (详情页用)
  FAC_GROUPS: [
    { title: '停车类', keys: ['rv_friendly', 'trailer_friendly', 'tent_friendly'] },
    { title: '水电基础', keys: ['water_status', 'power_status', 'charging_status'] },
    { title: '生活配套', keys: ['toilet_status', 'shower_status', 'cooking_status', 'fire_status'] },
    { title: '周边服务', keys: ['fishing_status', 'repair_status', 'grocery_status', 'dining_status', 'accommodation_status'] }
  ],

  // 筛选项配置
  FILTER_OPTIONS: {
    fee: [
      { label: '全部', value: 'all' },
      { label: '免费', value: '0' },
      { label: '收费', value: '1' }
    ],
    park: [
      { label: '房车可停', value: 'rv_friendly' },
      { label: '停拖挂', value: 'trailer_friendly' },
      { label: '帐篷可搭', value: 'tent_friendly' }
    ],
    fac: [
      { label: '有厕所', value: 'toilet_status' },
      { label: '可淋浴', value: 'shower_status' },
      { label: '可接水', value: 'water_status' },
      { label: '接市电', value: 'power_status' },
      { label: '能钓鱼', value: 'fishing_status' },
      { label: '可做饭', value: 'cooking_status' },
      { label: '可明火', value: 'fire_status' },
      { label: '有修车', value: 'repair_status' },
      { label: '能买菜', value: 'grocery_status' },
      { label: '有餐饮', value: 'dining_status' },
      { label: '有住宿', value: 'accommodation_status' }
    ]
  },

  // 营地录入页设施选项
  SUBMIT_FAC_ITEMS: [
    { v: 'parking_status', l: '免费', e: '🆓' },
    { v: 'power_status', l: '接电', e: '🔌' },
    { v: 'water_status', l: '接水', e: '💧' },
    { v: 'toilet_status', l: '卫生间', e: '🚻' },
    { v: 'trailer_friendly', l: '停拖挂', e: '🚛' },
    { v: 'tent_friendly', l: '搭帐篷', e: '⛺' },
    { v: 'repair_status', l: '修车', e: '🔧' },
    { v: 'cooking_status', l: '做饭', e: '🍳' },
    { v: 'shower_status', l: '淋浴', e: '🚿' },
    { v: 'fishing_status', l: '钓鱼', e: '🎣' },
    { v: 'accommodation_status', l: '住宿', e: '🏠' },
    { v: 'dining_status', l: '餐饮', e: '🍽' }
  ],

  // 积分规则
  POINTS_RULES: {
    initial: 10,        // 新用户初始积分
    daily_checkin: 10,  // 每日签到
    view_detail: -1,    // 查看详情
    camp_submit: 100,   // 营地录入审核通过
    camp_checkin: 5     // 营地打卡
  }
};

module.exports = config;
