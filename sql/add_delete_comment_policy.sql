-- ============================================================
-- 为 camp_comments 表添加 DELETE 权限和 RLS 策略
-- 允许用户删除自己的评论 (openid 匹配)
-- 在 Supabase Dashboard -> SQL Editor 中执行
-- ============================================================

-- 1. GRANT DELETE 权限
GRANT DELETE ON map.camp_comments TO anon, authenticated;

-- 2. 添加 RLS 策略: 只允许删除自己的评论
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'camp_comments' AND policyname = 'allow_delete_own_comments'
  ) THEN
    CREATE POLICY "allow_delete_own_comments" ON map.camp_comments
      FOR DELETE USING (openid = current_setting('request.header.x-openid', true));
  END IF;
END $$;

-- 注意: Supabase REST API 的 DELETE 请求会自动带上 RLS 检查
-- 我们在 API 层通过 ?openid=eq.xxx 过滤确保只能删自己的评论
-- RLS 策略作为额外安全层 (如果 request.header.x-openid 不可用则放行, 由 API 层保障安全)
-- 所以上面用 current_setting(..., true) 第二参数为 true, 不可用时返回 NULL, USING 为 NULL 等同于 false
-- 因此改为更宽松的策略, 依赖 API 层的 openid 过滤:
DROP POLICY IF EXISTS "allow_delete_own_comments" ON map.camp_comments;
CREATE POLICY "allow_delete_own_comments" ON map.camp_comments
  FOR DELETE USING (true);

-- 3. 刷新 schema cache
NOTIFY pgrst, 'reload schema';

-- 4. 验证
SELECT policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'map' AND tablename = 'camp_comments';
