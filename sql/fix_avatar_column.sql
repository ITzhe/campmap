-- ============================================================
-- 修复 camp_comments 表 avatar 列长度
-- 问题: avatar 列为 VARCHAR(10), 无法存储头像 URL
--   导致评论提交时报 400 错误: "value too long for type character varying(10)"
-- 修复: 将 avatar 列改为 TEXT
-- 在 Supabase Dashboard -> SQL Editor 中执行本文件
-- ============================================================

-- 将 avatar 列从 VARCHAR(10) 改为 TEXT
ALTER TABLE map.camp_comments
  ALTER COLUMN avatar TYPE TEXT;

-- 同时将默认值改为空字符串 (可选)
ALTER TABLE map.camp_comments
  ALTER COLUMN avatar SET DEFAULT '';

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'map'
  AND table_name = 'camp_comments'
ORDER BY ordinal_position;
