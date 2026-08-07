-- ========================================
-- 营地数据表 - 添加缺失的列
-- 在 Supabase Dashboard > SQL Editor 中执行
-- ========================================

-- 添加 3 个缺失的文本列 (toilet_info 已存在)
ALTER TABLE map.camping_spots
  ADD COLUMN IF NOT EXISTS price_info TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS water_info TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS power_info TEXT DEFAULT '';

-- 验证列是否添加成功
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_schema = 'map'
  AND table_name = 'camping_spots'
  AND column_name IN ('price_info', 'toilet_info', 'water_info', 'power_info',
                       'dining_status', 'grocery_status', 'accommodation_status')
ORDER BY column_name;
