#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
公益露营地图 - 全国营地数据采集工具 v5.0
从安营驻车 API 采集营地数据, 导入 Supabase 数据库

使用方法:
    # 采集指定城市
    python collect_national.py --city 青岛

    # 采集所有城市
    python collect_national.py --all

    # 自定义城市间间隔(秒)
    python collect_national.py --all --city-delay 120

    # 仅采集不导入(导出JSON)
    python collect_national.py --city 青岛 --no-import

环境变量:
    SUPABASE_KEY: Supabase service_role key (必须)

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
from datetime import datetime
from typing import List, Dict, Optional

import httpx

# ======================== 配置 ========================

SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
LIST_API = "https://zhuche.anying.wang/api/Marker/getmarkers"
DETAIL_API = "https://zhuche.anying.wang/api/Marker/view"

# 城市配置
CITIES = [
    {"name": "北京",   "lat_min": 39.4, "lat_max": 41.1, "lng_min": 115.4, "lng_max": 117.5, "province": "北京市"},
    {"name": "上海",   "lat_min": 30.7, "lat_max": 31.9, "lng_min": 120.8, "lng_max": 122.2, "province": "上海市"},
    {"name": "广州",   "lat_min": 22.5, "lat_max": 23.9, "lng_min": 112.8, "lng_max": 114.0, "province": "广东省"},
    {"name": "深圳",   "lat_min": 22.4, "lat_max": 22.9, "lng_min": 113.7, "lng_max": 114.8, "province": "广东省"},
    {"name": "成都",   "lat_min": 30.0, "lat_max": 31.5, "lng_min": 103.0, "lng_max": 104.8, "province": "四川省"},
    {"name": "杭州",   "lat_min": 29.8, "lat_max": 30.6, "lng_min": 119.5, "lng_max": 120.8, "province": "浙江省"},
    {"name": "南京",   "lat_min": 31.6, "lat_max": 32.6, "lng_min": 118.3, "lng_max": 119.3, "province": "江苏省"},
    {"name": "武汉",   "lat_min": 29.9, "lat_max": 31.4, "lng_min": 113.7, "lng_max": 115.1, "province": "湖北省"},
    {"name": "西安",   "lat_min": 33.8, "lat_max": 34.7, "lng_min": 108.5, "lng_max": 109.5, "province": "陕西省"},
    {"name": "重庆",   "lat_min": 28.6, "lat_max": 30.0, "lng_min": 105.5, "lng_max": 107.5, "province": "重庆市"},
    {"name": "天津",   "lat_min": 38.6, "lat_max": 40.2, "lng_min": 116.7, "lng_max": 118.1, "province": "天津市"},
    {"name": "昆明",   "lat_min": 24.4, "lat_max": 25.6, "lng_min": 102.2, "lng_max": 103.5, "province": "云南省"},
    {"name": "南宁",   "lat_min": 22.5, "lat_max": 23.3, "lng_min": 107.8, "lng_max": 108.9, "province": "广西壮族自治区"},
    {"name": "贵阳",   "lat_min": 26.2, "lat_max": 27.3, "lng_min": 106.2, "lng_max": 107.3, "province": "贵州省"},
    {"name": "长沙",   "lat_min": 27.8, "lat_max": 28.6, "lng_min": 112.6, "lng_max": 113.7, "province": "湖南省"},
    {"name": "南昌",   "lat_min": 28.2, "lat_max": 29.2, "lng_min": 115.5, "lng_max": 116.7, "province": "江西省"},
    {"name": "福州",   "lat_min": 25.4, "lat_max": 26.6, "lng_min": 118.8, "lng_max": 120.0, "province": "福建省"},
    {"name": "厦门",   "lat_min": 24.0, "lat_max": 24.9, "lng_min": 117.5, "lng_max": 118.6, "province": "福建省"},
    {"name": "郑州",   "lat_min": 34.2, "lat_max": 35.1, "lng_min": 113.0, "lng_max": 114.2, "province": "河南省"},
    {"name": "济南",   "lat_min": 36.0, "lat_max": 36.9, "lng_min": 116.5, "lng_max": 117.8, "province": "山东省"},
    {"name": "青岛",   "lat_min": 35.5, "lat_max": 37.5, "lng_min": 119.5, "lng_max": 121.5, "province": "山东省"},
    {"name": "哈尔滨", "lat_min": 44.8, "lat_max": 46.2, "lng_min": 125.8, "lng_max": 127.5, "province": "黑龙江省"},
    {"name": "长春",   "lat_min": 43.4, "lat_max": 44.3, "lng_min": 124.8, "lng_max": 126.2, "province": "吉林省"},
    {"name": "沈阳",   "lat_min": 41.3, "lat_max": 42.4, "lng_min": 122.8, "lng_max": 124.0, "province": "辽宁省"},
    {"name": "大连",   "lat_min": 38.5, "lat_max": 39.5, "lng_min": 120.8, "lng_max": 122.4, "province": "辽宁省"},
    {"name": "呼和浩特","lat_min": 40.4, "lat_max": 41.5, "lng_min": 111.0, "lng_max": 112.5, "province": "内蒙古自治区"},
    {"name": "乌鲁木齐","lat_min": 43.0, "lat_max": 44.3, "lng_min": 86.5, "lng_max": 88.0, "province": "新疆维吾尔自治区"},
    {"name": "兰州",   "lat_min": 35.6, "lat_max": 36.6, "lng_min": 103.0, "lng_max": 104.2, "province": "甘肃省"},
    {"name": "银川",   "lat_min": 37.8, "lat_max": 38.9, "lng_min": 105.5, "lng_max": 107.0, "province": "宁夏回族自治区"},
    {"name": "西宁",   "lat_min": 36.0, "lat_max": 37.0, "lng_min": 100.8, "lng_max": 102.3, "province": "青海省"},
    {"name": "拉萨",   "lat_min": 29.0, "lat_max": 30.2, "lng_min": 90.5, "lng_max": 92.0, "province": "西藏自治区"},
    {"name": "海口",   "lat_min": 19.5, "lat_max": 20.3, "lng_min": 109.5, "lng_max": 111.0, "province": "海南省"},
    {"name": "三亚",   "lat_min": 18.0, "lat_max": 18.6, "lng_min": 108.8, "lng_max": 110.0, "province": "海南省"},
    {"name": "太原",   "lat_min": 37.3, "lat_max": 38.3, "lng_min": 111.5, "lng_max": 113.0, "province": "山西省"},
    {"name": "石家庄", "lat_min": 37.7, "lat_max": 38.7, "lng_min": 113.8, "lng_max": 115.2, "province": "河北省"},
    {"name": "合肥",   "lat_min": 31.3, "lat_max": 32.3, "lng_min": 116.5, "lng_max": 117.8, "province": "安徽省"},
    {"name": "无锡",   "lat_min": 31.2, "lat_max": 32.0, "lng_min": 119.8, "lng_max": 120.8, "province": "江苏省"},
    {"name": "苏州",   "lat_min": 30.7, "lat_max": 31.8, "lng_min": 119.8, "lng_max": 121.0, "province": "江苏省"},
    {"name": "宁波",   "lat_min": 29.0, "lat_max": 30.3, "lng_min": 120.8, "lng_max": 122.3, "province": "浙江省"},
    {"name": "温州",   "lat_min": 27.5, "lat_max": 28.5, "lng_min": 119.8, "lng_max": 121.2, "province": "浙江省"},
    {"name": "珠海",   "lat_min": 21.8, "lat_max": 22.5, "lng_min": 113.0, "lng_max": 114.0, "province": "广东省"},
    {"name": "佛山",   "lat_min": 22.8, "lat_max": 23.6, "lng_min": 112.3, "lng_max": 113.5, "province": "广东省"},
    {"name": "东莞",   "lat_min": 22.6, "lat_max": 23.3, "lng_min": 113.5, "lng_max": 114.5, "province": "广东省"},
]


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


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
        }
    except:
        return None


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


