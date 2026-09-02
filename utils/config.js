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

  // 腾讯地图 WebService API Key
  // 用于驾车路线规划 (线路规划页)
  // 请前往 https://lbs.qq.com/ 注册免费 Key 并替换下方占位
  // 注册后在「控制台 → 应用管理 → 创建应用」中获取 Key
  MAP_KEY: '2OWBZ-O7FCA-JIFKZ-CJSTI-VLSHF-QLFRE',

  // 阿里云 OSS 配置 (测试阶段: 公共读写)
  // 需要在小程序后台 → 开发管理 → 服务器域名 中添加:
  // uploadFile: https://camp-map.oss-cn-beijing.aliyuncs.com
  // request: https://camp-map.oss-cn-beijing.aliyuncs.com
  OSS: {
    BUCKET: 'camp-map',
    ENDPOINT: 'oss-cn-beijing.aliyuncs.com',
    REGION: 'oss-cn-beijing',
    get BASE_URL() { return 'https://' + this.BUCKET + '.' + this.ENDPOINT; }
  },

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
    ],
    // 过夜友好度筛选
    overnight: [
      { label: '全部', value: 'all' },
      { label: '4星以上', value: '4' },
      { label: '3星以上', value: '3' },
      { label: '可过夜', value: 'yes' }
    ]
  },

  // 过夜属性配置
  OVERNIGHT: {
    // 能否过夜
    statusLabels: { 0: '待确认', 1: '可以过夜', 2: '不可过夜', 3: '不推荐过夜' },
    statusEmoji: { 0: '❓', 1: '✅', 2: '🚫', 3: '⚠️' },

    // 噪音等级
    noiseLabels: { 0: '未知', 1: '非常安静', 2: '较安静', 3: '一般', 4: '较吵', 5: '很吵' },
    noiseEmoji: { 0: '❓', 1: '🤫', 2: '🔇', 3: '🔊', 4: '📢', 5: '💥' },

    // 安全程度
    safetyLabels: { 0: '未知', 1: '很不安全', 2: '不太安全', 3: '一般', 4: '较安全', 5: '非常安全' },
    safetyEmoji: { 0: '❓', 1: '😨', 2: '😟', 3: '😐', 4: '😊', 5: '🛡️' },

    // 手机信号
    signalLabels: { 0: '未知', 1: '无信号', 2: '很差', 3: '一般', 4: '较好', 5: '很好' },
    signalEmoji: { 0: '❓', 1: '📵', 2: '📶', 3: '📶', 4: '📶', 5: '📶' },

    // 地面类型
    groundLabels: { 0: '未知', 1: '硬化平整', 2: '碎石路面', 3: '草地', 4: '泥地', 5: '沙土', 6: '不平/斜坡' },
    groundEmoji: { 0: '❓', 1: '🅿️', 2: '🪨', 3: '🌿', 4: '💩', 5: '🏜️', 6: '📐' },

    // 数据来源
    sourceLabels: {
      '': '未标注',
      'type': '类型推断',
      'keyword': '关键词提取',
      'type+keyword': '智能标注',
      'manual': '人工复核',
      'user': '用户贡献'
    }
  },

  // 营地录入页设施选项 (包含所有设施, 合并了原"更多选项")
  SUBMIT_FAC_ITEMS: [
    { v: 'parking_status', l: '免费', e: '🆓' },
    { v: 'rv_friendly', l: '停房车', e: '🚐' },
    { v: 'trailer_friendly', l: '停拖挂', e: '🚛' },
    { v: 'tent_friendly', l: '搭帐篷', e: '⛺' },
    { v: 'power_status', l: '接电', e: '🔌' },
    { v: 'charging_status', l: '充电桩', e: '🔋' },
    { v: 'water_status', l: '接水', e: '💧' },
    { v: 'toilet_status', l: '卫生间', e: '🚻' },
    { v: 'shower_status', l: '淋浴', e: '🚿' },
    { v: 'cooking_status', l: '做饭', e: '🍳' },
    { v: 'fire_status', l: '可明火', e: '🔥' },
    { v: 'fishing_status', l: '钓鱼', e: '🎣' },
    { v: 'grocery_status', l: '买菜', e: '🛒' },
    { v: 'repair_status', l: '修车', e: '🔧' },
    { v: 'dining_status', l: '餐饮', e: '🍽' },
    { v: 'accommodation_status', l: '住宿', e: '🏠' }
  ],

  // 打卡评价快选标签（3个核心维度）
  CHECKIN_TAGS: {
    overnight: [
      { value: 1, label: '可以过夜', emoji: '✅' },
      { value: 3, label: '勉强能住', emoji: '⚠️' },
      { value: 2, label: '不能过夜', emoji: '🚫' }
    ],
    noise: [
      { value: 1, label: '很安静', emoji: '🤫' },
      { value: 3, label: '一般', emoji: '🔊' },
      { value: 5, label: '很吵', emoji: '💥' }
    ],
    safety: [
      { value: 5, label: '很安全', emoji: '🛡️' },
      { value: 3, label: '一般', emoji: '😐' },
      { value: 1, label: '不安全', emoji: '😨' }
    ]
  },

  // 积分规则
  POINTS_RULES: {
    initial: 10,        // 新用户初始积分
    daily_checkin: 10,  // 每日签到
    view_detail: -1,    // 查看详情
    camp_submit: 100,   // 营地录入审核通过
    camp_checkin: 5,    // 营地打卡
    checkin_review: 10  // 打卡带评价额外积分
  }
};

module.exports = config;
