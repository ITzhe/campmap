-- ============================================================
-- 修复数据库权限 + 确保 photo_urls 列存在
-- 在 Supabase Dashboard -> SQL Editor 中执行本文件
--
-- 问题说明:
--   map schema 下的 camp_comments / comment_likes / camp_corrections 表
--   虽然设置了 RLS 策略, 但缺少对 anon 角色的 GRANT 权限
--   导致小程序通过 anon key 访问时返回 42501 permission denied
--   自定义 schema 需要同时设置 RLS 策略 + GRANT 权限
-- ============================================================

-- ============ 0. Schema 级权限 ============
GRANT USAGE ON SCHEMA map TO anon, authenticated;

-- ============ 1. camp_comments 表权限 ============
-- 确保 photo_urls 列存在
ALTER TABLE map.camp_comments
  ADD COLUMN IF NOT EXISTS photo_urls TEXT DEFAULT '';

-- GRANT 表级权限 (RLS 策略允许读写, 但还需要 GRANT)
GRANT SELECT, INSERT ON map.camp_comments TO anon, authenticated;
GRANT UPDATE ON map.camp_comments TO anon, authenticated;

-- 确保 RLS 已启用
ALTER TABLE map.camp_comments ENABLE ROW LEVEL SECURITY;

-- 确保 RLS 策略存在 (幂等, 使用 DO 块避免重复创建报错)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'camp_comments' AND policyname = 'allow_read_comments'
  ) THEN
    CREATE POLICY "allow_read_comments" ON map.camp_comments FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'camp_comments' AND policyname = 'allow_insert_comments'
  ) THEN
    CREATE POLICY "allow_insert_comments" ON map.camp_comments FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ============ 2. comment_likes 表权限 ============
GRANT SELECT, INSERT, DELETE ON map.comment_likes TO anon, authenticated;

ALTER TABLE map.comment_likes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'comment_likes' AND policyname = 'allow_read_likes'
  ) THEN
    CREATE POLICY "allow_read_likes" ON map.comment_likes FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'comment_likes' AND policyname = 'allow_insert_likes'
  ) THEN
    CREATE POLICY "allow_insert_likes" ON map.comment_likes FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'comment_likes' AND policyname = 'allow_delete_likes'
  ) THEN
    CREATE POLICY "allow_delete_likes" ON map.comment_likes FOR DELETE USING (true);
  END IF;
END $$;

-- ============ 3. camp_corrections 表 (纠错表) ============
-- 如果表不存在则创建
CREATE TABLE IF NOT EXISTS map.camp_corrections (
  id BIGSERIAL PRIMARY KEY,
  spot_code VARCHAR(50) NOT NULL,
  openid VARCHAR(100),
  name VARCHAR(200),
  address TEXT,
  intro TEXT,
  parking_status SMALLINT DEFAULT 0,
  toilet_status SMALLINT DEFAULT 0,
  water_status SMALLINT DEFAULT 0,
  power_status SMALLINT DEFAULT 0,
  charging_status SMALLINT DEFAULT 0,
  rv_friendly SMALLINT DEFAULT 0,
  trailer_friendly SMALLINT DEFAULT 0,
  tent_friendly SMALLINT DEFAULT 0,
  shower_status SMALLINT DEFAULT 0,
  fishing_status SMALLINT DEFAULT 0,
  cooking_status SMALLINT DEFAULT 0,
  fire_status SMALLINT DEFAULT 0,
  repair_status SMALLINT DEFAULT 0,
  grocery_status SMALLINT DEFAULT 0,
  dining_status SMALLINT DEFAULT 0,
  accommodation_status SMALLINT DEFAULT 0,
  photo_urls TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_camp_corrections_spot_code ON map.camp_corrections(spot_code);
CREATE INDEX IF NOT EXISTS idx_camp_corrections_status ON map.camp_corrections(status);

-- GRANT 权限
GRANT SELECT, INSERT ON map.camp_corrections TO anon, authenticated;

ALTER TABLE map.camp_corrections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'camp_corrections' AND policyname = 'allow_insert_corrections'
  ) THEN
    CREATE POLICY "allow_insert_corrections" ON map.camp_corrections FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'camp_corrections' AND policyname = 'allow_read_corrections'
  ) THEN
    CREATE POLICY "allow_read_corrections" ON map.camp_corrections FOR SELECT USING (true);
  END IF;
END $$;

-- ============ 4. increment_like 函数权限 ============
GRANT EXECUTE ON FUNCTION map.increment_like(BIGINT) TO anon, authenticated;

-- ============ 5. 刷新 PostgREST schema cache ============
-- 使新表/列/权限立即生效
NOTIFY pgrst, 'reload schema';

-- ============ 6. 验证 ============
-- 列出 camp_comments 表的所有列
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'map' AND table_name = 'camp_comments'
ORDER BY ordinal_position;

-- 列出 map schema 下所有表及其 GRANT 权限
SELECT tablename, grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'map'
  AND grantee IN ('anon', 'authenticated')
ORDER BY tablename, grantee, privilege_type;
