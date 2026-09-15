-- 随机化爬取评论的用户昵称
-- 直接在数据库端执行，比逐条 API 调用快几百倍
-- 用法: SELECT map.randomize_comment_nicknames('dongyingdi_comments');

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


-- 主函数：批量随机化指定表的 user_nickname
-- 参数: table_name - 表名 ('dongyingdi_comments' 或 'anying_comments')
-- 返回: 更新的记录数
CREATE OR REPLACE FUNCTION map.randomize_comment_nicknames(table_name text)
RETURNS integer AS $$
DECLARE
    total_count integer;
    updated_count integer := 0;
    batch_size integer := 5000;
    offset_val integer := 0;
    sql text;
BEGIN
    -- 验证表名，防止 SQL 注入
    IF table_name NOT IN ('dongyingdi_comments', 'anying_comments') THEN
        RAISE EXCEPTION '无效的表名: %', table_name;
    END IF;

    -- 获取总记录数
    EXECUTE format('SELECT COUNT(*) FROM map.%I', table_name) INTO total_count;
    RAISE NOTICE '开始处理表: %, 总记录数: %', table_name, total_count;

    IF total_count = 0 THEN
        RETURN 0;
    END IF;

    -- 分批更新
    WHILE offset_val < total_count LOOP
        -- 构造批量更新 SQL：用子查询取一批 id，逐条生成随机昵称
        -- 注意：必须保证每行独立调用 random()，所以用 LATERAL 或子查询
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

        offset_val := offset_val + batch_size;
        RAISE NOTICE '进度: %/% (%)',
            LEAST(offset_val, total_count),
            total_count,
            ROUND(LEAST(offset_val, total_count)::numeric / total_count * 100, 0)::text || '%';

        -- 提交当前事务（如果在事务块外运行）
        -- 注意：函数内不能 COMMIT，调用者需自己管理事务
    END LOOP;

    RAISE NOTICE '表 % 处理完成，共更新 % 条', table_name, total_count;
    RETURN total_count;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 授权
GRANT EXECUTE ON FUNCTION map.randomize_comment_nicknames(text) TO anon, authenticated;
