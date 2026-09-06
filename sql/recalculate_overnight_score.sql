-- ============================================================
-- 实时评分重算 RPC 函数
-- ============================================================
-- 用途：用户打卡评价后，实时重算营地过夜友好度评分
-- 调用方式：SELECT map.recalculate_overnight_score('spot_code_value');
--
-- 评分公式（第二阶段，用户评价加权）：
--   最终评分 = 用户评价加权分 × W_user + 设施基础分 × W_facility
--
--   权重表（按打卡评价数）：
--     0 条    → 0%  / 100%（纯设施估算）
--     1-3 条  → 30% / 70%
--     4-10 条 → 50% / 50%
--     11-30 条 → 70% / 30%
--     30+ 条  → 85% / 15%
--
--   时间衰减：
--     近3个月 ×1.0, 3-6个月 ×0.8, 6-12个月 ×0.6, 1年以上 ×0.4
--
--   用户评价加权分（满分5.0）：
--     总体评分 × 0.5 + 噪音维度 × 0.25 + 安全维度 × 0.25
-- ============================================================

CREATE OR REPLACE FUNCTION map.recalculate_overnight_score(p_spot_code TEXT)
RETURNS JSONB AS $$
DECLARE
    v_review_count INTEGER;
    v_weighted_rating NUMERIC(4,2);
    v_weighted_noise NUMERIC(4,2);
    v_weighted_safety NUMERIC(4,2);
    v_total_weight NUMERIC(6,2);
    v_facility_score NUMERIC(2,1);
    v_user_score NUMERIC(2,1);
    v_w_user NUMERIC(3,2);
    v_w_facility NUMERIC(3,2);
    v_final_score NUMERIC(2,1);
    v_status SMALLINT;
    v_is_dyd BOOLEAN;
    v_dyd_id INTEGER;
    v_noise_text VARCHAR(20);
    v_safety_text VARCHAR(20);
