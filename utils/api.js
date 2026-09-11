// api.js — Supabase API 封装
// 统一使用 unified_spots 单表查询（数据由 merge_to_unified.py 脚本预合并）

const config = require('./config');
const { MOCK_CAMPS } = require('./mock');

/**
 * 通用 wx.request Promise 封装
 * 错误时包含 Supabase 返回的具体错误信息
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
          let errMsg = 'HTTP ' + res.statusCode;
          if (res.data) {
            if (typeof res.data === 'string') {
              errMsg += ': ' + res.data.slice(0, 200);
            } else if (res.data.message) {
              errMsg += ': ' + res.data.message;
            } else {
              errMsg += ': ' + JSON.stringify(res.data).slice(0, 200);
            }
          }
          console.error('[api] 请求失败:', url, errMsg, res.data);
          reject(new Error(errMsg));
        }
      },
      fail: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * 为营地数据补充缺失字段
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
    power_info: '',
    dim_noise: '',
    dim_safety: ''
  };
  return Object.assign({}, defaults, camp);
}

/**
 * 获取营地列表 (从 unified_spots 单表查询)
 * @param {Object} filters - 筛选条件
 * @param {Object} bounds - 地理范围 {minLat, maxLat, minLng, maxLng}
 * @param {number} limit - 返回数量限制
 */
async function fetchCampsites(filters, bounds, limit) {
  if (!bounds) {
    console.warn('[api] 拒绝无 bounds 的全量查询');
    return [];
  }

  let selectFields = 'spot_code,name,longitude,latitude,parking_status,toilet_status,water_status,power_status,charging_status,address,intro,memo,rv_friendly,trailer_friendly,tent_friendly,shower_status,fishing_status,cooking_status,fire_status,repair_status,grocery_status,dining_status,accommodation_status,overnight_score,overnight_status,noise_level,safety_level,signal_level,ground_type,overnight_data_source,score_source,dim_noise,dim_safety,dyd_id,source_type';

  let url = `${config.API_BASE}/unified_spots?select=${selectFields}`;

  // 地理范围过滤
  url += `&latitude=gte.${bounds.minLat}&latitude=lte.${bounds.maxLat}`;
  url += `&longitude=gte.${bounds.minLng}&longitude=lte.${bounds.maxLng}`;

  if (filters && filters.fee && filters.fee !== 'all') {
    url += `&parking_status=eq.${filters.fee}`;
  }
  url += `&limit=${limit || 5000}`;

  try {
    const data = await request(url, 'GET');
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    return data.map(normalizeCamp);
  } catch (e) {
    console.error('[Supabase] 营地数据获取失败:', e.message);
    return [];
  }
}

/**
 * 获取单个营地详情 (从 unified_spots 查询)
 * @param {string} spotCode - 营地编码
 */
async function fetchCampDetail(spotCode) {
  const url = `${config.API_BASE}/unified_spots?spot_code=eq.${spotCode}&select=*`;
  try {
    const data = await request(url, 'GET');
    if (Array.isArray(data) && data.length > 0) {
      return normalizeCamp(data[0]);
    }
    return null;
  } catch (e) {
    console.error('[Supabase] 营地详情获取失败:', e.message);
    const mock = MOCK_CAMPS.find(c => c.spot_code === spotCode);
    return mock || null;
  }
}

/**
 * 搜索营地 (从 unified_spots 查询)
 * @param {string} keyword - 搜索关键词
 */
async function searchCamps(keyword) {
  const selectFields = 'spot_code,name,longitude,latitude,address,parking_status,overnight_score,overnight_status,dyd_id,source_type';
  const url = `${config.API_BASE}/unified_spots?select=${selectFields}` +
    `&or=(name.ilike.*${encodeURIComponent(keyword)}*,address.ilike.*${encodeURIComponent(keyword)}*)&limit=50`;
  try {
    const data = await request(url, 'GET');
    if (!Array.isArray(data)) return [];
    return data.map(normalizeCamp);
  } catch (e) {
    console.error('[Supabase] 营地搜索失败:', e.message);
    return [];
  }
}

// ======================== 评论 ========================

/**
 * 获取营地评论 (本站)
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
 * 获取懂营地导入的评论
 * 从 dongyingdi_comments 表读取
 * @param {number} campId - unified_spots.dyb_id 字段
 */
async function fetchDydComments(campId) {
  if (!campId) return [];
  const url = `${config.API_BASE}/dongyingdi_comments?camp_id=eq.${campId}&order=comment_time.desc&limit=50`;
  try {
    const data = await request(url, 'GET');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.error('[Supabase] 懂营地评论获取失败:', e.message);
    return [];
  }
}

/**
 * 发布评论
 */
