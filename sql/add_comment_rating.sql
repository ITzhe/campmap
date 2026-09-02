-- 给 camp_comments 表增加过夜评价字段
-- 用于用户打卡/评论时提交的过夜体验评分

ALTER TABLE map.camp_comments
ADD COLUMN IF NOT EXISTS rating SMALLINT DEFAULT 0,        -- 总体评分 1-5
ADD COLUMN IF NOT EXISTS noise_level SMALLINT DEFAULT 0,   -- 噪音等级 1-5
ADD COLUMN IF NOT EXISTS safety_level SMALLINT DEFAULT 0,  -- 安全程度 1-5
ADD COLUMN IF NOT EXISTS signal_level SMALLINT DEFAULT 0,  -- 手机信号 1-5
ADD COLUMN IF NOT EXISTS ground_type SMALLINT DEFAULT 0,   -- 地面类型 1-6
ADD COLUMN IF NOT EXISTS overnight_status SMALLINT DEFAULT 0; -- 能否过夜 1/2/3
