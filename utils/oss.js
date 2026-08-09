// oss.js — 阿里云 OSS 上传工具
// 测试阶段: bucket 为公共读写, 无需签名认证
// 使用 PUT 方式直接上传文件到 OSS

const config = require('./config');

/**
 * 上传文件到 OSS
 * @param {string} filePath - 本地文件路径 (wx.chooseMedia/wx.chooseImage 返回的 tempFilePath)
 * @param {string} folder - OSS 存储目录, 如 'avatars', 'camps', 'corrections'
 * @param {string} ext - 文件扩展名, 如 'jpg', 'png'
 * @returns {Promise<string>} - 上传成功后的文件完整 URL
 */
function uploadToOSS(filePath, folder, ext) {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error('文件路径为空'));
      return;
    }

    // 生成唯一文件名: 目录/时间戳_随机数.扩展名
    const fileName = Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + (ext || 'jpg');
    const key = (folder || 'uploads') + '/' + fileName;
    const uploadUrl = config.OSS.BASE_URL + '/' + key;

    // 根据扩展名设置 Content-Type
    const contentType = _getContentType(ext);

    // 读取文件为 ArrayBuffer, 然后用 PUT 上传
    const fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: filePath,
      success: (readRes) => {
        wx.request({
          url: uploadUrl,
          method: 'PUT',
          header: {
            'Content-Type': contentType
          },
          data: readRes.data,
          success: (res) => {
            if (res.statusCode === 200) {
              console.log('[OSS] 上传成功:', uploadUrl);
              resolve(uploadUrl);
            } else {
              console.error('[OSS] 上传失败, statusCode:', res.statusCode, res.data);
              reject(new Error('上传失败: HTTP ' + res.statusCode));
            }
          },
          fail: (err) => {
            console.error('[OSS] 请求失败:', err);
            reject(new Error('网络请求失败: ' + (err.errMsg || '未知错误')));
          }
        });
      },
      fail: (err) => {
        console.error('[OSS] 读取文件失败:', err);
        reject(new Error('读取文件失败: ' + (err.errMsg || '未知错误')));
      }
    });
  });
}

/**
 * 批量上传文件到 OSS
 * @param {Array<string>} filePaths - 本地文件路径数组
 * @param {string} folder - OSS 存储目录
 * @returns {Promise<Array<string>>} - 上传成功后的 URL 数组
 */
async function uploadBatchToOSS(filePaths, folder) {
  if (!filePaths || filePaths.length === 0) return [];

  const results = [];
  for (const fp of filePaths) {
    try {
      const ext = _guessExt(fp);
      const url = await uploadToOSS(fp, folder, ext);
      results.push(url);
    } catch (e) {
      console.warn('[OSS] 批量上传中某文件失败:', e.message);
      results.push(null);
    }
  }
  return results;
}

/**
 * 从 URL 或文件路径中猜测扩展名
 */
function _guessExt(filePath) {
  if (!filePath) return 'jpg';
  const lower = filePath.toLowerCase();
  if (lower.indexOf('.png') > -1) return 'png';
  if (lower.indexOf('.jpeg') > -1) return 'jpg';
  if (lower.indexOf('.jpg') > -1) return 'jpg';
  if (lower.indexOf('.gif') > -1) return 'gif';
  if (lower.indexOf('.webp') > -1) return 'webp';
  return 'jpg';
}

/**
 * 根据扩展名获取 Content-Type
 */
function _getContentType(ext) {
  const map = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };
  return map[(ext || 'jpg').toLowerCase()] || 'image/jpeg';
}

module.exports = {
  uploadToOSS,
  uploadBatchToOSS
};
