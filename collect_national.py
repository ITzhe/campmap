#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
营图 - 全国营地数据采集工具 v7.0
从安营驻车 API 采集营地数据, 导入 Supabase 数据库
采集后自动标注过夜属性 + 同步列表字段

覆盖全国 337 个地级行政区（地级市、自治州、地区、盟）

使用方法:
    # 采集指定城市
    python collect_national.py --city 青岛

    # 采集整个省
    python collect_national.py --province 山东省

    # 采集所有城市（全国）
    python collect_national.py --all

    # 自定义城市间间隔(秒)
    python collect_national.py --all --city-delay 120

    # 仅采集不导入(导出JSON)
    python collect_national.py --city 青岛 --no-import

    # 断点续采（跳过已采集的城市）
    python collect_national.py --all --resume

    # 指定从第 N 个城市开始
    python collect_national.py --all --start-index 50

    # 跳过过夜标注（默认自动标注）
    python collect_national.py --all --no-tag

    # 列出所有城市
    python collect_national.py --list-cities

    # 查看采集进度
    python collect_national.py --progress

环境变量:
    SUPABASE_KEY: Supabase service_role key (导入时必须)

依赖:
    pip install httpx
"""

import argparse
import base64
import json
import os
import sys
import time
import zlib
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Optional, Tuple

import httpx

# ======================== 城市数据 ========================
from cities_data import CITIES

# ======================== 过夜标注 ========================
from overnight_tagger import analyze_overnight


def enrich_record(record: Dict) -> Dict:
    """
    给单条营地记录添加:
    1. 过夜属性标注 (overnight_status, noise_level, safety_level,
       signal_level, ground_type, overnight_score, overnight_data_source)
    2. 列表字段同步 (list_has_toilet/water/power/charging,
       list_vehicle_types, facilities)
    """
    # --- 过夜属性标注 ---
    overnight = analyze_overnight(record)
    record["overnight_status"] = overnight["overnight_status"]
    record["noise_level"] = overnight["noise_level"]
    record["safety_level"] = overnight["safety_level"]
    record["signal_level"] = overnight["signal_level"]
    record["ground_type"] = overnight["ground_type"]
    record["overnight_score"] = overnight["overnight_score"]
    record["overnight_data_source"] = overnight["overnight_data_source"]

    # --- 列表字段同步 ---
    record["list_has_toilet"] = record.get("toilet_status", 0) == 1
    record["list_has_water"] = record.get("water_status", 0) == 1
    record["list_has_power"] = record.get("power_status", 0) == 1
    record["list_has_charging"] = record.get("charging_status", 0) == 1

    # 车辆类型数组
    vehicle_types = []
    if record.get("rv_friendly") == 1:
        vehicle_types.append("rv")
    if record.get("trailer_friendly") == 1:
        vehicle_types.append("trailer")
    if record.get("tent_friendly") == 1:
        vehicle_types.append("tent")
    record["list_vehicle_types"] = vehicle_types

    # 设施列表
    facilities = []
    facility_map = {
        "toilet_status": "toilet",
        "water_status": "water",
        "power_status": "power",
        "charging_status": "charging",
        "shower_status": "shower",
        "fishing_status": "fishing",
        "dining_status": "dining",
        "grocery_status": "grocery",
        "accommodation_status": "accommodation",
    }
    for field, label in facility_map.items():
        if record.get(field) == 1:
            facilities.append(label)
    record["facilities"] = facilities

    return record

# ======================== 配置 ========================

SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
LIST_API = "https://zhuche.anying.wang/api/Marker/getmarkers"
DETAIL_API = "https://zhuche.anying.wang/api/Marker/view"
ANYING_COMMENTS_TABLE = "anying_comments"

PROGRESS_FILE = "collect_progress.json"


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ======================== 进度管理 ========================

def load_progress() -> Dict:
    """加载采集进度"""
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"completed": [], "failed": [], "last_update": ""}


def save_progress(progress: Dict):
    """保存采集进度"""
    progress["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def mark_completed(progress: Dict, city_name: str, count: int):
    """标记城市采集完成"""
    progress["completed"].append({
        "city": city_name,
        "count": count,
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    save_progress(progress)


def mark_failed(progress: Dict, city_name: str, reason: str):
    """标记城市采集失败"""
    progress["failed"].append({
        "city": city_name,
        "reason": reason,
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    save_progress(progress)


def is_completed(progress: Dict, city_name: str) -> bool:
    """检查城市是否已完成"""
    return any(c["city"] == city_name for c in progress["completed"])


# ======================== API 采集 ========================

def fetch_list(http: httpx.Client, lat_min, lat_max, lng_min, lng_max) -> List[Dict]:
    """获取网格内营地列表"""
    params = {
        "latmin": lat_min, "latmax": lat_max,
        "lngmin": lng_min, "lngmax": lng_max,
        "scale": 10, "version": 0, "code": 1,
        "searchtabs": "[]", "searchmode": 0,
        "firstsearch": 0, "regionsearch": "", "searchkey": "",
    }
    try:
        r = http.get(LIST_API, params=params, timeout=20)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "200":
            return []
        encoded = data.get("data", {}).get("list", "")
        if not encoded:
            return []
        compressed = base64.b64decode(encoded)
        decompressed = zlib.decompress(compressed[2:-4], -zlib.MAX_WBITS)
        raw_list = json.loads(decompressed.decode("utf-8"))
        spots = []
        for item in raw_list:
            if len(item) < 12:
                continue
            spots.append({
                "spot_code": item[1],
                "name": item[2],
                "lat": float(item[3]),
                "lng": float(item[4]),
                "has_toilet": bool(item[5]),
                "has_water": bool(item[6]),
                "has_power": bool(item[7]),
                "price_level": int(item[8]),
            })
        return spots
    except Exception as e:
        log(f"  [列表失败] {e}")
        return []


def fetch_detail(http: httpx.Client, spot_code: str, lng: float, lat: float) -> Optional[Dict]:
    """获取营地详情"""
    params = {"code": spot_code, "from": 10, "longitude": lng, "latitude": lat}
    try:
        r = http.get(DETAIL_API, params=params, timeout=15)
        r.raise_for_status()
        data = r.json()
        if data.get("status") != "200":
            return None
        d = data.get("data", {})

        # 解析 sheshi 设施代码 (JSON 字符串格式, 如 '["15","20"]')
        # 完整代码映射:
        #   15=房车可停, 20=拖挂可停, 25=帐篷可搭
        #   30=餐饮, 35=买菜/超市, 40=钓鱼, 45=住宿, 50=淋浴
        sheshi_str = d.get("sheshi", "")
        sheshi_codes = []
        if sheshi_str:
            try:
                sheshi_codes = json.loads(sheshi_str)
            except:
                pass

        rv_friendly = 1 if "15" in sheshi_codes else 0
        trailer_friendly = 1 if "20" in sheshi_codes else 0
        tent_friendly = 1 if "25" in sheshi_codes else 0
        dining_status = 1 if "30" in sheshi_codes else 0
        grocery_status = 1 if "35" in sheshi_codes else 0
        fishing_status = 1 if "40" in sheshi_codes else 0
        accommodation_status = 1 if "45" in sheshi_codes else 0
        shower_status = 1 if "50" in sheshi_codes else 0

        # 解析各类 info 字段中的备注 (JSON 字符串)
        def parse_info_memo(info_str):
            if not info_str:
                return ""
            try:
                info = json.loads(info_str)
                return info.get("memo", "")
            except:
                return ""

        price_info = parse_info_memo(d.get("zhuche_info", ""))
        toilet_info = parse_info_memo(d.get("cesuo_info", ""))
        water_info = parse_info_memo(d.get("jiashui_info", ""))
        power_info = parse_info_memo(d.get("jiedian_info", ""))

        # 提取评论 actionlists
        actionlists = d.get("actionlists") or []

        return {
            "name": d.get("name", ""),
            "longitude": float(d.get("longitude", 0)),
            "latitude": float(d.get("latitude", 0)),
            "address": d.get("address", ""),
            "intro": d.get("intro", ""),
            "memo": d.get("memo", ""),
            "parking_status": int(d.get("zhuche", 0)),
            "toilet_status": int(d.get("cesuo", 0)),
            "water_status": int(d.get("jiashui", 0)),
            "power_status": int(d.get("jiedian", 0)),
            "charging_status": int(d.get("jiaqi", 0)),
            "rv_friendly": rv_friendly,
            "trailer_friendly": trailer_friendly,
            "tent_friendly": tent_friendly,
            "shower_status": shower_status,
            "fishing_status": fishing_status,
            "dining_status": dining_status,
            "grocery_status": grocery_status,
            "accommodation_status": accommodation_status,
            "price_info": price_info,
            "toilet_info": toilet_info,
            "water_info": water_info,
            "power_info": power_info,
            "actionlists": actionlists,
        }
    except:
        return None


def fetch_all_details_concurrent(http: httpx.Client, spots: Dict[str, Dict],
                                  workers: int = 5, detail_delay: float = 0.1) -> List[Tuple[str, Dict, Optional[Dict]]]:
    """
    并发获取多个营地详情
    返回: [(spot_code, spot_info, detail_or_None), ...]
    """
    results = []
    total = len(spots)
    done_count = 0

    def _fetch_one(code, spot):
        detail = fetch_detail(http, code, spot["lng"], spot["lat"])
        if detail_delay > 0:
            time.sleep(detail_delay)
        return code, spot, detail

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(_fetch_one, code, spot): code
                   for code, spot in spots.items()}

        for future in as_completed(futures):
            try:
                code, spot, detail = future.result()
                results.append((code, spot, detail))
                done_count += 1
                if done_count % 20 == 0 or done_count == total:
                    success = sum(1 for _, _, d in results if d is not None)
                    log(f"  详情进度: {done_count}/{total} (成功: {success})")
            except Exception as e:
                done_count += 1
                log(f"  [详情异常] {e}")

    return results


def import_to_db(client: httpx.Client, key: str, records: List[Dict]) -> int:
    """批量导入数据库"""
    if not records:
        return 0
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    batch_size = 50
    imported = 0
    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        try:
            r = client.post(
                f"{SUPABASE_URL}/rest/v1/camping_spots?on_conflict=spot_code",
                json=batch, headers=headers, timeout=30
            )
            if r.status_code in (200, 201):
                imported += len(batch)
            else:
                log(f"  [导入失败] {r.status_code}: {r.text[:150]}")
        except Exception as e:
            log(f"  [导入异常] {e}")
        time.sleep(0.3)
    return imported


def extract_anying_comments(spot_code: str, camp_name: str,
                            actionlists: list) -> List[Dict]:
    """从安营 actionlists 提取评论，用户名 '安营' 前缀替换为 '营图'"""
    if not actionlists:
        return []

    comments = []
    for idx, item in enumerate(actionlists):
        raw_name = str(item.get("cname") or "安营车友")
        # "安营Xg7pLG" -> "营图Xg7pLG", "安营车友" -> "营图车友"
        nick = raw_name.replace("安营", "营图") if raw_name.startswith("安营") else raw_name

        content = str(item.get("content") or "").strip()
        if not content:
            continue  # 跳过空评论

        # 时间格式 "26-09-03 15:43" -> "2026-09-03 15:43:00"
        raw_time = str(item.get("ctime") or "")
        comment_time = None
        if raw_time:
            try:
                # 补全年份前缀: "26-" -> "2026-"
                if raw_time[2:3] == "-":
                    raw_time = "20" + raw_time
                if len(raw_time) == 16:  # "2026-09-03 15:43"
                    raw_time += ":00"
                comment_time = raw_time
            except Exception:
                comment_time = raw_time

        # 生成唯一 ID: spot_code + 序号
        comment_id = int(f"{hash(spot_code) % 100000}{idx:04d}")

        comments.append({
            "id": comment_id,
            "spot_code": spot_code,
            "camp_name": camp_name,
            "user_nickname": nick,
            "content": content,
            "comment_time": comment_time,
            "act_type": int(item.get("act_type", 0)),
            "source": "anying"
        })

    return comments


def import_comments_to_db(client: httpx.Client, key: str, comments: List[Dict]) -> int:
    """导入安营评论到数据库"""
    if not comments:
        return 0
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    batch_size = 50
    imported = 0
    endpoint = f"{SUPABASE_URL}/rest/v1/{ANYING_COMMENTS_TABLE}?on_conflict=id"

    for i in range(0, len(comments), batch_size):
        batch = comments[i:i + batch_size]
        try:
            r = client.post(endpoint, json=batch, headers=headers, timeout=30)
            if r.status_code in (200, 201):
                imported += len(batch)
            else:
                log(f"  [评论导入失败] {r.status_code}: {r.text[:150]}")
        except Exception as e:
            log(f"  [评论导入异常] {e}")
        time.sleep(0.2)
    return imported


def collect_city(http: httpx.Client, city: Dict, grid_size: float,
                 grid_delay: float, detail_delay: float, auto_tag: bool = True,
                 workers: int = 5) -> Tuple[List[Dict], List[Dict]]:
    """采集单个城市"""
    city_name = city["name"]
    log(f"\n[{city_name}] 开始采集")
    log(f"  范围: ({city['lat_min']}, {city['lng_min']}) -> ({city['lat_max']}, {city['lng_max']})")

    # 生成网格
    cells = []
    lat = city["lat_min"]
    while lat < city["lat_max"]:
        lng = city["lng_min"]
        while lng < city["lng_max"]:
            cells.append((
                round(lat, 4), round(min(lat + grid_size, city["lat_max"]), 4),
                round(lng, 4), round(min(lng + grid_size, city["lng_max"]), 4),
            ))
            lng += grid_size
        lat += grid_size

    log(f"  网格数: {len(cells)}")

    # 采集列表
    all_spots = {}
    for i, (lat_min, lat_max, lng_min, lng_max) in enumerate(cells, 1):
        spots = fetch_list(http, lat_min, lat_max, lng_min, lng_max)
        for s in spots:
            all_spots[s["spot_code"]] = s
        if i % 4 == 0 or i == len(cells):
            log(f"  网格 {i}/{len(cells)} - 累计 {len(all_spots)} 个点")
        time.sleep(grid_delay)

    if not all_spots:
        log(f"  {city_name} 无营地数据")
        return [], []

    log(f"  列表去重: {len(all_spots)} 个营地, 并发获取详情 (workers={workers})...")

    # 获取详情（并发）
    city_label = city_name + "市" if not city_name.endswith("市") else city_name
    detail_results = fetch_all_details_concurrent(http, all_spots, workers, detail_delay)

    records = []
    comment_records = []
    detail_count = 0
    for code, spot, detail in detail_results:
        if detail:
            detail_count += 1
            camp_name = detail["name"] or spot["name"]
            records.append({
                "spot_code": code,
                "name": camp_name,
                "longitude": detail["longitude"] or spot["lng"],
                "latitude": detail["latitude"] or spot["lat"],
                "address": detail["address"],
                "intro": detail["intro"],
                "memo": detail["memo"],
                "parking_status": detail["parking_status"],
                "toilet_status": detail["toilet_status"],
                "water_status": detail["water_status"],
                "power_status": detail["power_status"],
                "charging_status": detail["charging_status"],
                "rv_friendly": detail["rv_friendly"],
                "trailer_friendly": detail["trailer_friendly"],
                "tent_friendly": detail["tent_friendly"],
                "shower_status": detail["shower_status"],
                "fishing_status": detail["fishing_status"],
                "dining_status": detail["dining_status"],
                "grocery_status": detail["grocery_status"],
                "accommodation_status": detail["accommodation_status"],
                "price_info": detail["price_info"],
                "toilet_info": detail["toilet_info"],
                "water_info": detail["water_info"],
                "power_info": detail["power_info"],
                "province": city["province"],
                "city": city_label,
            })
            # 提取评论
            actionlists = detail.get("actionlists") or []
            if actionlists:
                comments = extract_anying_comments(code, camp_name, actionlists)
                comment_records.extend(comments)
        else:
            records.append({
                "spot_code": code,
                "name": spot["name"],
                "longitude": spot["lng"],
                "latitude": spot["lat"],
                "address": "",
                "intro": "",
                "memo": "",
                "parking_status": spot["price_level"],
                "toilet_status": 1 if spot["has_toilet"] else 0,
                "water_status": 1 if spot["has_water"] else 0,
                "power_status": 1 if spot["has_power"] else 0,
                "charging_status": 0,
                "rv_friendly": 0,
                "trailer_friendly": 0,
                "tent_friendly": 0,
                "shower_status": 0,
                "fishing_status": 0,
                "dining_status": 0,
                "grocery_status": 0,
                "accommodation_status": 0,
                "price_info": "",
                "toilet_info": "",
                "water_info": "",
                "power_info": "",
                "province": city["province"],
                "city": city_label,
            })

    log(f"  {city_name} 采集完成: {len(records)} 条营地, {len(comment_records)} 条评论, 详情 {detail_count}")

    # 标注过夜属性 + 同步列表字段
    if auto_tag and records:
        tagged = 0
        for record in records:
            try:
                enrich_record(record)
                tagged += 1
            except Exception as e:
                log(f"  [标注失败] {record.get('name', '?')} - {e}")
        log(f"  过夜标注: {tagged}/{len(records)} 条")

    return records, comment_records


# ======================== 主函数 ========================

def main():
    parser = argparse.ArgumentParser(description="营图 - 全国营地数据采集工具 v6.0")
    parser.add_argument("--city", help="采集指定城市 (如: 青岛)")
    parser.add_argument("--province", help="采集整个省 (如: 山东省)")
    parser.add_argument("--all", action="store_true", help="采集所有城市 (全国337个地级行政区)")
    parser.add_argument("--city-delay", type=int, default=180, help="城市间间隔秒数 (默认180)")
    parser.add_argument("--grid-delay", type=float, default=0.6, help="网格请求间隔秒数 (默认0.6)")
    parser.add_argument("--detail-delay", type=float, default=0.35, help="详情请求间隔秒数 (默认0.35)")
    parser.add_argument("--grid-size", type=float, default=0.5, help="网格大小 (默认0.5度)")
    parser.add_argument("--workers", type=int, default=5, help="并发详情请求线程数 (默认5)")
    parser.add_argument("--no-import", action="store_true", help="不导入数据库, 仅导出JSON")
    parser.add_argument("--resume", action="store_true", help="断点续采, 跳过已完成的城市")
    parser.add_argument("--start-index", type=int, default=0, help="从第N个城市开始 (0-based)")
    parser.add_argument("--list-cities", action="store_true", help="列出所有支持的城市")
    parser.add_argument("--list-provinces", action="store_true", help="列出所有省份及城市数")
    parser.add_argument("--progress", action="store_true", help="查看采集进度")
    parser.add_argument("--reset-progress", action="store_true", help="清除采集进度")
    parser.add_argument("--no-tag", action="store_true", help="跳过过夜属性标注 (默认自动标注)")
    args = parser.parse_args()

    # ---- 查看进度 ----
    if args.progress:
        p = load_progress()
        log(f"=" * 50)
        log(f"采集进度报告")
        log(f"=" * 50)
        log(f"已完成: {len(p['completed'])} / {len(CITIES)} 个城市")
        log(f"失败: {len(p['failed'])} 个城市")
        log(f"最后更新: {p.get('last_update', '无')}")
        if p["completed"]:
            total_spots = sum(c["count"] for c in p["completed"])
            log(f"已采集营地总数: {total_spots}")
            log(f"\n已完成城市:")
            for c in p["completed"][-20:]:
                log(f"  {c['city']:12s}  {c['count']:4d} 条  {c['time']}")
            if len(p["completed"]) > 20:
                log(f"  ... (仅显示最近20个)")
        if p["failed"]:
            log(f"\n失败城市:")
            for c in p["failed"]:
                log(f"  {c['city']:12s}  {c['reason']}")
        remaining = [city["name"] for city in CITIES
                     if not is_completed(p, city["name"])]
        log(f"\n剩余: {len(remaining)} 个城市未采集")
        return

    # ---- 清除进度 ----
    if args.reset_progress:
        if os.path.exists(PROGRESS_FILE):
            os.remove(PROGRESS_FILE)
            log("采集进度已清除")
        else:
            log("无进度文件")
        return

    # ---- 列出省份 ----
    if args.list_provinces:
        from collections import Counter
        prov_count = Counter(c["province"] for c in CITIES)
        log(f"全国共 {len(CITIES)} 个地级行政区, {len(prov_count)} 个省级行政区:")
        for prov, count in sorted(prov_count.items(), key=lambda x: -x[1]):
            print(f"  {prov:16s}  {count:2d} 个")
        return

    # ---- 列出城市 ----
    if args.list_cities:
        current_prov = ""
        for i, c in enumerate(CITIES):
            if c["province"] != current_prov:
                current_prov = c["province"]
                print(f"\n{current_prov}:")
            print(f"  [{i:3d}] {c['name']}")
        print(f"\n共 {len(CITIES)} 个城市")
        return

    # ---- 确定要采集的城市 ----
    if not args.city and not args.all and not args.province:
        print("请指定 --city 城市名 / --province 省份 / --all 采集全部")
        print("使用 --list-cities 查看支持的城市")
        print("使用 --list-provinces 查看省份列表")
        sys.exit(1)

    if args.all:
        targets = CITIES
    elif args.province:
        targets = [c for c in CITIES if args.province in c["province"]]
        if not targets:
            print(f"未找到省份: {args.province}")
            print("使用 --list-provinces 查看支持的省份")
            sys.exit(1)
        log(f"省份 {targets[0]['province']} 共 {len(targets)} 个城市")
    else:
        targets = [c for c in CITIES if args.city in c["name"]]
        if not targets:
            print(f"未找到城市: {args.city}, 使用 --list-cities 查看支持的城市")
            sys.exit(1)

    # ---- 跳过已完成 ----
    progress = load_progress()
    if args.resume:
        before = len(targets)
        targets = [c for c in targets if not is_completed(progress, c["name"])]
        skipped = before - len(targets)
        log(f"断点续采: 跳过已完成 {skipped} 个城市, 剩余 {len(targets)} 个")

    # ---- 起始索引 ----
    if args.start_index > 0 and args.start_index < len(targets):
        targets = targets[args.start_index:]
        log(f"从第 {args.start_index} 个城市开始, 剩余 {len(targets)} 个")

    if not targets:
        log("没有需要采集的城市 (全部已完成)")
        return

    # ---- 获取 API key ----
    key = os.getenv("SUPABASE_KEY", "")
    if not key and not args.no_import:
        print("[!] 请设置环境变量 SUPABASE_KEY, 或使用 --no-import 仅导出JSON")
        print("    export SUPABASE_KEY='your_service_role_key'")
        sys.exit(1)

    log(f"=" * 60)
    log(f"营图 - 数据采集工具 v7.0")
    log(f"待采集城市: {len(targets)} 个 (全国共 {len(CITIES)} 个)")
    log(f"城市间间隔: {args.city_delay}秒")
    log(f"并发线程数: {args.workers}")
    if args.no_tag:
        log(f"过夜标注: 已跳过 (--no-tag)")
    else:
        log(f"过夜标注: 已启用 (采集后自动标注)")
    if args.no_import:
        log(f"模式: 仅导出JSON (不导入数据库)")
    else:
        log(f"模式: 采集 + 导入数据库")
    if args.resume:
        log(f"断点续采: 已启用")
    log(f"=" * 60)

    http = httpx.Client(timeout=30.0)
    db_client = httpx.Client(timeout=30.0) if not args.no_import else None

    total_imported = 0
    total_spots = 0
    total_comments = 0
    total_comments_imported = 0
    success_count = 0
    fail_count = 0

    for ci, city in enumerate(targets):
        city_name = city["name"]
        log(f"\n{'─' * 60}")
        log(f"进度: {ci + 1}/{len(targets)} - {city_name} ({city['province']})")

        try:
            records, comment_records = collect_city(http, city, args.grid_size, args.grid_delay,
                                   args.detail_delay, auto_tag=not args.no_tag,
                                   workers=args.workers)

            if records:
                total_spots += len(records)
                total_comments += len(comment_records)

                if not args.no_import:
                    imported = import_to_db(db_client, key, records)
                    total_imported += imported
                    log(f"  营地导入: {imported} 条")

                    if comment_records:
                        cmt_imported = import_comments_to_db(db_client, key, comment_records)
                        total_comments_imported += cmt_imported
                        log(f"  评论导入: {cmt_imported}/{len(comment_records)} 条")
                else:
                    # 导出 JSON
                    filename = f"camps_{city_name}.json"
                    with open(filename, "w", encoding="utf-8") as f:
                        json.dump(records, f, ensure_ascii=False, indent=2)
                    if comment_records:
                        cmt_filename = f"comments_{city_name}.json"
                        with open(cmt_filename, "w", encoding="utf-8") as f:
                            json.dump(comment_records, f, ensure_ascii=False, indent=2)
                        log(f"  导出: {filename} + {cmt_filename}")
                    else:
                        log(f"  导出: {filename}")

                mark_completed(progress, city_name, len(records))
                success_count += 1
            else:
                mark_completed(progress, city_name, 0)
                log(f"  {city_name} 无营地数据, 标记完成")

        except KeyboardInterrupt:
            log(f"\n[!] 用户中断, 保存进度...")
            mark_failed(progress, city_name, "用户中断")
            save_progress(progress)
            log(f"已完成 {success_count} 个城市, 可使用 --resume 继续")
            break
        except Exception as e:
            log(f"  [采集异常] {e}")
            mark_failed(progress, city_name, str(e))
            fail_count += 1

        # 城市间间隔
        if ci < len(targets) - 1:
            next_city = targets[ci + 1]["name"]
            log(f"  等待 {args.city_delay}秒 后采集 {next_city}...")
            time.sleep(args.city_delay)

    log(f"\n{'=' * 60}")
    log(f"采集任务完成!")
    log(f"  采集城市: {success_count} 成功, {fail_count} 失败")
    log(f"  总营地数: {total_spots}")
    log(f"  总评论数: {total_comments}")
    if not args.no_import:
        log(f"  营地导入数: {total_imported}")
        log(f"  评论导入数: {total_comments_imported}")
    if not args.no_tag:
        log(f"  过夜标注: 已随采集自动完成")
    log(f"  进度文件: {PROGRESS_FILE}")
    log(f"  使用 --progress 查看详细进度")
    log(f"  使用 --resume 断点续采")
    log(f"{'=' * 60}")

    http.close()
    if db_client:
        db_client.close()


if __name__ == "__main__":
    main()
