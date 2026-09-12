"""
统一营地表合并脚本
==================
从 camping_spots（安营）和 dongyingdi_spots（懂营地）读取全量数据，
按 GPS 距离 ≤ 200 米 + 名称相似度做去重合并，
结果写入 map.unified_spots 表。

用法:
  python merge_to_unified.py --dry-run      # 试运行，只统计不写入
  python merge_to_unified.py --apply        # 正式运行，写入数据库
  python merge_to_unified.py --apply --batch 500  # 指定批次大小
"""

import argparse
import math
import time
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import httpx

# ======================== 配置 ========================
SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRya3RkeWZ3YXdwZnVnaHV6cXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyMzYsImV4cCI6MjA5NTI2NTIzNn0.X2KV2LA3ofvhQCTJl3pLIV84VlYSYx0Vf4L3Etr1NEs"

# 去重参数
MERGE_RADIUS = 200  # 米
NAME_SIM_THRESHOLD = 0.3  # 名称相似度低于此值不合并

# 设施字段列表
FAC_FIELDS = [
    "toilet_status", "water_status", "power_status", "charging_status",
    "rv_friendly", "trailer_friendly", "tent_friendly", "shower_status",
    "fishing_status", "cooking_status", "fire_status", "repair_status",
    "grocery_status", "dining_status", "accommodation_status",
]


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ======================== 数据库读取 ========================
def get_headers() -> Dict:
    return {
        "apikey": ANON_KEY,
        "Authorization": f"Bearer {ANON_KEY}",
        "Accept-Profile": "map",
        "Content-Type": "application/json",
    }


def get_write_headers() -> Dict:
    h = get_headers()
    h["Content-Profile"] = "map"
    h["Prefer"] = "return=representation"
    return h


def fetch_all(client: httpx.Client, table: str, fields: str) -> List[Dict]:
    """分页获取全量数据"""
    h = get_headers()
    all_data = []
    offset = 0
    batch = 1000

    # 先获取总数
    r = client.get(
        f"{SUPABASE_URL}/rest/v1/{table}?select=id&limit=1",
        headers={**h, "Prefer": "count=exact"},
        timeout=30,
    )
    range_header = r.headers.get("content-range", "0-0/0")
    try:
        total = int(range_header.split("/")[-1])
    except (ValueError, IndexError):
        total = 0
    log(f"  {table} 总记录数: {total}")

    while True:
        r = client.get(
            f"{SUPABASE_URL}/rest/v1/{table}?select={fields}"
            f"&limit={batch}&offset={offset}&order=id",
            headers=h,
            timeout=60,
        )
        if r.status_code not in (200, 206):
            log(f"  获取失败: {r.status_code} {r.text[:200]}")
            break
        data = r.json()
        if not data:
            break
        all_data.extend(data)
        if len(data) < batch:
            break
        offset += batch
        if offset % 5000 == 0:
            log(f"  已获取 {offset}/{total}...")

    log(f"  实际获取: {len(all_data)} 条")
    return all_data


# ======================== 数据归一化 ========================
def normalize_anying(spot: Dict) -> Dict:
    """安营数据归一化为统一格式"""
    defaults = {f: 0 for f in FAC_FIELDS}
    defaults.update({
        "price_info": "", "toilet_info": "", "water_info": "", "power_info": "",
        "overnight_score": 0, "overnight_status": 0,
        "noise_level": 0, "safety_level": 0, "signal_level": 0, "ground_type": 0,
        "overnight_data_source": "", "score_source": "",
        "dim_noise": "", "dim_safety": "",
    })
    merged = {**defaults, **spot}
    return {
        "spot_code": spot.get("spot_code", ""),
        "name": spot.get("name", ""),
        "longitude": float(spot.get("longitude", 0) or 0),
        "latitude": float(spot.get("latitude", 0) or 0),
        "address": spot.get("address", "") or "",
        "intro": spot.get("intro", "") or "",
        "memo": spot.get("memo", "") or "",
        "parking_status": int(spot.get("parking_status", 0) or 0),
        "price_info": merged["price_info"],
        **{f: int(merged.get(f, 0) or 0) for f in FAC_FIELDS},
        "toilet_info": merged["toilet_info"],
        "water_info": merged["water_info"],
        "power_info": merged["power_info"],
        "overnight_score": float(merged.get("overnight_score", 0) or 0),
        "overnight_status": int(merged.get("overnight_status", 0) or 0),
        "noise_level": int(merged.get("noise_level", 0) or 0),
        "safety_level": int(merged.get("safety_level", 0) or 0),
        "signal_level": int(merged.get("signal_level", 0) or 0),
        "ground_type": int(merged.get("ground_type", 0) or 0),
        "overnight_data_source": merged["overnight_data_source"],
        "score_source": merged["score_source"],
        "dim_noise": merged["dim_noise"],
        "dim_safety": merged["dim_safety"],
        "source_type": "anying",
        "original_spot_code": spot.get("spot_code", ""),
        "dyd_id": None,
    }


