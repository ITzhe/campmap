// utils/security.js — 微信内容安全检测
// 对所有 UGC 内容（文本、图片）进行安全检测
// 通过 Supabase Edge Function 代理调用微信 security API
// Edge Function 异常时降级为本地敏感词过滤

const config = require('./config');

// ============ 本地敏感词库 (降级用) ============
const SENSITIVE_WORDS = [
  // 政治敏感
  '法轮功', '六四', '天安门', '反共', '台独', '藏独', '疆独',
  // 色情
  '色情', '黄色', '成人', '裸体', '性服务', '一夜情', '约炮', '嫖娼', 'AV女优',
  // 赌博
  '赌博', '博彩', '地下赌场', '外围彩', '六合彩',
  // 暴力/违禁
  '炸弹', '枪支', '弹药', '杀人', '毒品', '吸毒', '贩毒',
  // 诈骗
  '诈骗', '兼职刷单', '代开发票', '银行卡套现',
  // 其他
  '代孕', '买卖器官', '传销'
];

/**
 * 本地敏感词检测 (降级方案)
 */
function localCheckText(text) {
  if (!text || !text.trim()) return { safe: true, reason: '' };
  const lower = text.toLowerCase();
  for (const word of SENSITIVE_WORDS) {
    if (lower.indexOf(word.toLowerCase()) !== -1) {
      return { safe: false, reason: '内容包含敏感信息' };
    }
  }
  return { safe: true, reason: '' };
}

/**
 * 检测文本内容是否合规
 * @param {string} text - 待检测文本
 * @param {string} openid - 用户 openid
 * @returns {Promise<{safe: boolean, reason: string}>}
 */
async function checkText(text, openid) {
  if (!text || !text.trim()) {
    return { safe: true, reason: '' };
  }

  // openid 为空时跳过 API 调用（个人主体小程序无有效 openid）
  if (!openid) {
    return localCheckText(text);
  }

  try {
    const res = await callSecurityAPI('text', {
      content: text,
      openid: openid
    });

    if (res.errcode === 0) {
      const detail = res.detail && res.detail[0];
      if (detail && detail.label !== 100) {
        // label 100 = 正常, 其他为违规
        return {
          safe: false,
          reason: mapLabelToReason(detail.label)
        };
      }
      return { safe: true, reason: '' };
    } else if (res.errcode === 87014) {
      return { safe: false, reason: '内容包含违规信息' };
    }

    // API 返回异常码, 降级为本地检测
    console.warn('[security] msgSecCheck 返回异常, 降级本地检测:', res.errcode, res.errmsg);
    return localCheckText(text);
  } catch (e) {
    console.error('[security] 文本检测失败, 降级本地检测:', e.message);
    return localCheckText(text);
  }
}

/**
 * 检测图片内容是否合规
 * @param {string} imageUrl - 图片 URL (已上传到 OSS 的可访问 URL)
 * @param {string} openid - 用户 openid
 * @returns {Promise<{safe: boolean, reason: string}>}
 */
async function checkImage(imageUrl, openid) {
  if (!imageUrl) {
    return { safe: true, reason: '' };
  }

  // openid 为空时跳过 API 调用（个人主体小程序无有效 openid）
  if (!openid) {
    console.warn('[security] 无 openid, 图片检测降级放行');
    return { safe: true, reason: '' };
  }

  try {
    const res = await callSecurityAPI('image', {
      media_url: imageUrl,
      openid: openid
    });

    if (res.errcode === 0) {
      const detail = res.detail && res.detail[0];
      if (detail && detail.label !== 100) {
        return {
          safe: false,
          reason: '图片包含违规内容'
        };
      }
      return { safe: true, reason: '' };
    } else if (res.errcode === 87014) {
      return { safe: false, reason: '图片包含违规内容' };
    }

    // 图片检测降级: 直接放行 (无法本地检测图片)
    console.warn('[security] imgSecCheck 返回异常, 降级放行:', res.errcode, res.errmsg);
    return { safe: true, reason: '' };
  } catch (e) {
    console.error('[security] 图片检测失败, 降级放行:', e.message);
    return { safe: true, reason: '' };
  }
}

/**
 * 批量检测多张图片
 */
async function checkImages(imageUrls, openid) {
  if (!imageUrls || imageUrls.length === 0) {
    return { safe: true, reason: '' };
  }

  for (const url of imageUrls) {
    const result = await checkImage(url, openid);
    if (!result.safe) {
      return result;
    }
  }
  return { safe: true, reason: '' };
}

/**
 * 调用 Supabase Edge Function 代理微信安全 API
 * 新版 Edge Runtime 通过 ?apikey= 传递凭证, 避免 Authorization header 被网关拦截
 */
function callSecurityAPI(checkType, data) {
  const url = config.SUPABASE_URL + '/functions/v1/security-check?apikey=' + config.ANON_KEY;

  return new Promise((resolve) => {
    wx.request({
      url: url,
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        type: checkType,
        ...data
      },
      success: (res) => {
        if (res.statusCode === 200 && res.data) {
          resolve(res.data);
        } else {
          resolve({ errcode: -1, errmsg: 'Edge Function HTTP ' + res.statusCode });
        }
      },
      fail: (err) => {
        resolve({ errcode: -1, errmsg: err.errMsg || '网络请求失败' });
      }
    });
  });
}

/**
 * 将微信 label 映射为用户可读的违规原因
 */
function mapLabelToReason(label) {
  const map = {
    10001: '广告内容',
    20001: '时政内容',
    20002: '色情内容',
    20003: '辱骂内容',
    20006: '违法犯罪内容',
    20008: '欺诈内容',
    20012: '低俗内容',
    20013: '版权内容',
    30001: '黑产内容',
    21000: '其他违规内容'
  };
  return map[label] || '违规内容';
}

/**
 * 检测文本并在违规时弹出提示
 */
async function checkTextWithToast(text, openid) {
  const result = await checkText(text, openid);
  if (!result.safe) {
    wx.showModal({
      title: '内容提醒',
      content: '您发布的内容含违规信息（' + result.reason + '），请修改后重新提交。',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#2d6a4f'
    });
  }
  return result.safe;
}

/**
 * 检测图片并在违规时弹出提示
 */
async function checkImageWithToast(imageUrl, openid) {
  const result = await checkImage(imageUrl, openid);
  if (!result.safe) {
    wx.showModal({
      title: '图片提醒',
      content: '您上传的图片含违规信息，请更换后重新提交。',
      showCancel: false,
      confirmText: '我知道了',
      confirmColor: '#2d6a4f'
    });
  }
  return result.safe;
}

module.exports = {
  checkText,
  checkImage,
  checkImages,
  checkTextWithToast,
  checkImageWithToast,
  localCheckText
};
