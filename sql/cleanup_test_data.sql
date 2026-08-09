-- 清理测试数据
DELETE FROM map.camp_comments WHERE spot_code = 'TEST_PHOTO';
DELETE FROM map.camp_corrections WHERE spot_code = 'TEST_CORR';
DELETE FROM map.comment_likes WHERE openid = 'test_verify';
