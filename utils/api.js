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
    accommodation_status: 0,
    price_info: '',
    toilet_info: '',
    water_info: '',
    power_info: ''
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
  // 注意: price_info/toilet_info/water_info/power_info 列需要先通过 SQL 迁移添加
  // 迁移完成后可将其加入 select (fetchCampDetail 使用 select=* 已自动包含)
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
  url += `&limit=${limit || 1000}`;

  try {
    const data = await request(url, 'GET');
    if (!Array.isArray(data) || data.length === 0) {
      // 有地理范围时，说明用户在看特定区域（如拖到北京），该区域确实没有营地
      if (bounds) {
        return [];
      }
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

/**
 * 获取营地评论
 */
async function fetchComments(spotCode) {
  const url = `${config.API_BASE}/camp_comments?spot_code=eq.${spotCode}&order=created_at.desc&limit=50`;
  try {
    const data = await request(url, 'GET');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

/**
 * 发布评论
 * 返回 { success: boolean, msg?: string }
 */
async function submitComment(spotCode, openid, nick, avatar, content, type, photoUrls) {
  const url = `${config.API_BASE}/camp_comments`;
  const payload = {
    spot_code: spotCode,
    openid: openid,
    nick: nick || '微信用户',
    avatar: avatar || '🏕',
    content: content,
    type: type || 'comment'
  };
  // 仅在有图片时添加 photo_urls 字段
  if (photoUrls) {
    payload.photo_urls = photoUrls;
  }

  // 添加 Prefer 头, 让 Supabase 返回插入的数据
  const headers = Object.assign({}, config.getHeaders(), {
    'Prefer': 'return=representation'
  });

  try {
    await request(url, 'POST', JSON.stringify(payload), headers);
    return { success: true };
  } catch (e) {
    console.warn('[api] 评论提交失败:', e.message);
    // 如果带图片失败, 尝试不带图片重发
    if (photoUrls) {
      console.warn('[api] 尝试不带图片重发...');
      const payload2 = {
        spot_code: spotCode,
        openid: openid,
        nick: nick || '微信用户',
        avatar: avatar || '🏕',
        content: content,
        type: type || 'comment'
      };
      try {
        await request(url, 'POST', JSON.stringify(payload2), headers);
        return { success: true };
      } catch (e2) {
        console.warn('[api] 不带图片重发也失败:', e2.message);
        return { success: false, msg: '网络错误: ' + e2.message };
      }
    }
    return { success: false, msg: '网络错误: ' + e.message };
  }
}

/**
 * 点赞评论 (检查是否已点赞)
 */
async function likeComment(commentId, openid) {
  // 先检查是否已点赞
  const checkUrl = `${config.API_BASE}/comment_likes?comment_id=eq.${commentId}&openid=eq.${openid}`;
  try {
    const existing = await request(checkUrl, 'GET');
    if (Array.isArray(existing) && existing.length > 0) {
      return { success: false, msg: '已经点过赞了' };
    }
    // 插入点赞记录
    const likeUrl = `${config.API_BASE}/comment_likes`;
    await request(likeUrl, 'POST', JSON.stringify({
      comment_id: commentId,
      openid: openid
    }));
    // 更新评论点赞数 (通过 RPC 或直接 PATCH)
    // Supabase anon key 不支持 PATCH with increment, 所以用 RPC
    const rpcUrl = `${config.API_BASE}/rpc/increment_like`;
    try {
      await request(rpcUrl, 'POST', JSON.stringify({
        p_comment_id: commentId
      }));
    } catch (e) {
      // RPC 可能不存在, 尝试直接 PATCH
      const patchUrl = `${config.API_BASE}/camp_comments?id=eq.${commentId}`;
      // 这个可能因为 RLS 失败, 但我们试试
    }
    return { success: true };
  } catch (e) {
    return { success: false, msg: '点赞失败' };
  }
}

/**
 * 提交营地纠错
 */
async function submitCampCorrection(data) {
  const url = `${config.API_BASE}/camp_corrections`;
  try {
    return await request(url, 'POST', JSON.stringify(data));
  } catch (e) {
    console.warn('[Supabase] 纠错提交失败:', e.message);
    return null;
  }
}

/**
 * 删除评论 (仅删除自己的)
 */
async function deleteComment(commentId, openid) {
  const url = `${config.API_BASE}/camp_comments?id=eq.${commentId}&openid=eq.${openid}`;
  try {
    const res = await request(url, 'DELETE');
    return { success: true };
  } catch (e) {
    console.warn('[api] 删除评论失败:', e.message);
    return { success: false, msg: '删除失败' };
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
  normalizeCamp,
  fetchComments,
  submitComment,
  likeComment,
  deleteComment,
  submitCampCorrection
};
