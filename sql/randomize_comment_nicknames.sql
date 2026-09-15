-- 随机化爬取评论的用户昵称（分批版本）
-- 每次调用只处理一批，避免 statement timeout
-- 用法: SELECT map.randomize_comment_nicknames_batch('dongyingdi_comments', 0, 20000);
-- 返回: 本批更新的记录数（0 表示处理完了）

-- 姓氏池
CREATE OR REPLACE FUNCTION map._random_surname()
RETURNS text AS $$
DECLARE
    surnames text[] := ARRAY[
        '李','王','张','刘','陈','杨','赵','黄','周','吴',
        '徐','孙','胡','朱','高','林','何','郭','马','罗',
        '梁','宋','郑','谢','韩','唐','冯','于','董','萧',
        '程','曹','袁','邓','许','傅','沈','曾','彭','蒋',
        '蔡','贾','魏','薛','叶','阎','余','潘','杜','戴',
        '夏','钟','汪','田','任','姜','范','方','石','姚',
        '谭','廖','邹','熊','金','陆','郝','龚','裴','贺'
    ];
BEGIN
    RETURN surnames[1 + floor(random() * array_length(surnames, 1))::int];
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 两字名池
CREATE OR REPLACE FUNCTION map._random_given2()
RETURNS text AS $$
DECLARE
    names text[] := ARRAY[
        '伟','芳','娜','敏','静','丽','强','磊','军','洋',
        '勇','艳','杰','娟','涛','明','超','秀英','霞','平',
        '刚','桂英','辉','玲','燕','婷','飞','彬','宇','浩',
        '雨','欣','佳','悦','晨','子涵','子轩','诗','语','梦',
        '瑶','晴','安','帆','远','博','宁','翔','楠','蕊'
    ];
BEGIN
    RETURN names[1 + floor(random() * array_length(names, 1))::int];
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 三字名单字池
CREATE OR REPLACE FUNCTION map._random_given_char()
RETURNS text AS $$
DECLARE
    chars text[] := ARRAY[
        '明','华','军','伟','强','杰','斌','波','辉','龙',
        '飞','鹏','宇','博','远','翔','晨','阳','佳','欣',
        '雨','梦','瑶','晴','悦','诗','语','蕊','燕','娜',
        '敏','静','丽','霞','娟','芳','艳','玲','婷','磊',
        '洋','超','涛','平','刚','宁','彬','浩','帆'
    ];
BEGIN
    RETURN chars[1 + floor(random() * array_length(chars, 1))::int];
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 地区前缀池
CREATE OR REPLACE FUNCTION map._random_region()
RETURNS text AS $$
DECLARE
    regions text[] := ARRAY[
        '北京','上海','广东','山东','江苏','浙江','四川','湖北',
        '湖南','河南','河北','福建','安徽','辽宁','黑龙江','陕西',
        '山西','云南','贵州','广西','甘肃','内蒙古','新疆','西藏',
        '海南','宁夏','青海','吉林','重庆','天津','江西'
    ];
BEGIN
    RETURN regions[1 + floor(random() * array_length(regions, 1))::int];
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 昵称后缀池
CREATE OR REPLACE FUNCTION map._random_nick_suffix()
RETURNS text AS $$
DECLARE
    suffixes text[] := ARRAY[
        '','_房车','_露营','_旅行','_自驾','_户外','_路上','_远方',
        '_行者','_老司机','_车友','_游侠','_背包客','_摩旅','_骑行',
        '_徒步','_摄影','_钓鱼','_探险','_机车'
    ];
BEGIN
    RETURN suffixes[1 + floor(random() * array_length(suffixes, 1))::int];
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 生成随机昵称（4 种风格）
CREATE OR REPLACE FUNCTION map._generate_random_nickname()
RETURNS text AS $$
DECLARE
    style int := floor(random() * 4)::int;
    surname text;
    given text;
    given1 text;
    given2 text;
    region text;
    suffix text;
    num int;
    prefixes text[];
    result text;
