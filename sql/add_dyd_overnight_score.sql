-- ============================================================
-- 懂营地营地点位 - 新增过夜友好度评分字段
-- ============================================================

-- 新增评分相关字段
ALTER TABLE map.dongyingdi_spots
    ADD COLUMN IF NOT EXISTS overnight_score   NUMERIC(2, 1) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS overnight_status  SMALLINT      DEFAULT 0,
    ADD COLUMN IF NOT EXISTS dim_noise         VARCHAR(20)   DEFAULT '',
    ADD COLUMN IF NOT EXISTS dim_safety        VARCHAR(20)   DEFAULT '',
    ADD COLUMN IF NOT EXISTS score_source      VARCHAR(30)   DEFAULT '',
    ADD COLUMN IF NOT EXISTS score_updated_at  TIMESTAMPTZ;

-- 建索引（按评分排序、过滤常用）
CREATE INDEX IF NOT EXISTS idx_dyd_overnight_score
    ON map.dongyingdi_spots (overnight_score DESC);

CREATE INDEX IF NOT EXISTS idx_dyd_overnight_status
    ON map.dongyingdi_spots (overnight_status);

-- 说明:
-- overnight_score: 0.0 ~ 5.0，过夜友好度综合评分
-- overnight_status: 0=暂无数据 1=可以过夜 2=勉强能住 3=不建议过夜
-- dim_noise: 噪音估算值（第一阶段基于类型）：很安静/一般/较吵
-- dim_safety: 安全估算值（第一阶段基于设施）：很安全/一般/需注意
-- score_source: facility_calculated / user_rated / anying_imported
