-- auto_approve_correction.sql — 纠错自动审核触发器
-- 在 Supabase SQL Editor 中执行
-- 功能：用户提交纠错后，自动将更新同步到 unified_spots 主表，并标记为已审核

-- ============== 自动审核函数 ==============
CREATE OR REPLACE FUNCTION map.auto_approve_correction()
RETURNS TRIGGER AS $$
DECLARE
    v_spot_code VARCHAR(50);
    v_name VARCHAR(200);
    v_address TEXT;
    v_intro TEXT;
    v_parking_status SMALLINT;
    v_toilet_status SMALLINT;
    v_water_status SMALLINT;
    v_power_status SMALLINT;
    v_charging_status SMALLINT;
    v_rv_friendly SMALLINT;
    v_trailer_friendly SMALLINT;
    v_tent_friendly SMALLINT;
    v_shower_status SMALLINT;
    v_fishing_status SMALLINT;
    v_cooking_status SMALLINT;
    v_fire_status SMALLINT;
    v_repair_status SMALLINT;
    v_grocery_status SMALLINT;
    v_dining_status SMALLINT;
    v_accommodation_status SMALLINT;
    v_photo_urls TEXT;
BEGIN
    -- 只处理 pending 状态的新记录
    IF NEW.status != 'pending' THEN
        RETURN NEW;
    END IF;

    v_spot_code := NEW.spot_code;

    -- 检查主表是否存在该营地
    IF NOT EXISTS (SELECT 1 FROM map.unified_spots WHERE spot_code = v_spot_code) THEN
        -- 主表不存在，不做处理，状态保持 pending（等待人工处理）
        RETURN NEW;
    END IF;

    -- 构建动态更新语句（只更新非空字段）
    -- 注意：状态字段 0 和 1 都是有效值，需要判断是否有修改
    -- 这里简化处理：直接用纠错数据覆盖主表对应字段
    -- 因为前端提交时会带上所有设施字段，未修改的也会带上当前值

    UPDATE map.unified_spots SET
        name = COALESCE(NULLIF(NEW.name, ''), name),
        address = COALESCE(NULLIF(NEW.address, ''), address),
        intro = COALESCE(NULLIF(NEW.intro, ''), intro),
        parking_status = COALESCE(NEW.parking_status, parking_status),
        toilet_status = COALESCE(NEW.toilet_status, toilet_status),
        water_status = COALESCE(NEW.water_status, water_status),
        power_status = COALESCE(NEW.power_status, power_status),
        charging_status = COALESCE(NEW.charging_status, charging_status),
        rv_friendly = COALESCE(NEW.rv_friendly, rv_friendly),
        trailer_friendly = COALESCE(NEW.trailer_friendly, trailer_friendly),
        tent_friendly = COALESCE(NEW.tent_friendly, tent_friendly),
        shower_status = COALESCE(NEW.shower_status, shower_status),
        fishing_status = COALESCE(NEW.fishing_status, fishing_status),
        cooking_status = COALESCE(NEW.cooking_status, cooking_status),
        fire_status = COALESCE(NEW.fire_status, fire_status),
        repair_status = COALESCE(NEW.repair_status, repair_status),
        grocery_status = COALESCE(NEW.grocery_status, grocery_status),
        dining_status = COALESCE(NEW.dining_status, dining_status),
        accommodation_status = COALESCE(NEW.accommodation_status, accommodation_status)
    WHERE spot_code = v_spot_code;

    -- 更新纠错记录状态为 approved
    NEW.status := 'approved';
    NEW.updated_at := NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============== 创建触发器 ==============
DROP TRIGGER IF EXISTS trigger_auto_approve_correction ON map.camp_corrections;

CREATE TRIGGER trigger_auto_approve_correction
BEFORE INSERT ON map.camp_corrections
FOR EACH ROW
EXECUTE FUNCTION map.auto_approve_correction();

-- ============== 说明 ==============
-- 1. 用户提交纠错时，状态默认是 pending
-- 2. 触发器在 INSERT 之前执行，自动将纠错数据同步到 unified_spots 主表
-- 3. 同步成功后，将纠错记录状态改为 approved
-- 4. 如果主表中不存在该营地，状态保持 pending（等待人工处理）
-- 5. 只有非空的 name/address/intro 字段才会覆盖，设施字段总是覆盖（0/1 都有效）
