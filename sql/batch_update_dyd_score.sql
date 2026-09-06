-- ============================================================
-- 批量更新懂营地评分的 RPC 函数
-- ============================================================
-- 用法：通过 Supabase RPC 调用，传入 JSON 数组
-- SELECT map.batch_update_dyd_score('[
--   {"id":1,"overnight_score":4.2,"overnight_status":1,"dim_noise":"一般","dim_safety":"很安全","score_source":"facility_calculated"},
--   {"id":2,"overnight_score":3.5,"overnight_status":2,"dim_noise":"较安静","dim_safety":"一般","score_source":"facility_calculated"}
-- ]'::jsonb);
-- ============================================================

CREATE OR REPLACE FUNCTION map.batch_update_dyd_score(p_scores JSONB)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    WITH input_rows AS (
        SELECT
            (elem->>'id')::INTEGER AS id,
            (elem->>'overnight_score')::NUMERIC(2,1) AS overnight_score,
            (elem->>'overnight_status')::SMALLINT AS overnight_status,
            (elem->>'dim_noise')::VARCHAR(20) AS dim_noise,
            (elem->>'dim_safety')::VARCHAR(20) AS dim_safety,
            (elem->>'score_source')::VARCHAR(30) AS score_source,
            (elem->>'score_updated_at')::TIMESTAMPTZ AS score_updated_at
        FROM jsonb_array_elements(p_scores) AS elem
    )
    UPDATE map.dongyingdi_spots s
    SET
        overnight_score = i.overnight_score,
        overnight_status = i.overnight_status,
        dim_noise = i.dim_noise,
        dim_safety = i.dim_safety,
        score_source = i.score_source,
        score_updated_at = i.score_updated_at
    FROM input_rows i
    WHERE s.id = i.id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 授权给 anon 角色（Supabase 默认的匿名访问角色）
GRANT EXECUTE ON FUNCTION map.batch_update_dyd_score(JSONB) TO anon;
GRANT EXECUTE ON FUNCTION map.batch_update_dyd_score(JSONB) TO authenticated;