async function submitComment(spotCode, openid, nick, avatar, content, type, photoUrls, rating) {
  const url = `${config.API_BASE}/camp_comments`;
  const payload = {
    spot_code: spotCode,
    openid: openid,
    nick: nick || '微信用户',
    avatar: avatar || '🏕',
    content: content,
    type: type || 'comment'
  };
  if (photoUrls) {
    payload.photo_urls = photoUrls;
  }
  if (rating) {
    if (rating.rating) payload.rating = rating.rating;
    if (rating.noise_level) payload.noise_level = rating.noise_level;
    if (rating.safety_level) payload.safety_level = rating.safety_level;
    if (rating.signal_level) payload.signal_level = rating.signal_level;
    if (rating.ground_type) payload.ground_type = rating.ground_type;
    if (rating.overnight_status) payload.overnight_status = rating.overnight_status;
  }

  const headers = Object.assign({}, config.getHeaders(), {
    'Prefer': 'return=representation'
  });

  try {
    await request(url, 'POST', JSON.stringify(payload), headers);
    return { success: true };
  } catch (e) {
    console.warn('[api] 评论提交失败:', e.message);
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
      if (rating) {
        if (rating.rating) payload2.rating = rating.rating;
        if (rating.noise_level) payload2.noise_level = rating.noise_level;
        if (rating.safety_level) payload2.safety_level = rating.safety_level;
        if (rating.signal_level) payload2.signal_level = rating.signal_level;
        if (rating.ground_type) payload2.ground_type = rating.ground_type;
        if (rating.overnight_status) payload2.overnight_status = rating.overnight_status;
      }
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
 * 点赞评论
 */
async function likeComment(commentId, openid) {
  const checkUrl = `${config.API_BASE}/comment_likes?comment_id=eq.${commentId}&openid=eq.${openid}`;
  try {
    const existing = await request(checkUrl, 'GET');
    if (Array.isArray(existing) && existing.length > 0) {
      return { success: false, msg: '已经点过赞了' };
    }
    const likeUrl = `${config.API_BASE}/comment_likes`;
    await request(likeUrl, 'POST', JSON.stringify({
      comment_id: commentId,
      openid: openid
    }));
    const rpcUrl = `${config.API_BASE}/rpc/increment_like`;
    try {
      await request(rpcUrl, 'POST', JSON.stringify({
        p_comment_id: commentId
      }));
    } catch (e) {
      // RPC 可能不存在
    }
    return { success: true };
  } catch (e) {
    return { success: false, msg: '点赞失败' };
  }
}

/**
 * 删除评论 (仅删除自己的)
 */
async function deleteComment(commentId, openid) {
  const url = `${config.API_BASE}/camp_comments?id=eq.${commentId}&openid=eq.${openid}`;
  try {
    await request(url, 'DELETE');
    return { success: true };
  } catch (e) {
    console.warn('[api] 删除评论失败:', e.message);
    return { success: false, msg: '删除失败' };
  }
}

// ======================== 评分重算 ========================

/**
 * 实时重算营地过夜评分（用户打卡后调用）
 */
async function recalculateScore(spotCode) {
  if (!spotCode) return { success: false, msg: 'spotCode 缺失' };
  const url = `${config.API_BASE}/rpc/recalculate_overnight_score`;
  try {
    const result = await request(url, 'POST', JSON.stringify({
      p_spot_code: spotCode
    }));
    if (result && result.success) {
      console.log('[recalculate] 重算成功:', spotCode,
        '→', result.final_score, '(', result.review_count, '条评价)');
    }
    return result || { success: false };
  } catch (e) {
    console.warn('[recalculate] 重算失败:', e.message);
    return { success: false, msg: e.message };
  }
}

// ======================== 用户积分 ========================

async function getPoints(openid) {
  const url = `${config.API_BASE}/user_points?openid=eq.${openid}`;
  try {
    return await request(url, 'GET');
  } catch (e) {
    return [];
  }
}

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

// ======================== 营地提交/纠错 ========================

async function submitCampsite(data) {
  const url = `${config.API_BASE}/camping_spots`;
  try {
    return await request(url, 'POST', JSON.stringify(data));
  } catch (e) {
    console.warn('[Supabase] 营地提交失败:', e.message);
    return null;
  }
}

async function submitCampCorrection(data) {
  const url = `${config.API_BASE}/camp_corrections`;
  try {
    return await request(url, 'POST', JSON.stringify(data));
  } catch (e) {
    console.warn('[Supabase] 纠错提交失败:', e.message);
    return null;
  }
}

// ======================== 营地照片 ========================

async function fetchCampPhotos(spotCode) {
  const url = `${config.API_BASE}/camp_photos?spot_code=eq.${spotCode}&order=created_at.desc&limit=30`;
  try {
    const data = await request(url, 'GET');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

async function submitCampPhoto(spotCode, openid, photoUrl) {
  const url = `${config.API_BASE}/camp_photos`;
  const headers = Object.assign({}, config.getHeaders(), {
    'Prefer': 'return=representation'
  });
  const payload = {
    spot_code: spotCode,
    openid: openid || '',
    photo_url: photoUrl
  };
  try {
    await request(url, 'POST', JSON.stringify(payload), headers);
    return { success: true };
  } catch (e) {
    console.warn('[api] 营地照片上传失败:', e.message);
    return { success: false, msg: e.message };
  }
}

async function deleteCampPhoto(photoId, openid) {
  const url = `${config.API_BASE}/camp_photos?id=eq.${photoId}&openid=eq.${openid}`;
  try {
    await request(url, 'DELETE');
    return { success: true };
  } catch (e) {
    console.warn('[api] 删除营地照片失败:', e.message);
    return { success: false, msg: '删除失败' };
  }
}

module.exports = {
  request,
  fetchCampsites,
  fetchCampDetail,
  searchCamps,
  recalculateScore,
  getPoints,
  dailyCheckinApi,
  deductPointApi,
  submitCampsite,
  normalizeCamp,
  fetchComments,
  fetchDydComments,
  submitComment,
  likeComment,
  deleteComment,
  submitCampCorrection,
  fetchCampPhotos,
  submitCampPhoto,
  deleteCampPhoto
};
