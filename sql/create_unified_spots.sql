-- ============================================================
-- 创建 unified_spots 统一营地表
-- 在 Supabase Dashboard -> SQL Editor 中执行本文件
--
-- 说明:
--   将 camping_spots（安营）和 dongyingdi_spots（懂营地）的数据
--   合并到一张统一表中，前端只需查询一张表。
--   去重合并逻辑由 Python 脚本 merge_to_unified.py 完成。
--   执行本 SQL 后，再运行 Python 脚本填充数据。
-- ============================================================

-- ============ 1. 创建表 ============
CREATE TABLE IF NOT EXISTS map.unified_spots (
  -- 主键
  spot_code VARCHAR(100) PRIMARY KEY,

  -- 基础信息
  name VARCHAR(200) NOT NULL DEFAULT '',
  longitude DOUBLE PRECISION NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  address TEXT DEFAULT '',
  intro TEXT DEFAULT '',
  memo TEXT DEFAULT '',

  -- 停车收费 (0=免费 1=收费)
  parking_status SMALLINT DEFAULT 0,
  price_info TEXT DEFAULT '',

  -- 设施字段 (0=无 1=有)
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

  -- 设施描述信息
  toilet_info TEXT DEFAULT '',
  water_info TEXT DEFAULT '',
  power_info TEXT DEFAULT '',

  -- 过夜友好度评分
  overnight_score NUMERIC(2,1) DEFAULT 0,
  overnight_status SMALLINT DEFAULT 0,
  noise_level SMALLINT DEFAULT 0,
  safety_level SMALLINT DEFAULT 0,
  signal_level SMALLINT DEFAULT 0,
  ground_type SMALLINT DEFAULT 0,

  -- 评分来源
  overnight_data_source VARCHAR(50) DEFAULT '',
  score_source VARCHAR(50) DEFAULT '',

  -- 懂营地维字符串 (dim_noise / dim_safety)
  dim_noise VARCHAR(20) DEFAULT '',
  dim_safety VARCHAR(20) DEFAULT '',

  -- 数据来源追踪
  source_type VARCHAR(20) DEFAULT '',      -- 'anying' / 'dyd' / 'merged'
  original_spot_code VARCHAR(100),          -- 安营原始 spot_code
  dyd_id INTEGER,                           -- 懂营地原始 id (用于查 dongyingdi_comments)
  merged_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============ 2. 索引 ============
CREATE INDEX IF NOT EXISTS idx_unified_spots_geo ON map.unified_spots(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_unified_spots_dyd_id ON map.unified_spots(dyd_id) WHERE dyd_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_unified_spots_source ON map.unified_spots(source_type);

-- ============ 3. 权限 ============
GRANT SELECT ON map.unified_spots TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON map.unified_spots TO anon, authenticated;
GRANT USAGE ON SCHEMA map TO anon, authenticated;

-- ============ 4. RLS ============
ALTER TABLE map.unified_spots ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'map' AND tablename = 'unified_spots' AND policyname = 'allow_read_unified'
    ) THEN
        CREATE POLICY "allow_read_unified" ON map.unified_spots
            FOR SELECT USING (true);
    END IF;
END $$;

-- 允许写入 (合并脚本通过 anon key 批量写入)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'map' AND tablename = 'unified_spots' AND policyname = 'allow_write_unified'
    ) THEN
        CREATE POLICY "allow_write_unified" ON map.unified_spots
            FOR INSERT WITH CHECK (true);
    END IF;
END $$;

-- 允许更新 (评分重算等)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'map' AND tablename = 'unified_spots' AND policyname = 'allow_update_unified'
    ) THEN
        CREATE POLICY "allow_update_unified" ON map.unified_spots
            FOR UPDATE USING (true);
    END IF;
END $$;

-- 允许删除 (合并脚本先 truncate 再写入)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'map' AND tablename = 'unified_spots' AND policyname = 'allow_delete_unified'
    ) THEN
        CREATE POLICY "allow_delete_unified" ON map.unified_spots
            FOR DELETE USING (true);
    END IF;
END $$;

-- ============ 5. 验证 ============
SELECT
    t.tablename,
    t.rowsecurity AS rls_enabled,
    COUNT(p.policyname) AS policy_count,
    has_table_privilege('anon', 'map.' || t.tablename, 'SELECT') AS anon_can_select
FROM pg_tables t
LEFT JOIN pg_policies p ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'map'
    AND t.tablename = 'unified_spots'
GROUP BY t.tablename, t.rowsecurity;
