-- ============================================================
-- 修复序列权限 (BIGSERIAL 自增主键)
-- 在 Supabase Dashboard -> SQL Editor 中执行
--
-- 问题: GRANT INSERT ON TABLE 只授权了表本身,
-- 但 BIGSERIAL 的自增序列需要单独 GRANT USAGE, SELECT
-- ============================================================

-- camp_comments 的序列
GRANT USAGE, SELECT ON SEQUENCE map.camp_comments_id_seq TO anon, authenticated;

-- comment_likes 的序列
GRANT USAGE, SELECT ON SEQUENCE map.comment_likes_id_seq TO anon, authenticated;

-- camp_corrections 的序列
GRANT USAGE, SELECT ON SEQUENCE map.camp_corrections_id_seq TO anon, authenticated;

-- 刷新 schema cache
NOTIFY pgrst, 'reload schema';

-- 验证序列权限
SELECT sequence_name, grantee, privilege_type
FROM information_schema.role_usage_grants
WHERE object_schema = 'map'
  AND grantee IN ('anon', 'authenticated')
ORDER BY sequence_name, grantee, privilege_type;
