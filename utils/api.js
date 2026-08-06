// api.js — Supabase API 封装

const config = require('./config');
const { MOCK_CAMPS } = require('./mock');

/**
 * 通用 wx.request Promise 封装
 */
function request(url, method, data, headers) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: url,
      method: method || 'GET',
      data: data,
      header: headers || config.getHeaders(),
      timeout: 8000,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(new Error('HTTP ' + res.statusCode));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 为营地数据补充缺失字段（数据库可能没有 rv_friendly 等新字段）
 */
function normalizeCamp(camp) {
  const defaults = {
    rv_friendly: 0,
    trailer_friendly: 0,
    tent_friendly: 0,
    shower_status: 0,
    fishing_status: 0,
    cooking_status: 0,
    fire_status: 0,
    repair_status: 0,
    grocery_status: 0,
    dining_status: 0,
    accommodation_status: 0
  };
  return Object.assign({}, defaults, camp);
}

/**
 * 获取营地列表 (带筛选 + 地理范围过滤)
 * @param {Object} filters - 筛选条件
 * @param {Object} bounds - 地理范围 {minLat, maxLat, minLng, maxLng}
 * @param {number} limit - 返回数量限制 (默认200)
 */
async function fetchCampsites(filters, bounds, limit) {
  // 只查询数据库中确定存在的字段
  let selectFields = 'spot_code,name,longitude,latitude,parking_status,toilet_status,water_status,power_status,charging_status,address,intro,memo,rv_friendly,trailer_friendly,tent_friendly,shower_status,fishing_status,cooking_status,fire_status,repair_status,grocery_status,dining_status,accommodation_status';

  let url = `${config.API_BASE}/camping_spots?select=${selectFields}`;

  // 地理范围过滤：只加载可见区域内的营地
  if (bounds) {
    url += `&latitude=gte.${bounds.minLat}&latitude=lte.${bounds.maxLat}`;
    url += `&longitude=gte.${bounds.minLng}&longitude=lte.${bounds.maxLng}`;
  }

  if (filters && filters.fee && filters.fee !== 'all') {
    url += `&parking_status=eq.${filters.fee}`;
  }
  url += `&limit=${limit || 200}`;

  try {
    const data = await request(url, 'GET');
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('[Supabase] 营地数据为空，降级到 Mock 数据');
      return JSON.parse(JSON.stringify(MOCK_CAMPS));
    }
    // 补充缺失字段
    return data.map(normalizeCamp);
  } catch (e) {
    console.warn('[Supabase] 营地数据获取失败，降级到 Mock 数据:', e.message);
    return JSON.parse(JSON.stringify(MOCK_CAMPS));
  }
}

/**
 * 获取单个营地详情
 */
async function fetchCampDetail(spotCode) {
  const url = `${config.API_BASE}/camping_spots?spot_code=eq.${spotCode}&select=*`;
  try {
    const data = await request(url, 'GET');
    if (Array.isArray(data) && data.length > 0) {
      return normalizeCamp(data[0]);
    }
    return null;
  } catch (e) {
    const mock = MOCK_CAMPS.find(c => c.spot_code === spotCode);
    return mock || null;
  }
}

/**
 * 获取用户积分
 */
async function getPoints(openid) {
  const url = `${config.API_BASE}/user_points?openid=eq.${openid}`;
  try {
    return await request(url, 'GET');
  } catch (e) {
    return [];
  }
}

/**
 * 每日签到 RPC
 */
async function dailyCheckinApi(openid) {
  const { todayStr } = require('./util');
  const url = `${config.API_BASE}/rpc/daily_checkin`;
  try {
    return await request(url, 'POST', JSON.stringify({
      p_openid: openid,
      p_date: todayStr()
    }));
  } catch (e) {
    return null;
  }
}

/**
 * 扣减积分 RPC
 */
async function deductPointApi(openid, spotCode) {
  const url = `${config.API_BASE}/rpc/deduct_point`;
  try {
    return await request(url, 'POST', JSON.stringify({
      p_openid: openid,
      p_spot_code: spotCode
    }));
  } catch (e) {
    return null;
  }
}

/**
 * 提交新营地
 */
async function submitCampsite(data) {
  const url = `${config.API_BASE}/camping_spots`;
  try {
    return await request(url, 'POST', JSON.stringify(data));
  } catch (e) {
    console.warn('[Supabase] 营地提交失败:', e.message);
    return null;
  }
}

module.exports = {
  request,
  fetchCampsites,
  fetchCampDetail,
  getPoints,
  dailyCheckinApi,
  deductPointApi,
  submitCampsite,
  normalizeCamp
};
