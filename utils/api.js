// api.js — Supabase API 封装

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
          // 提取 Supabase 错误详情
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
  // 防爬虫: 必须传入地理范围, 禁止全量查询
  if (!bounds) {
    console.warn('[api] 拒绝无 bounds 的全量查询');
    return [];
  }

  // 只查询数据库中确定存在的字段
  let selectFields = 'spot_code,name,longitude,latitude,parking_status,toilet_status,water_status,power_status,charging_status,address,intro,memo,rv_friendly,trailer_friendly,tent_friendly,shower_status,fishing_status,cooking_status,fire_status,repair_status,grocery_status,dining_status,accommodation_status,overnight_score,overnight_status,noise_level,safety_level,signal_level,ground_type,overnight_data_source';

  let url = `${config.API_BASE}/camping_spots?select=${selectFields}`;

  // 地理范围过滤：只加载可见区域内的营地
  url += `&latitude=gte.${bounds.minLat}&latitude=lte.${bounds.maxLat}`;
  url += `&longitude=gte.${bounds.minLng}&longitude=lte.${bounds.maxLng}`;

  if (filters && filters.fee && filters.fee !== 'all') {
    url += `&parking_status=eq.${filters.fee}`;
  }
  // 最大返回100条, 防止一次性拉取大量数据
  url += `&limit=${Math.min(limit || 100, 100)}`;

  try {
    const data = await request(url, 'GET');
    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }
    // 补充缺失字段
    return data.map(normalizeCamp);
  } catch (e) {
    console.error('[Supabase] 营地数据获取失败:', e.message);
    // 不再降级到 Mock 数据，返回空数组让前端处理
    return [];
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

// ======================== 懂营地数据 (dongyingdi_spots) ========================

/**
 * 懂营地数据字段映射到标准营地格式
 * dongyingdi_spots 字段名与 camping_spots 有差异，统一映射
 */
function normalizeDydCamp(camp) {
  if (!camp) return null;
  const normalized = Object.assign({}, camp, {
    spot_code: 'dyd_' + camp.id,       // 前缀 id 作为 spot_code
    source: 'dyd',
    parking_status: camp.is_fee != null ? camp.is_fee : 0,  // is_fee → parking_status
    cooking_status: camp.cook_friendly || 0,               // cook_friendly → cooking_status
  });
  // 补全 camping_spots 有但 dongyingdi_spots 没有的字段
  return normalizeCamp(normalized);
}

/**
 * 获取懂营地列表 (带地理范围过滤)
 * @param {Object} bounds - {minLat, maxLat, minLng, maxLng}
 * @param {number} limit - 返回数量限制
 */
async function fetchDydCampsites(bounds, limit) {
  if (!bounds) return [];

  const selectFields = 'id,name,longitude,latitude,address,is_fee,toilet_status,' +
    'water_status,power_status,tent_friendly,trailer_friendly,cook_friendly,' +
    'dining_status,shower_status,fishing_status,overnight_score,overnight_status,' +
    'dim_noise,dim_safety,score_source';

  let url = `${config.API_BASE}/dongyingdi_spots?select=${selectFields}`;
  url += `&latitude=gte.${bounds.minLat}&latitude=lte.${bounds.maxLat}`;
  url += `&longitude=gte.${bounds.minLng}&longitude=lte.${bounds.maxLng}`;
  url += `&limit=${Math.min(limit || 100, 100)}`;

  try {
    const data = await request(url, 'GET');
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map(normalizeDydCamp).filter(Boolean);
  } catch (e) {
    console.error('[Supabase] 懂营地数据获取失败:', e.message);
    return [];
  }
}

/**
 * 获取懂营地单个详情
 * @param {string|number} id - dongyingdi_spots.id
 */
async function fetchDydCampDetail(id) {
  const url = `${config.API_BASE}/dongyingdi_spots?id=eq.${id}&select=*`;
  try {
    const data = await request(url, 'GET');
    if (Array.isArray(data) && data.length > 0) {
      return normalizeDydCamp(data[0]);
    }
    return null;
  } catch (e) {
    console.error('[Supabase] 懂营地详情获取失败:', e.message);
    return null;
  }
}

/**
 * 搜索懂营地
 * @param {string} keyword - 搜索关键词
 */
async function searchDydCamps(keyword) {
  const selectFields = 'id,name,longitude,latitude,address,is_fee,toilet_status,' +
    'water_status,power_status,tent_friendly,trailer_friendly,cook_friendly,' +
    'dining_status,overnight_score,overnight_status';
  const url = `${config.API_BASE}/dongyingdi_spots?select=${selectFields}` +
    `&or=(name.ilike.*${encodeURIComponent(keyword)}*,address.ilike.*${encodeURIComponent(keyword)}*)&limit=50`;
  try {
    const data = await request(url, 'GET');
    if (!Array.isArray(data)) return [];
    return data.map(normalizeDydCamp).filter(Boolean);
  } catch (e) {
    console.error('[Supabase] 懂营地搜索失败:', e.message);
    return [];
  }
}

// ======================== 双数据源去重合并 ========================

/**
 * 设施字段列表（用于合并时取并集）
 */
var FAC_FIELDS = [
  'toilet_status', 'water_status', 'power_status', 'charging_status',
  'rv_friendly', 'trailer_friendly', 'tent_friendly', 'shower_status',
  'fishing_status', 'cooking_status', 'fire_status', 'repair_status',
  'grocery_status', 'dining_status', 'accommodation_status'
];

/**
 * 计算两点间距离（米）
 */
function distMeters(lat1, lng1, lat2, lng2) {
  var R = 6371000;
  var toR = function(d) { return d * Math.PI / 180; };
  var dLat = toR(lat2 - lat1);
  var dLng = toR(lng2 - lng1);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toR(lat1)) * Math.cos(toR(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * 名称相似度（基于 Jaccard 字符集）
 * 设计文稿要求 > 80% 作为辅助验证
 */
function nameSimilarity(a, b) {
  if (!a || !b) return 0;
  // 去除常见后缀后比较
  var clean = function(s) {
    return (s || '').replace(/[停车场停车区服务区驿站景区]/g, '');
  };
  var ca = clean(a), cb = clean(b);
  if (!ca || !cb) return 0;
  if (ca.indexOf(cb) > -1 || cb.indexOf(ca) > -1) return 1;
  // Jaccard 字符集相似度
  var setA = new Set(ca.split(''));
  var setB = new Set(cb.split(''));
  var intersection = 0;
  setA.forEach(function(c) { if (setB.has(c)) intersection++; });
  var union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 合并两个重复营地
 * primary 已有更完整数据，secondary 补充缺失字段
 */
function mergeTwoCamps(primary, secondary) {
  var merged = Object.assign({}, primary);

  // 设施字段取并集（任一来源有则标记为有）
  for (var i = 0; i < FAC_FIELDS.length; i++) {
    var f = FAC_FIELDS[i];
    if (Number(secondary[f]) > 0 && !Number(merged[f])) {
      merged[f] = secondary[f];
    }
  }

  // 如果主记录没有过夜评分，用副记录的
  if (!Number(merged.overnight_score) && Number(secondary.overnight_score)) {
    merged.overnight_score = secondary.overnight_score;
    merged.overnight_status = secondary.overnight_status;
    merged.dim_noise = secondary.dim_noise || '';
    merged.dim_safety = secondary.dim_safety || '';
    merged.score_source = secondary.score_source || '';
    merged.overnight_data_source = secondary.overnight_data_source || '';
    merged.noise_level = secondary.noise_level || 0;
    merged.safety_level = secondary.safety_level || 0;
    merged.signal_level = secondary.signal_level || 0;
    merged.ground_type = secondary.ground_type || 0;
    // 评分来自副记录，详情页应查副记录的表
    merged.spot_code = secondary.spot_code;
    merged.source = secondary.source;
  }

  // 名称取更完整的
  if (secondary.name && (!merged.name || secondary.name.length > merged.name.length)) {
    merged.name = secondary.name;
  }
  // 地址取更完整的
  if (secondary.address && (!merged.address || secondary.address.length > merged.address.length)) {
    merged.address = secondary.address;
  }
  // 简介/备注/价格取非空的
  if (secondary.intro && !merged.intro) merged.intro = secondary.intro;
  if (secondary.memo && !merged.memo) merged.memo = secondary.memo;
  if (secondary.price_info && !merged.price_info) merged.price_info = secondary.price_info;

  return merged;
}

/**
 * 双数据源营地去重
 * 根据 GPS 距离判断是否为同一地点，合并重复项
 * @param {Array} camps - 安营 + 懂营地混合列表
 * @returns {Array} 去重合并后的列表
 */
function deduplicateCamps(camps) {
  var MERGE_RADIUS = 200; // 200 米内视为同一地点
  var NAME_SIM_THRESHOLD = 0.3; // 名称相似度低于此值时不合并
  if (!Array.isArray(camps) || camps.length === 0) return camps;

  // 按过夜评分降序排（有评分的优先作为主记录）
  var sorted = camps.slice().sort(function(a, b) {
    return (Number(b.overnight_score) || 0) - (Number(a.overnight_score) || 0);
  });

  var merged = [];
  for (var i = 0; i < sorted.length; i++) {
    var camp = sorted[i];
    var foundDup = false;
    for (var j = 0; j < merged.length; j++) {
      var d = distMeters(
        camp.latitude, camp.longitude,
        merged[j].latitude, merged[j].longitude
      );
      if (d <= MERGE_RADIUS) {
        // 辅助验证：名称相似度（设计文稿要求 > 80%）
        // 如果两个营地都有名称但完全不相似（< 30%），可能是相邻的不同营地
        var sim = nameSimilarity(camp.name, merged[j].name);
        if (sim < NAME_SIM_THRESHOLD && camp.name && merged[j].name
            && camp.name.length >= 4 && merged[j].name.length >= 4) {
          // 名称差异太大，跳过合并
          continue;
        }
        merged[j] = mergeTwoCamps(merged[j], camp);
        foundDup = true;
        break;
      }
    }
    if (!foundDup) {
      merged.push(camp);
    }
  }

  if (merged.length < sorted.length) {
    console.log('[dedup] 去重:', sorted.length, '→', merged.length, '（合并', sorted.length - merged.length, '条重复）');
  }

  return merged;
}

/**
 * 实时重算营地过夜评分（用户打卡后调用）
 * 调用 Supabase RPC 函数，按设计文稿第二阶段公式重算
 * @param {string} spotCode - 营地编码
 * @returns {Object} 重算结果 { success, final_score, status, ... }
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
 * @param {string} spotCode - 营地编码
 * @param {string} openid - 用户openid
 * @param {string} nick - 昵称
 * @param {string} avatar - 头像
 * @param {string} content - 评论内容
 * @param {string} type - 类型 comment/checkin
 * @param {string} photoUrls - 图片URL逗号分隔
 * @param {Object} rating - 过夜评价 { rating, noise_level, safety_level, signal_level, ground_type, overnight_status }
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
  // 仅在有图片时添加 photo_urls 字段
  if (photoUrls) {
    payload.photo_urls = photoUrls;
  }
  // 添加过夜评价字段
  if (rating) {
    if (rating.rating) payload.rating = rating.rating;
    if (rating.noise_level) payload.noise_level = rating.noise_level;
    if (rating.safety_level) payload.safety_level = rating.safety_level;
    if (rating.signal_level) payload.signal_level = rating.signal_level;
    if (rating.ground_type) payload.ground_type = rating.ground_type;
    if (rating.overnight_status) payload.overnight_status = rating.overnight_status;
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

/**
 * 获取营地照片
 */
async function fetchCampPhotos(spotCode) {
  const url = `${config.API_BASE}/camp_photos?spot_code=eq.${spotCode}&order=created_at.desc&limit=30`;
  try {
    const data = await request(url, 'GET');
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

/**
 * 上传营地照片记录
 */
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

/**
 * 删除营地照片 (仅删除自己的)
 */
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
  fetchDydCampsites,
  fetchCampDetail,
  fetchDydCampDetail,
  searchDydCamps,
  deduplicateCamps,
  recalculateScore,
  getPoints,
  dailyCheckinApi,
  deductPointApi,
  submitCampsite,
  normalizeCamp,
  normalizeDydCamp,
  fetchComments,
  submitComment,
  likeComment,
  deleteComment,
  submitCampCorrection,
  fetchCampPhotos,
  submitCampPhoto,
  deleteCampPhoto
};