def normalize_dyd(spot: Dict) -> Dict:
    """懂营地数据归一化为统一格式"""
    dyd_id = int(spot.get("id", 0) or 0)
    fac_defaults = {f: 0 for f in FAC_FIELDS}
    merged = {**fac_defaults, **spot}

    # 懂营地字段映射
    cooking = int(spot.get("cook_friendly", 0) or 0)
    parking = int(spot.get("is_fee", 0) or 0)

    return {
        "spot_code": f"dyd_{dyd_id}",
        "name": spot.get("name", "") or "",
        "longitude": float(spot.get("longitude", 0) or 0),
        "latitude": float(spot.get("latitude", 0) or 0),
        "address": spot.get("address", "") or "",
        "intro": "",
        "memo": "",
        "parking_status": parking,
        "price_info": "",
        "toilet_status": int(merged.get("toilet_status", 0) or 0),
        "water_status": int(merged.get("water_status", 0) or 0),
        "power_status": int(merged.get("power_status", 0) or 0),
        "charging_status": int(merged.get("charging_status", 0) or 0),
        "rv_friendly": int(merged.get("rv_friendly", 0) or 0),
        "trailer_friendly": int(merged.get("trailer_friendly", 0) or 0),
        "tent_friendly": int(merged.get("tent_friendly", 0) or 0),
        "shower_status": int(merged.get("shower_status", 0) or 0),
        "fishing_status": int(merged.get("fishing_status", 0) or 0),
        "cooking_status": cooking,
        "fire_status": int(merged.get("fire_status", 0) or 0),
        "repair_status": int(merged.get("repair_status", 0) or 0),
        "grocery_status": int(merged.get("grocery_status", 0) or 0),
        "dining_status": int(merged.get("dining_status", 0) or 0),
        "accommodation_status": int(merged.get("accommodation_status", 0) or 0),
        "toilet_info": "",
        "water_info": "",
        "power_info": "",
        "overnight_score": float(spot.get("overnight_score", 0) or 0),
        "overnight_status": int(spot.get("overnight_status", 0) or 0),
        "noise_level": 0,
        "safety_level": 0,
        "signal_level": 0,
        "ground_type": 0,
        "overnight_data_source": spot.get("score_source", "") or "",
        "score_source": spot.get("score_source", "") or "",
        "dim_noise": spot.get("dim_noise", "") or "",
        "dim_safety": spot.get("dim_safety", "") or "",
        "source_type": "dyd",
        "original_spot_code": None,
        "dyd_id": dyd_id,
    }


