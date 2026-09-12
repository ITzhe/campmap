-- ============================================================
-- 创建 truncate_unified_spots RPC 函数
-- 用于快速清空 unified_spots 表（比 DELETE 全表快得多，不会超时）
-- 在 Supabase Dashboard -> SQL Editor 中执行本文件
-- ============================================================

CREATE OR REPLACE FUNCTION map.truncate_unified_spots()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  TRUNCATE TABLE map.unified_spots;
END;
$$;

-- 授予执行权限
GRANT EXECUTE ON FUNCTION map.truncate_unified_spots() TO anon, authenticated;
