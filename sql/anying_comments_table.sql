-- 安营评论表（从安营 actionlists 提取）
-- 用户名 "安营" 前缀已替换为 "营图"

CREATE TABLE IF NOT EXISTS map.anying_comments (
    id           BIGINT PRIMARY KEY,
    spot_code    TEXT NOT NULL,
    camp_name    TEXT,
    user_nickname TEXT DEFAULT '营图车友',
    content      TEXT NOT NULL DEFAULT '',
    comment_time TIMESTAMPTZ,
    act_type     INT DEFAULT 0,
    source       TEXT DEFAULT 'anying',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 索引：按营地查询评论
CREATE INDEX IF NOT EXISTS idx_anying_comments_spot_code
    ON map.anying_comments (spot_code);

CREATE INDEX IF NOT EXISTS idx_anying_comments_time
    ON map.anying_comments (comment_time DESC);

-- RLS 策略
ALTER TABLE map.anying_comments ENABLE ROW LEVEL SECURITY;

-- 匿名用户可读
CREATE POLICY "anying_comments_read" ON map.anying_comments
    FOR SELECT USING (true);

-- service_role 可写（通过 API key 鉴权）
CREATE POLICY "anying_comments_write" ON map.anying_comments
    FOR INSERT TO service_role WITH CHECK (true);

CREATE POLICY "anying_comments_update" ON map.anying_comments
    FOR UPDATE TO service_role USING (true);

COMMENT ON TABLE map.anying_comments IS '安营平台采集的营地评论，用户名已替换为营图';