# ======================== 去重合并 ========================
def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """计算两点间距离（米）"""
    R = 6371000
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lng = to_rad(lng2 - lng1)
    a = (math.sin(d_lat / 2) ** 2
         + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2))
         * math.sin(d_lng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def name_similarity(a: str, b: str) -> float:
    """名称相似度（基于 Jaccard 字符集）"""
    if not a or not b:
        return 0
    import re
    clean_a = re.sub(r"[停车场停车区服务区驿站景区]", "", a)
    clean_b = re.sub(r"[停车场停车区服务区驿站景区]", "", b)
    if not clean_a or not clean_b:
        return 0
    if clean_a in clean_b or clean_b in clean_a:
        return 1.0
    set_a = set(clean_a)
    set_b = set(clean_b)
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0


def merge_two(primary: Dict, secondary: Dict) -> Dict:
    """合并两个重复营地"""
    merged = dict(primary)

    # 设施取并集
    for f in FAC_FIELDS:
        if int(secondary.get(f, 0) or 0) > 0 and not int(merged.get(f, 0) or 0):
            merged[f] = secondary[f]

    # 评分取更高的
    if not float(merged.get("overnight_score", 0) or 0) and float(secondary.get("overnight_score", 0) or 0):
        merged["overnight_score"] = secondary["overnight_score"]
        merged["overnight_status"] = secondary["overnight_status"]
        merged["dim_noise"] = secondary.get("dim_noise", "")
        merged["dim_safety"] = secondary.get("dim_safety", "")
        merged["score_source"] = secondary.get("score_source", "")
        merged["overnight_data_source"] = secondary.get("overnight_data_source", "")
        merged["noise_level"] = secondary.get("noise_level", 0)
        merged["safety_level"] = secondary.get("safety_level", 0)
        merged["signal_level"] = secondary.get("signal_level", 0)
        merged["ground_type"] = secondary.get("ground_type", 0)
        # 评分来自副记录，spot_code 改为副记录的
        merged["spot_code"] = secondary["spot_code"]
        merged["source_type"] = secondary["source_type"]

    # 保留 dyd_id
    if secondary.get("dyd_id") and not merged.get("dyd_id"):
        merged["dyd_id"] = secondary["dyd_id"]
    if primary.get("dyd_id") and not merged.get("dyd_id"):
        merged["dyd_id"] = primary["dyd_id"]

    # 保留 original_spot_code
    if secondary.get("original_spot_code") and not merged.get("original_spot_code"):
        merged["original_spot_code"] = secondary["original_spot_code"]

    # 名称取更完整的
    if secondary.get("name") and (not merged.get("name") or len(secondary["name"]) > len(merged["name"])):
        merged["name"] = secondary["name"]
    # 地址取更完整的
    if secondary.get("address") and (not merged.get("address") or len(secondary["address"]) > len(merged["address"])):
        merged["address"] = secondary["address"]
    # 其他取非空
    if secondary.get("intro") and not merged.get("intro"):
        merged["intro"] = secondary["intro"]
    if secondary.get("memo") and not merged.get("memo"):
        merged["memo"] = secondary["memo"]
    if secondary.get("price_info") and not merged.get("price_info"):
        merged["price_info"] = secondary["price_info"]

    # 如果合并了两个来源的数据，标记为 merged
    if (primary.get("source_type") == "anying" and secondary.get("source_type") == "dyd") or \
       (primary.get("source_type") == "dyd" and secondary.get("source_type") == "anying"):
        merged["source_type"] = "merged"

    return merged


def deduplicate(camps: List[Dict]) -> List[Dict]:
    """GPS 距离 + 名称相似度去重（网格分桶优化）

    算法:
    1. 按过夜评分降序排（有评分的优先作为主记录）
    2. 将营地按经纬度分到网格中（网格大小 = 去重半径）
    3. 每个营地只需与所在网格及相邻 8 个网格内的已有记录比较
    4. 大幅减少比较次数，从 O(n²) 降到接近 O(n)
    """
    if not camps:
        return []

    # 按过夜评分降序排（有评分的优先作为主记录）
    sorted_camps = sorted(camps, key=lambda c: float(c.get("overnight_score", 0) or 0), reverse=True)

    # 网格大小（度）：200 米 ≈ 0.0018 度纬度
    # 经度方向随纬度变化，但保守估计 0.002 度足够
    GRID_SIZE = 0.002

    # 网格字典: (grid_lat, grid_lng) -> list of indices into merged_list
    grid: Dict[Tuple[int, int], List[int]] = {}
    merged_list: List[Dict] = []

    def grid_key(lat: float, lng: float) -> Tuple[int, int]:
        return (int(lat / GRID_SIZE), int(lng / GRID_SIZE))

    for i, camp in enumerate(sorted_camps):
        glat, glng = grid_key(camp["latitude"], camp["longitude"])
        found_dup = False

        # 进度输出（每 5000 条）
        if (i + 1) % 5000 == 0:
            log(f"  去重进度: {i + 1}/{len(sorted_camps)} (已合并 {len(merged_list)} 条)...")

        # 检查 3x3 网格范围内的已有记录
        for dlat in (-1, 0, 1):
            if found_dup:
                break
            for dlng in (-1, 0, 1):
                key = (glat + dlat, glng + dlng)
                if key not in grid:
                    continue
                for idx in grid[key]:
                    existing = merged_list[idx]
                    dist = haversine_meters(
                        camp["latitude"], camp["longitude"],
                        existing["latitude"], existing["longitude"]
                    )
                    if dist <= MERGE_RADIUS:
                        # 名称相似度辅助验证
                        sim = name_similarity(camp.get("name", ""), existing.get("name", ""))
                        if sim < NAME_SIM_THRESHOLD and camp.get("name") and existing.get("name") \
                                and len(camp["name"]) >= 4 and len(existing["name"]) >= 4:
                            continue
                        merged_list[idx] = merge_two(existing, camp)
                        # 合并后主记录位置可能变化，更新网格（简化处理：不移动）
                        found_dup = True
                        break

        if not found_dup:
            idx = len(merged_list)
            merged_list.append(camp)
            key = (glat, glng)
            if key not in grid:
                grid[key] = []
            grid[key].append(idx)

    return merged_list


# ======================== 写入数据库 ========================
def truncate_unified(client: httpx.Client) -> bool:
    """清空 unified_spots 表"""
    h = get_write_headers()
    # Supabase REST API DELETE 需要用 !inner 来绕过 NOT NULL 限制
    # 用不可能匹配的条件来删除所有记录
    r = client.delete(
        f"{SUPABASE_URL}/rest/v1/unified_spots?spot_code=neq.__nonexistent__",
        headers=h,
        timeout=120,
    )
    if r.status_code in (200, 204):
        log("  已清空 unified_spots 表")
        return True
    else:
        log(f"  清空失败: {r.status_code} {r.text[:200]}")
        return False


def write_batch(client: httpx.Client, records: List[Dict]) -> int:
    """批量写入数据"""
    h = get_write_headers()
    # 过滤掉内部字段
    clean_records = []
    for r in records:
        clean_records.append({
            "spot_code": r["spot_code"],
            "name": r["name"],
            "longitude": r["longitude"],
            "latitude": r["latitude"],
            "address": r["address"],
            "intro": r.get("intro", ""),
            "memo": r.get("memo", ""),
            "parking_status": r.get("parking_status", 0),
            "price_info": r.get("price_info", ""),
            **{f: r.get(f, 0) for f in FAC_FIELDS},
            "toilet_info": r.get("toilet_info", ""),
            "water_info": r.get("water_info", ""),
            "power_info": r.get("power_info", ""),
            "overnight_score": r.get("overnight_score", 0),
            "overnight_status": r.get("overnight_status", 0),
            "noise_level": r.get("noise_level", 0),
            "safety_level": r.get("safety_level", 0),
            "signal_level": r.get("signal_level", 0),
            "ground_type": r.get("ground_type", 0),
            "overnight_data_source": r.get("overnight_data_source", ""),
            "score_source": r.get("score_source", ""),
            "dim_noise": r.get("dim_noise", ""),
            "dim_safety": r.get("dim_safety", ""),
            "source_type": r.get("source_type", ""),
            "original_spot_code": r.get("original_spot_code"),
            "dyd_id": r.get("dyd_id"),
        })

    r = client.post(
        f"{SUPABASE_URL}/rest/v1/unified_spots",
        json=clean_records,
        headers=h,
        timeout=120,
    )
    if r.status_code in (200, 201):
        return len(clean_records)
    else:
        log(f"  写入失败: {r.status_code} {r.text[:300]}")
        return 0


# ======================== 主流程 ========================
def main():
    parser = argparse.ArgumentParser(description="合并安营 + 懂营地数据到 unified_spots")
    parser.add_argument("--dry-run", action="store_true", help="试运行，不写入数据库")
    parser.add_argument("--apply", action="store_true", help="正式运行，写入数据库")
    parser.add_argument("--batch", type=int, default=500, help="批量写入大小")
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        parser.print_help()
        return

    log("=" * 50)
    log("统一营地表合并脚本启动")
    log(f"模式: {'试运行' if args.dry_run else '正式运行'}")
    log(f"去重半径: {MERGE_RADIUS}m, 名称相似度阈值: {NAME_SIM_THRESHOLD}")
    log("=" * 50)

    client = httpx.Client(timeout=120)

    # 1. 读取安营数据
    log("\n[1/5] 读取 camping_spots（安营）数据...")
    anying_fields = (
        "spot_code,name,longitude,latitude,address,intro,memo,"
        "parking_status,price_info,"
        "toilet_status,water_status,power_status,charging_status,"
        "rv_friendly,trailer_friendly,tent_friendly,shower_status,"
        "fishing_status,cooking_status,fire_status,repair_status,"
        "grocery_status,dining_status,accommodation_status,"
        "toilet_info,water_info,power_info,"
        "overnight_score,overnight_status,noise_level,safety_level,"
        "signal_level,ground_type,overnight_data_source"
    )
    anying_raw = fetch_all(client, "camping_spots", anying_fields)
    anying_normalized = [normalize_anying(s) for s in anying_raw if s.get("spot_code")]
    log(f"  安营归一化后: {len(anying_normalized)} 条")

    # 2. 读取懂营地数据
    log("\n[2/5] 读取 dongyingdi_spots（懂营地）数据...")
    dyd_fields = (
        "id,name,longitude,latitude,address,is_fee,"
        "toilet_status,water_status,power_status,tent_friendly,"
        "trailer_friendly,cook_friendly,dining_status,shower_status,"
        "fishing_status,overnight_score,overnight_status,"
        "dim_noise,dim_safety,score_source"
    )
    dyd_raw = fetch_all(client, "dongyingdi_spots", dyd_fields)
    dyd_normalized = [normalize_dyd(s) for s in dyd_raw if s.get("id")]
    log(f"  懂营地归一化后: {len(dyd_normalized)} 条")

    # 3. 去重合并
    log("\n[3/5] 去重合并...")
    all_camps = anying_normalized + dyd_normalized
    log(f"  合并前总数: {len(all_camps)}")
    unified = deduplicate(all_camps)
    log(f"  合并后总数: {len(unified)}")
    log(f"  去重合并: {len(all_camps) - len(unified)} 条")

    # 统计来源分布
    source_counts = {}
    for c in unified:
        st = c.get("source_type", "unknown")
        source_counts[st] = source_counts.get(st, 0) + 1
    log(f"  来源分布: {source_counts}")

    # 统计有评论的营地
    has_dyd_id = sum(1 for c in unified if c.get("dyd_id"))
    log(f"  有 dyd_id（可查懂营地评论）: {has_dyd_id}")

    # 统计有评分的营地
    has_score = sum(1 for c in unified if float(c.get("overnight_score", 0) or 0) > 0)
    log(f"  有过夜评分: {has_score}")

    if args.dry_run:
        log("\n[试运行] 不写入数据库。添加 --apply 参数以正式写入。")
        log("\n合并完成!")
        return

    # 4. 写入数据库
    log("\n[4/5] 清空 unified_spots 表...")
    if not truncate_unified(client):
        log("清空失败，退出。")
        return

    log("\n[5/5] 写入合并数据...")
    total_written = 0
    batch_size = args.batch
    for i in range(0, len(unified), batch_size):
        batch = unified[i:i + batch_size]
        written = write_batch(client, batch)
        total_written += written
        log(f"  批次 {i // batch_size + 1}: 写入 {written} 条 (累计 {total_written})")

    log(f"\n{'=' * 50}")
    log(f"合并完成! 共写入 {total_written} 条统一营地数据")
    log(f"  原始数据: 安营 {len(anying_normalized)} + 懂营地 {len(dyd_normalized)} = {len(all_camps)}")
    log(f"  合并后: {len(unified)} (去重 {len(all_camps) - len(unified)} 条)")
    log(f"  实际写入: {total_written}")
    log(f"{'=' * 50}")


if __name__ == "__main__":
    main()
