-- camp_corrections.sql — 营地纠错表
-- 在 Supabase SQL Editor 中执行

-- 创建纠错表
CREATE TABLE IF NOT EXISTS map.camp_corrections (
  id BIGSERIAL PRIMARY KEY,
  spot_code VARCHAR(50) NOT NULL,
  openid VARCHAR(100),
  
  -- 纠正后的基本信息
  name VARCHAR(200),
  address TEXT,
  intro TEXT,
  
  -- 纠正后的设施状态
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
  
  -- 纠错照片 (OSS URL, 逗号分隔)
  photo_urls TEXT,
  
  -- 状态: pending / approved / rejected
  status VARCHAR(20) DEFAULT 'pending',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_camp_corrections_spot_code ON map.camp_corrections(spot_code);
CREATE INDEX IF NOT EXISTS idx_camp_corrections_status ON map.camp_corrections(status);
CREATE INDEX IF NOT EXISTS idx_camp_corrections_openid ON map.camp_corrections(openid);

-- 启用 RLS (行级安全)
ALTER TABLE map.camp_corrections ENABLE ROW LEVEL SECURITY;

-- 允许匿名用户插入纠错记录
CREATE POLICY "允许匿名插入纠错" ON map.camp_corrections
  FOR INSERT WITH CHECK (true);

-- 允许匿名用户查询 (可选, 用于管理员查看)
CREATE POLICY "允许匿名查询纠错" ON map.camp_corrections
  FOR SELECT USING (true);

-- 备注:
-- 1. 此表存储用户提交的营地纠错信息
-- 2. 管理员审核通过后, 可将纠错数据合并到 camping_spots 表
-- 3. photo_urls 字段存储阿里云 OSS 图片 URL, 逗号分隔
