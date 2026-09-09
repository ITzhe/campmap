-- ============================================================
-- 修复 dongyingdi_spots 和 dongyingdi_comments 表权限
-- 在 Supabase Dashboard -> SQL Editor 中执行本文件
--
-- 问题说明:
--   dongyingdi_spots 表有 ~21000 条数据（score 脚本已确认），
--   dongyingdi_comments 表有 ~268890 条评论数据，
--   但 dongyingdi_spots 缺少 anon 角色的 GRANT SELECT 权限和 RLS 策略，
--   导致小程序通过 anon key 查询时返回 0 条记录，
--   懂营地的营地和评论全部不可见。
-- ============================================================

-- ============ 1. dongyingdi_spots 表权限 ============

-- GRANT SELECT 权限
GRANT SELECT ON map.dongyingdi_spots TO anon, authenticated;

-- 启用 RLS
ALTER TABLE map.dongyingdi_spots ENABLE ROW LEVEL SECURITY;

-- 创建 SELECT 策略（允许所有人读取）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'map' AND tablename = 'dongyingdi_spots' AND policyname = 'allow_read_dyd_spots'
    ) THEN
        CREATE POLICY "allow_read_dyd_spots" ON map.dongyingdi_spots
            FOR SELECT USING (true);
    END IF;
END $$;

-- ============ 2. dongyingdi_comments 表权限 ============

-- GRANT SELECT 权限
GRANT SELECT ON map.dongyingdi_comments TO anon, authenticated;

-- 启用 RLS
ALTER TABLE map.dongyingdi_comments ENABLE ROW LEVEL SECURITY;

-- 创建 SELECT 策略（允许所有人读取）
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'map' AND tablename = 'dongyingdi_comments' AND policyname = 'allow_read_dyd_comments'
    ) THEN
        CREATE POLICY "allow_read_dyd_comments" ON map.dongyingdi_comments
            FOR SELECT USING (true);
    END IF;
END $$;

-- ============ 3. 验证 ============
SELECT
    t.tablename,
    t.rowsecurity AS rls_enabled,
    COUNT(p.policyname) AS policy_count,
    has_table_privilege('anon', 'map.' || t.tablename, 'SELECT') AS anon_can_select
FROM pg_tables t
LEFT JOIN pg_policies p ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'map'
    AND t.tablename IN ('dongyingdi_spots', 'dongyingdi_comments', 'camping_spots')
GROUP BY t.tablename, t.rowsecurity
ORDER BY t.tablename;