def collect_city(http: httpx.Client, city: Dict, grid_size: float,
                 grid_delay: float, detail_delay: float) -> List[Dict]:
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
        return []

    log(f"  列表去重: {len(all_spots)} 个营地, 获取详情...")

    # 获取详情
    records = []
    detail_count = 0
    for j, (code, spot) in enumerate(all_spots.items(), 1):
        detail = fetch_detail(http, code, spot["lng"], spot["lat"])
        city_label = city_name + "市" if not city_name.endswith("市") else city_name

        if detail:
            detail_count += 1
            records.append({
                "spot_code": code,
                "name": detail["name"] or spot["name"],
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
                "province": city["province"],
                "city": city_label,
            })
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
                "province": city["province"],
                "city": city_label,
            })

        if j % 20 == 0:
            log(f"  详情进度: {j}/{len(all_spots)} (成功: {detail_count})")
        time.sleep(detail_delay)

    log(f"  {city_name} 采集完成: {len(records)} 条, 详情 {detail_count}")
    return records


def main():
    parser = argparse.ArgumentParser(description="公益露营地图 - 全国营地数据采集工具 v5.0")
    parser.add_argument("--city", help="采集指定城市 (如: 青岛)")
    parser.add_argument("--all", action="store_true", help="采集所有城市")
    parser.add_argument("--city-delay", type=int, default=180, help="城市间间隔秒数 (默认180)")
    parser.add_argument("--grid-delay", type=float, default=0.6, help="网格请求间隔秒数 (默认0.6)")
    parser.add_argument("--detail-delay", type=float, default=0.35, help="详情请求间隔秒数 (默认0.35)")
    parser.add_argument("--grid-size", type=float, default=0.5, help="网格大小 (默认0.5度)")
    parser.add_argument("--no-import", action="store_true", help="不导入数据库, 仅导出JSON")
    parser.add_argument("--list-cities", action="store_true", help="列出所有支持的城市")
    args = parser.parse_args()

    if args.list_cities:
        print("支持的城市:")
        for c in CITIES:
            print(f"  {c['name']:8s}  {c['province']}")
        return

    if not args.city and not args.all:
        print("请指定 --city 城市名 或 --all 采集全部")
        print("使用 --list-cities 查看支持的城市")
        sys.exit(1)

    # 确定要采集的城市
    if args.all:
        targets = CITIES
    else:
        targets = [c for c in CITIES if args.city in c["name"]]
        if not targets:
            print(f"未找到城市: {args.city}, 使用 --list-cities 查看支持的城市")
            sys.exit(1)

    # 获取 API key
    key = os.getenv("SUPABASE_KEY", "")
    if not key:
        print("[!] 请设置环境变量 SUPABASE_KEY")
        print("    export SUPABASE_KEY='your_service_role_key'")
        sys.exit(1)

    log(f"=" * 60)
    log(f"公益露营地图 - 数据采集工具 v5.0")
    log(f"待采集城市: {len(targets)} 个")
    log(f"城市间间隔: {args.city_delay}秒")
    if args.no_import:
        log(f"模式: 仅导出JSON (不导入数据库)")
    else:
        log(f"模式: 采集 + 导入数据库")
    log(f"=" * 60)

    http = httpx.Client(timeout=30.0)
    db_client = httpx.Client(timeout=30.0) if not args.no_import else None

    total_imported = 0
    total_spots = 0

    for ci, city in enumerate(targets):
        records = collect_city(http, city, args.grid_size, args.grid_delay, args.detail_delay)

        if records:
            total_spots += len(records)

            if not args.no_import:
                imported = import_to_db(db_client, key, records)
                total_imported += imported
                log(f"  导入数据库: {imported} 条")
            else:
                # 导出 JSON
                filename = f"camps_{city['name']}.json"
                with open(filename, "w", encoding="utf-8") as f:
                    json.dump(records, f, ensure_ascii=False, indent=2)
                log(f"  导出: {filename}")

        # 城市间间隔
        if ci < len(targets) - 1:
            next_city = targets[ci + 1]["name"]
            log(f"  等待 {args.city_delay}秒 后采集 {next_city}...")
            time.sleep(args.city_delay)

    log(f"\n{'=' * 60}")
    log(f"采集任务完成!")
    log(f"  采集城市: {len(targets)}")
    log(f"  总营地数: {total_spots}")
    if not args.no_import:
        log(f"  总导入数: {total_imported}")
    log(f"{'=' * 60}")

    http.close()
    if db_client:
        db_client.close()


if __name__ == "__main__":
    main()
