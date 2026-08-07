-- ============================================================
-- 营地评论 / 评价系统 数据库迁移
-- Schema: map
-- 在 Supabase Dashboard -> SQL Editor 中执行本文件
-- ============================================================

-- 营地评论表
CREATE TABLE IF NOT EXISTS map.camp_comments (
  id BIGSERIAL PRIMARY KEY,
  spot_code VARCHAR(20) NOT NULL,
  openid VARCHAR(100) NOT NULL,
  nick VARCHAR(50) DEFAULT '匿名用户',
  avatar VARCHAR(10) DEFAULT '🏕',
  content TEXT NOT NULL,
  type VARCHAR(20) DEFAULT 'comment',  -- comment / checkin
  likes INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 点赞记录表 (防止重复点赞)
CREATE TABLE IF NOT EXISTS map.comment_likes (
  id BIGSERIAL PRIMARY KEY,
  comment_id BIGINT NOT NULL,
  openid VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(comment_id, openid)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_camp_comments_spot ON map.camp_comments(spot_code);
CREATE INDEX IF NOT EXISTS idx_comment_likes ON map.comment_likes(comment_id, openid);

-- RLS 策略
ALTER TABLE map.camp_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE map.comment_likes ENABLE ROW LEVEL SECURITY;

-- 允许匿名读取评论
CREATE POLICY "allow_read_comments" ON map.camp_comments FOR SELECT USING (true);
-- 允许匿名发布评论
CREATE POLICY "allow_insert_comments" ON map.camp_comments FOR INSERT WITH CHECK (true);
-- 允许匿名读取点赞
CREATE POLICY "allow_read_likes" ON map.comment_likes FOR SELECT USING (true);
-- 允许匿名点赞
CREATE POLICY "allow_insert_likes" ON map.comment_likes FOR INSERT WITH CHECK (true);
-- 允许删除自己的点赞 (取消点赞)
CREATE POLICY "allow_delete_likes" ON map.comment_likes FOR DELETE USING (true);

-- ============================================================
-- 点赞数自增函数
-- SECURITY DEFINER: 以函数所有者权限执行, 绕过 RLS
-- (anon key 没有 UPDATE 权限, 通过 RPC 实现点赞数 +1)
-- ============================================================
CREATE OR REPLACE FUNCTION map.increment_like(p_comment_id BIGINT)
RETURNS void AS $$
BEGIN
  UPDATE map.camp_comments SET likes = likes + 1 WHERE id = p_comment_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
