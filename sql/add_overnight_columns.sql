-- ========================================
-- 营地数据表 - 添加过夜友好度相关字段
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ========================================

-- 添加 5 个核心过夜属性字段
ALTER TABLE map.camping_spots
  -- 能否过夜: 0=未知/待确认, 1=可以过夜, 2=不可过夜, 3=临时停车不推荐过夜
  ADD COLUMN IF NOT EXISTS overnight_status SMALLINT DEFAULT 0,
  -- 噪音等级: 0=未知, 1=非常安静, 2=较安静, 3=一般, 4=较吵, 5=很吵
  ADD COLUMN IF NOT EXISTS noise_level SMALLINT DEFAULT 0,
  -- 安全程度: 0=未知, 1=很不安全, 2=不太安全, 3=一般, 4=较安全, 5=非常安全
  ADD COLUMN IF NOT EXISTS safety_level SMALLINT DEFAULT 0,
  -- 手机信号: 0=未知, 1=无信号, 2=很差, 3=一般, 4=较好, 5=很好
  ADD COLUMN IF NOT EXISTS signal_level SMALLINT DEFAULT 0,
  -- 地面类型: 0=未知, 1=硬化路面(平整), 2=碎石, 3=草地, 4=泥地, 5=沙土, 6=斜坡不平
  ADD COLUMN IF NOT EXISTS ground_type SMALLINT DEFAULT 0,
  -- 过夜友好度综合评分 (0-5星, 保留一位小数, 0=未评分)
  ADD COLUMN IF NOT EXISTS overnight_score NUMERIC(2,1) DEFAULT 0,
  -- 过夜数据来源: keyword=关键词提取, type=场地类型推断, manual=人工复核, user=用户贡献
  ADD COLUMN IF NOT EXISTS overnight_data_source VARCHAR(20) DEFAULT '';

-- 添加索引 (过夜评分和过夜状态是高频筛选条件)
CREATE INDEX IF NOT EXISTS idx_camping_spots_overnight_score
  ON map.camping_spots (overnight_score DESC);
CREATE INDEX IF NOT EXISTS idx_camping_spots_overnight_status
  ON map.camping_spots (overnight_status);

-- 验证列是否添加成功
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'map'
  AND table_name = 'camping_spots'
  AND column_name IN (
    'overnight_status', 'noise_level', 'safety_level',
    'signal_level', 'ground_type', 'overnight_score',
    'overnight_data_source'
  )
ORDER BY column_name;