BEGIN
    -- 判断是哪个表
    v_is_dyd := p_spot_code LIKE 'dyd_%';

    -- 获取打卡评价统计（带时间衰减加权平均）
    SELECT
        COUNT(*)::INTEGER,
        COALESCE(SUM(rating * 
            CASE
                WHEN created_at > NOW() - INTERVAL '3 months' THEN 1.0
                WHEN created_at > NOW() - INTERVAL '6 months' THEN 0.8
                WHEN created_at > NOW() - INTERVAL '12 months' THEN 0.6
                ELSE 0.4
            END
        ) / NULLIF(SUM(
            CASE
                WHEN created_at > NOW() - INTERVAL '3 months' THEN 1.0
                WHEN created_at > NOW() - INTERVAL '6 months' THEN 0.8
                WHEN created_at > NOW() - INTERVAL '12 months' THEN 0.6
                ELSE 0.4
            END
        ), 0), 0)::NUMERIC(4,2),
        COALESCE(SUM(noise_level *
            CASE
                WHEN created_at > NOW() - INTERVAL '3 months' THEN 1.0
                WHEN created_at > NOW() - INTERVAL '6 months' THEN 0.8
                WHEN created_at > NOW() - INTERVAL '12 months' THEN 0.6
                ELSE 0.4
            END
        ) / NULLIF(SUM(
            CASE
                WHEN created_at > NOW() - INTERVAL '3 months' THEN 1.0
                WHEN created_at > NOW() - INTERVAL '6 months' THEN 0.8
                WHEN created_at > NOW() - INTERVAL '12 months' THEN 0.6
                ELSE 0.4
            END
        ), 0), 0)::NUMERIC(4,2),
        COALESCE(SUM(safety_level *
            CASE
                WHEN created_at > NOW() - INTERVAL '3 months' THEN 1.0
                WHEN created_at > NOW() - INTERVAL '6 months' THEN 0.8
                WHEN created_at > NOW() - INTERVAL '12 months' THEN 0.6
                ELSE 0.4
            END
        ) / NULLIF(SUM(
            CASE
                WHEN created_at > NOW() - INTERVAL '3 months' THEN 1.0
                WHEN created_at > NOW() - INTERVAL '6 months' THEN 0.8
                WHEN created_at > NOW() - INTERVAL '12 months' THEN 0.6
                ELSE 0.4
            END
        ), 0), 0)::NUMERIC(4,2)
    INTO v_review_count, v_weighted_rating, v_weighted_noise, v_weighted_safety
    FROM map.camp_comments
    WHERE spot_code = p_spot_code
      AND type = 'checkin'
      AND rating IS NOT NULL
      AND rating > 0;

    -- 如果没有评价，不更新
    IF v_review_count IS NULL OR v_review_count = 0 THEN
        RETURN jsonb_build_object('success', true, 'message', 'no reviews, no update');
    END IF;

    -- 获取设施基础分
    IF v_is_dyd THEN
        v_dyd_id := substring(p_spot_code from 5)::INTEGER;
        SELECT overnight_score INTO v_facility_score
        FROM map.dongyingdi_spots WHERE id = v_dyd_id;
    ELSE
        SELECT overnight_score INTO v_facility_score
        FROM map.camping_spots WHERE spot_code = p_spot_code;
    END IF;

    v_facility_score := COALESCE(v_facility_score, 0);

    -- 计算用户评价加权分（满分5.0）
    -- noise_level: 1=安静, 2=一般, 3=吵 → 映射到5分: 5 - (n-1)*2 = 5,3,1
    -- safety_level: 1=安全, 2=一般, 3=需注意 → 映射到5分: 5 - (s-1)*2 = 5,3,1
    v_user_score := LEAST(5.0, GREATEST(0,
        v_weighted_rating * 0.5 +
        (5.0 - (v_weighted_noise - 1) * 2) * 0.25 +
        (5.0 - (v_weighted_safety - 1) * 2) * 0.25
    ));
    v_user_score := ROUND(v_user_score::NUMERIC(2,1), 1);

    -- 根据评价数量确定权重
    IF v_review_count <= 3 THEN
        v_w_user := 0.30; v_w_facility := 0.70;
    ELSIF v_review_count <= 10 THEN
        v_w_user := 0.50; v_w_facility := 0.50;
    ELSIF v_review_count <= 30 THEN
        v_w_user := 0.70; v_w_facility := 0.30;
    ELSE
        v_w_user := 0.85; v_w_facility := 0.15;
    END IF;

    -- 混合评分
    v_final_score := ROUND(
        (v_user_score * v_w_user + v_facility_score * v_w_facility)::NUMERIC(2,1),
        1
    );
    v_final_score := LEAST(5.0, GREATEST(0, v_final_score));

    -- 计算过夜状态
    IF v_final_score >= 3.5 THEN
        v_status := 1;  -- 可以过夜
    ELSIF v_final_score >= 2.5 THEN
        v_status := 2;  -- 勉强能住
    ELSE
        v_status := 3;  -- 不建议过夜
    END IF;

    -- 计算噪音/安全文本（基于用户评价平均）
    IF v_weighted_noise <= 1.5 THEN
        v_noise_text := '较安静';
    ELSIF v_weighted_noise <= 2.5 THEN
        v_noise_text := '一般';
    ELSE
        v_noise_text := '较吵';
    END IF;

    IF v_weighted_safety <= 1.5 THEN
        v_safety_text := '很安全';
    ELSIF v_weighted_safety <= 2.5 THEN
        v_safety_text := '一般';
    ELSE
        v_safety_text := '需注意';
    END IF;

    -- 更新数据库
    IF v_is_dyd THEN
        UPDATE map.dongyingdi_spots
        SET
            overnight_score = v_final_score,
            overnight_status = v_status,
            dim_noise = v_noise_text,
            dim_safety = v_safety_text,
            score_source = 'user_rated',
            score_updated_at = NOW()
        WHERE id = v_dyd_id;
    ELSE
        UPDATE map.camping_spots
        SET
            overnight_score = v_final_score,
            overnight_status = v_status,
            overnight_data_source = 'user'
        WHERE spot_code = p_spot_code;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'review_count', v_review_count,
        'user_score', v_user_score,
        'facility_score', v_facility_score,
        'final_score', v_final_score,
        'status', v_status,
        'noise', v_noise_text,
        'safety', v_safety_text
    );
END;
$$ LANGUAGE plpgsql VOLATILE;

-- 授权给 anon 和 authenticated 角色
GRANT EXECUTE ON FUNCTION map.recalculate_overnight_score(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION map.recalculate_overnight_score(TEXT) TO authenticated;
