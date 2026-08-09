-- ============================================================
-- 营地相册表 — 用户上传营地照片
-- Schema: map
-- 在 Supabase Dashboard -> SQL Editor 中执行本文件
-- ============================================================

-- 营地相册表
CREATE TABLE IF NOT EXISTS map.camp_photos (
  id BIGSERIAL PRIMARY KEY,
  spot_code VARCHAR(50) NOT NULL,
  openid VARCHAR(100),
  photo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_camp_photos_spot ON map.camp_photos(spot_code);

-- RLS 策略
ALTER TABLE map.camp_photos ENABLE ROW LEVEL SECURITY;

-- 允许匿名读取营地照片
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'camp_photos' AND policyname = 'allow_read_photos'
  ) THEN
    CREATE POLICY "allow_read_photos" ON map.camp_photos FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'camp_photos' AND policyname = 'allow_insert_photos'
  ) THEN
    CREATE POLICY "allow_insert_photos" ON map.camp_photos FOR INSERT WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'map' AND tablename = 'camp_photos' AND policyname = 'allow_delete_photos'
  ) THEN
    CREATE POLICY "allow_delete_photos" ON map.camp_photos FOR DELETE USING (true);
  END IF;
END $$;

-- GRANT 权限
GRANT SELECT, INSERT, DELETE ON map.camp_photos TO anon, authenticated;

-- 序列权限 (允许 anon 获取自增 ID)
GRANT USAGE, SELECT ON SEQUENCE map.camp_photos_id_seq TO anon, authenticated;

-- 刷新 PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- 验证
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'map' AND table_name = 'camp_photos'
ORDER BY ordinal_position;
