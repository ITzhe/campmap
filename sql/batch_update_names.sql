-- 批量更新营地名称的 RPC 函数
-- 接收 JSON 数组 [{spot_code, new_name}, ...]，一次性更新
-- 用法：SELECT map.batch_update_names('[{"spot_code":"xxx","new_name":"新名"}]'::json);

CREATE OR REPLACE FUNCTION map.batch_update_names(updates json)
RETURNS integer AS $$
DECLARE
  item json;
  updated_count integer := 0;
BEGIN
  FOR item IN SELECT * FROM json_array_elements(updates)
  LOOP
    UPDATE map.unified_spots
    SET name = item->>'new_name'
    WHERE spot_code = item->>'spot_code';
    IF FOUND THEN
      updated_count := updated_count + 1;
    END IF;
  END LOOP;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 授权
GRANT EXECUTE ON FUNCTION map.batch_update_names(json) TO anon, authenticated;
