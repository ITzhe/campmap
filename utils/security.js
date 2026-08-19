// utils/security.js — 微信内容安全检测
// 对所有 UGC 内容（文本、图片）进行安全检测
// 依赖 Supabase Edge Function 代理调用微信 security API

const config = require('./config');

// 缓存 access_token (有效期 2 小时, 提前 5 分钟刷新)
let _accessToken = '';
let _tokenExpireAt = 0;

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

  try {
    const res = await callSecurityAPI('text', {
      content: text,
      openid: openid || ''
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

    // API 调用失败时, 降级放行 (fail-open)
    // 原因: Edge Function 可能未部署或 access_token 未配置
    // 拦截所有内容会导致用户无法正常使用
    console.warn('[security] msgSecCheck 返回异常, 降级放行:', res.errcode, res.errmsg);
    return { safe: true, reason: '' };
  } catch (e) {
    console.error('[security] 文本检测失败, 降级放行:', e.message);
    return { safe: true, reason: '' };
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

  try {
    const res = await callSecurityAPI('image', {
      media_url: imageUrl,
      openid: openid || ''
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

    console.warn('[security] imgSecCheck 返回异常, 降级放行:', res.errcode, res.errmsg);
    return { safe: true, reason: '' };
  } catch (e) {
    console.error('[security] 图片检测失败, 降级放行:', e.message);
    return { safe: true, reason: '' };
  }
}

/**
 * 批量检测多张图片
 * @param {string[]} imageUrls - 图片 URL 数组
 * @param {string} openid - 用户 openid
 * @returns {Promise<{safe: boolean, reason: string}>}
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
 */
function callSecurityAPI(checkType, data) {
  const url = config.SUPABASE_URL + '/functions/v1/security-check';

  return new Promise((resolve) => {
    wx.request({
      url: url,
      method: 'POST',
      header: {
        'Authorization': 'Bearer ' + config.ANON_KEY,
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
          resolve({ errcode: -1, errmsg: 'Edge Function 返回异常: ' + res.statusCode });
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
 * @returns {Promise<boolean>} true=合规, false=违规
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
 * @returns {Promise<boolean>} true=合规, false=违规
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
  checkImageWithToast
};
