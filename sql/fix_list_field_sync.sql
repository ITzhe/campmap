-- ========================================
-- 数据质量修复 - 列表字段与详情字段同步
-- 在 Supabase Dashboard > SQL Editor 中执行
-- 
-- 问题: list_has_* 系列字段与实际 *_status 字段不一致
-- 原因: 采集时可能只更新了详情字段, 没有同步更新列表字段
-- 影响: 用户在列表页看到的"有没有厕所/水/电"信息不准确
-- ========================================

-- 修复前统计
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN (toilet_status = 1) != list_has_toilet THEN 1 ELSE 0 END) AS toilet_mismatch,
  SUM(CASE WHEN (water_status = 1) != list_has_water THEN 1 ELSE 0 END) AS water_mismatch,
  SUM(CASE WHEN (power_status IN (1,4,12,13)) != list_has_power THEN 1 ELSE 0 END) AS power_mismatch,
  SUM(CASE WHEN parking_status != list_price_level THEN 1 ELSE 0 END) AS price_mismatch
FROM map.camping_spots;

-- 1. 同步厕所状态
UPDATE map.camping_spots
SET list_has_toilet = (toilet_status = 1)
WHERE (toilet_status = 1) != list_has_toilet;

-- 2. 同步接水状态
UPDATE map.camping_spots
SET list_has_water = (water_status = 1)
WHERE (water_status = 1) != list_has_water;

-- 3. 同步接电状态 (1=有市电, 4=有市电, 12=有市电, 13=有市电)
UPDATE map.camping_spots
SET list_has_power = (power_status IN (1, 4, 12, 13))
WHERE (power_status IN (1, 4, 12, 13)) != list_has_power;

-- 4. 同步价格等级 (0=免费, 1=收费)
UPDATE map.camping_spots
SET list_price_level = parking_status
WHERE parking_status != list_price_level;

-- 5. 同步车辆类型数组 (list_vehicle_types 是 jsonb 类型)
UPDATE map.camping_spots
SET list_vehicle_types = to_jsonb(ARRAY_REMOVE(ARRAY[
  CASE WHEN rv_friendly = 1 THEN 'rv' ELSE NULL END,
  CASE WHEN trailer_friendly = 1 THEN 'trailer' ELSE NULL END,
  CASE WHEN tent_friendly = 1 THEN 'tent' ELSE NULL END
], NULL)::text[])
WHERE list_vehicle_types::text != to_jsonb(ARRAY_REMOVE(ARRAY[
  CASE WHEN rv_friendly = 1 THEN 'rv' ELSE NULL END,
  CASE WHEN trailer_friendly = 1 THEN 'trailer' ELSE NULL END,
  CASE WHEN tent_friendly = 1 THEN 'tent' ELSE NULL END
], NULL)::text[])::text
   OR list_vehicle_types IS NULL;

-- 修复后验证
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN (toilet_status = 1) != list_has_toilet THEN 1 ELSE 0 END) AS toilet_mismatch,
  SUM(CASE WHEN (water_status = 1) != list_has_water THEN 1 ELSE 0 END) AS water_mismatch,
  SUM(CASE WHEN (power_status IN (1,4,12,13)) != list_has_power THEN 1 ELSE 0 END) AS power_mismatch,
  SUM(CASE WHEN parking_status != list_price_level THEN 1 ELSE 0 END) AS price_mismatch
FROM map.camping_spots;
