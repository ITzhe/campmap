-- ============================================================
-- 批量更新安营评分的 RPC 函数
-- ============================================================
-- 用法：通过 Supabase RPC 调用，传入 JSON 数组
-- SELECT map.batch_update_anying_score('[
--   {"spot_code":"CS001","overnight_score":4.2,"overnight_status":1,"noise_level":2,"safety_level":4,"signal_level":0,"ground_type":0,"overnight_data_source":"facility_calculated"},
--   {"spot_code":"CS002","overnight_score":3.5,"overnight_status":2,"noise_level":3,"safety_level":3,"signal_level":0,"ground_type":0,"overnight_data_source":"facility_calculated"}
-- ]'::jsonb);
-- ============================================================

CREATE OR REPLACE FUNCTION map.batch_update_anying_score(p_scores JSONB)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH input_rows AS (
        SELECT
            (elem->>'spot_code')::VARCHAR AS spot_code,
            (elem->>'overnight_score')::NUMERIC(2,1) AS overnight_score,
            (elem->>'overnight_status')::SMALLINT AS overnight_status,
            (elem->>'noise_level')::SMALLINT AS noise_level,
            (elem->>'safety_level')::SMALLINT AS safety_level,
            (elem->>'signal_level')::SMALLINT AS signal_level,
            (elem->>'ground_type')::SMALLINT AS ground_type,
            (elem->>'overnight_data_source')::VARCHAR(30) AS overnight_data_source
        FROM jsonb_array_elements(p_scores) AS elem
    )
    UPDATE map.camping_spots s
    SET
        overnight_score = i.overnight_score,
        overnight_status = i.overnight_status,
        noise_level = i.noise_level,
        safety_level = i.safety_level,
        signal_level = i.signal_level,
        ground_type = i.ground_type,
        overnight_data_source = i.overnight_data_source
    FROM input_rows i
    WHERE s.spot_code = i.spot_code;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 授权给 anon 角色（Supabase 默认的匿名访问角色）
GRANT EXECUTE ON FUNCTION map.batch_update_anying_score(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION map.batch_update_anying_score(JSONB) TO authenticated;