BEGIN
    IF style = 0 THEN
        -- 风格0: 地区·姓_数字 (如 "山东·李_5481")
        region := map._random_region();
        surname := map._random_surname();
        num := 1000 + floor(random() * 9000)::int;
        result := region || '·' || surname || '_' || num::text;

    ELSIF style = 1 THEN
        -- 风格1: 姓+两字名 (如 "李伟")
        surname := map._random_surname();
        given := map._random_given2();
        -- 30% 概率加后缀
        IF random() < 0.3 THEN
            suffix := map._random_nick_suffix();
            result := surname || given || suffix;
        ELSE
            result := surname || given;
        END IF;

    ELSIF style = 2 THEN
        -- 风格2: 姓+三字名 (如 "李明华")
        surname := map._random_surname();
        given1 := map._random_given_char();
        given2 := map._random_given_char();
        WHILE given1 = given2 LOOP
            given2 := map._random_given_char();
        END LOOP;
        result := surname || given1 || given2;

    ELSE
        -- 风格3: 网名风格 (如 "远方行者_8842")
        prefixes := ARRAY[
            '远方','路途','山水','星夜','风行','云游','山野',
            '湖畔','林间','海边','草原','行者','旅人','漫游'
        ];
        DECLARE
            suf_arr text[] := ARRAY['行者','旅人','客','侠','人','者','派','帮'];
            pref text := prefixes[1 + floor(random() * array_length(prefixes, 1))::int];
            suf text := suf_arr[1 + floor(random() * array_length(suf_arr, 1))::int];
        BEGIN
            num := 100 + floor(random() * 9900)::int;
            result := pref || suf || '_' || num::text;
        END;
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql VOLATILE;


-- 分批随机化昵称（每次调用只处理一批，独立事务，不会超时）
-- 参数:
--   table_name: 表名 ('dongyingdi_comments' 或 'anying_comments')
--   offset_val: 起始偏移量
--   batch_size: 每批数量 (建议 10000~30000)
-- 返回: 本批实际更新的记录数，0 表示已处理完
CREATE OR REPLACE FUNCTION map.randomize_comment_nicknames_batch(
    table_name text,
    offset_val integer,
    batch_size integer
) RETURNS integer AS $$
DECLARE
    updated_count integer;
    sql text;
BEGIN
    -- 验证表名，防止 SQL 注入
    IF table_name NOT IN ('dongyingdi_comments', 'anying_comments') THEN
        RAISE EXCEPTION '无效的表名: %', table_name;
    END IF;

    -- 每批单独一次 UPDATE，在独立事务中执行
    sql := format(
        'UPDATE map.%I t ' ||
        'SET user_nickname = map._generate_random_nickname() ' ||
        'WHERE id IN ( ' ||
        '    SELECT id FROM map.%I ' ||
        '    ORDER BY id ' ||
        '    LIMIT %s OFFSET %s ' ||
        ')',
        table_name, table_name, batch_size, offset_val
    );

    EXECUTE sql;
    GET DIAGNOSTICS updated_count = ROW_COUNT;

    RETURN updated_count;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 授权
GRANT EXECUTE ON FUNCTION map.randomize_comment_nicknames_batch(text, integer, integer) TO anon, authenticated;


-- 兼容旧函数名（内部调分批版本，但仍可能超时，不推荐用）
CREATE OR REPLACE FUNCTION map.randomize_comment_nicknames(table_name text)
RETURNS integer AS $$
DECLARE
    total_count integer := 0;
    batch_size integer := 20000;
    offset_val integer := 0;
    batch_updated integer;
BEGIN
    -- 验证表名
    IF table_name NOT IN ('dongyingdi_comments', 'anying_comments') THEN
        RAISE EXCEPTION '无效的表名: %', table_name;
    END IF;

    -- 注意：整个函数仍在一个事务中，大数据量可能超时
    -- 推荐使用 randomize_comment_nicknames_batch 在客户端分批调用
    LOOP
        batch_updated := map.randomize_comment_nicknames_batch(table_name, offset_val, batch_size);
        IF batch_updated = 0 THEN
            EXIT;
        END IF;
        total_count := total_count + batch_updated;
        offset_val := offset_val + batch_size;
    END LOOP;

    RETURN total_count;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION map.randomize_comment_nicknames(text) TO anon, authenticated;
