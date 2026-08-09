-- ============================================================
-- 为 camp_comments 表添加 photo_urls 列
-- 支持用户评论上传图片
-- 在 Supabase Dashboard -> SQL Editor 中执行本文件
-- ============================================================

-- 添加 photo_urls 列 (存储图片URL, 逗号分隔)
ALTER TABLE map.camp_comments
  ADD COLUMN IF NOT EXISTS photo_urls TEXT DEFAULT '';

-- 验证列是否添加成功
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'map'
  AND table_name = 'camp_comments'
  AND column_name = 'photo_urls';
