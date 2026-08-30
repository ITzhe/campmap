#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
营图 - 数据质量修复工具 v1.0
修复两类问题:
  1. 列表展示字段与详情字段不同步 (list_has_* vs *_status)
  2. 省市信息与实际位置不一致 (通过腾讯地图逆地址解析修正)

使用方法:
    # 修复列表字段同步 (快, 免费)
    python fix_data_quality.py --sync-list

    # 修复省市信息 (需要腾讯地图key, 有调用次数限制)
    python fix_data_quality.py --fix-city --limit 100

    # 查看有多少省市不一致的
    python fix_data_quality.py --check-city

    # 测试模式: 只打印不一致的, 不修改
    python fix_data_quality.py --sync-list --dry-run
"""

import argparse
import os
import sys
from datetime import datetime
from typing import Dict, List, Tuple

try:
    import httpx
except ImportError:
    print("请先安装 httpx: pip install httpx")
    sys.exit(1)

# ======================== 配置 ========================

SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRya3RkeWZ3YXdwZnVnaHV6cXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyMzYsImV4cCI6MjA5NTI2NTIzNn0.X2KV2LA3ofvhQCTJl3pLIV84VlYSYx0Vf4L3Etr1NEs"

# 腾讯地图 WebService API Key
MAP_KEY = "2OWBZ-O7FCA-JIFKZ-CJSTI-VLSHF-QLFRE"

BATCH_SIZE = 500


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def db_headers():
    key = SUPABASE_KEY or ANON_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


# ======================== 问题1: 列表字段同步 ========================

def fix_list_fields(dry_run: bool = False):
    """
    修复列表展示字段与详情字段不同步的问题
    list_has_toilet <-> toilet_status
    list_has_water <-> water_status
    list_has_power <-> power_status
    list_price_level <-> parking_status
    list_vehicle_types <-> rv_friendly/trailer_friendly/tent_friendly
    """
    log("=" * 60)
    log("修复列表字段与详情字段同步")
    log("=" * 60)

    # 先查一批看看不一致的情况
    url = f"{SUPABASE_URL}/rest/v1/camping_spots"
    params = {
        "select": "id,name,province,city,"
                  "toilet_status,list_has_toilet,"
                  "water_status,list_has_water,"
                  "power_status,list_has_power,"
                  "parking_status,list_price_level,"
                  "rv_friendly,trailer_friendly,tent_friendly,list_vehicle_types",
        "limit": "50",
        "order": "id.asc",
    }

    with httpx.Client(timeout=30) as client:
        resp = client.get(url, headers=db_headers(), params=params)
        resp.raise_for_status()
        spots = resp.json()

    # 统计不一致
    mismatches = {"toilet": 0, "water": 0, "power": 0, "price": 0, "vehicle": 0}
    examples = []

    for s in spots:
        toilet_mismatch = (s.get("toilet_status", 0) == 1) != (s.get("list_has_toilet") == True)
        water_mismatch = (s.get("water_status", 0) == 1) != (s.get("list_has_water") == True)
        power_mismatch = (s.get("power_status", 0) in [1, 4, 12, 13]) != (s.get("list_has_power") == True)
        price_mismatch = s.get("parking_status", 0) != s.get("list_price_level", 0)

        # 车辆类型
        actual_types = []
        if s.get("rv_friendly") == 1:
            actual_types.append("rv")
        if s.get("trailer_friendly") == 1:
            actual_types.append("trailer")
        if s.get("tent_friendly") == 1:
            actual_types.append("tent")
        list_types = s.get("list_vehicle_types") or []
        vehicle_mismatch = set(actual_types) != set(list_types)

        if toilet_mismatch:
            mismatches["toilet"] += 1
        if water_mismatch:
            mismatches["water"] += 1
        if power_mismatch:
            mismatches["power"] += 1
        if price_mismatch:
            mismatches["price"] += 1
        if vehicle_mismatch:
            mismatches["vehicle"] += 1

        if any([toilet_mismatch, water_mismatch, power_mismatch, price_mismatch, vehicle_mismatch]):
            if len(examples) < 5:
                examples.append({
                    "id": s["id"],
                    "name": s["name"],
                    "toilet": f"详情={s.get('toilet_status')} 列表={s.get('list_has_toilet')}",
                    "water": f"详情={s.get('water_status')} 列表={s.get('list_has_water')}",
                    "power": f"详情={s.get('power_status')} 列表={s.get('list_has_power')}",
                })

    print(f"\n【抽样检查】随机 50 条，不一致数量:")
    print(f"  厕所: {mismatches['toilet']}")
    print(f"  水: {mismatches['water']}")
    print(f"  电: {mismatches['power']}")
    print(f"  价格: {mismatches['price']}")
    print(f"  车辆类型: {mismatches['vehicle']}")

    if examples:
        print(f"\n【示例】前 5 个不一致的:")
        for ex in examples:
            print(f"  #{ex['id']} {ex['name']}")
            print(f"    厕所: {ex['toilet']}")
            print(f"    水: {ex['water']}")
            print(f"    电: {ex['power']}")

    if dry_run:
        print("\n[DRY RUN] 未执行修改")
        return

    # 全量修复: 用详情字段覆盖列表字段
    log("\n开始全量修复列表字段...")

    # 先统计总数
    count_url = f"{SUPABASE_URL}/rest/v1/camping_spots"
    h = db_headers()
    h["Prefer"] = "count=exact"
    with httpx.Client(timeout=30) as client:
        resp = client.get(count_url, headers=h, params={"select": "id", "limit": "1"})
        total = int(resp.headers.get("content-range", "0/0").split("/")[-1])

    log(f"共 {total} 条数据需要检查")

    # 分批修复
    updated = 0
    offset = 0
    batch_size = 500

    while offset < total:
        with httpx.Client(timeout=30) as client:
            resp = client.get(
                f"{SUPABASE_URL}/rest/v1/camping_spots",
                headers=db_headers(),
                params={
                    "select": "id,toilet_status,water_status,power_status,"
                              "parking_status,rv_friendly,trailer_friendly,tent_friendly",
                    "limit": str(batch_size),
                    "offset": str(offset),
                    "order": "id.asc",
                },
            )
            resp.raise_for_status()
            batch = resp.json()

        for s in batch:
            # 计算正确的列表字段值
            update_data = {
                "list_has_toilet": s.get("toilet_status", 0) == 1,
                "list_has_water": s.get("water_status", 0) == 1,
                "list_has_power": s.get("power_status", 0) in [1, 4, 12, 13],
                "list_price_level": s.get("parking_status", 0),
            }

            # 车辆类型数组
            vtypes = []
            if s.get("rv_friendly") == 1:
                vtypes.append("rv")
            if s.get("trailer_friendly") == 1:
                vtypes.append("trailer")
            if s.get("tent_friendly") == 1:
                vtypes.append("tent")
            update_data["list_vehicle_types"] = vtypes

            # 更新
            with httpx.Client(timeout=30) as client:
                resp = client.patch(
                    f"{SUPABASE_URL}/rest/v1/camping_spots?id=eq.{s['id']}",
                    headers=db_headers(),
                    json=update_data,
                )
                if resp.status_code == 204:
                    updated += 1

        offset += batch_size
        log(f"  进度: {min(offset, total)}/{total}, 已更新 {updated} 条")

    log(f"完成! 共更新 {updated} 条列表字段")


# ======================== 问题2: 省市修正 ========================

def reverse_geocode(lat: float, lng: float) -> Tuple[str, str, str]:
    """
    调用腾讯地图逆地址解析, 返回 (省, 市, 区)
    文档: https://lbs.qq.com/service/webService/webServiceGuide/webServiceGeocoder
    """
    url = "https://apis.map.qq.com/ws/geocoder/v1/"
    params = {
        "location": f"{lat},{lng}",
        "key": MAP_KEY,
        "get_poi": 0,
    }
    try:
        with httpx.Client(timeout=10) as client:
            resp = client.get(url, params=params)
            data = resp.json()
            if data.get("status") == 0:
                addr = data.get("result", {}).get("address_component", {})
                province = addr.get("province", "")
                city = addr.get("city", "")
                district = addr.get("district", "")
                return province, city, district
    except Exception as e:
        log(f"  逆地址解析失败: {e}")
    return "", "", ""


def check_city_mismatch(limit: int = 100):
    """检查有多少省市不一致的数据"""
    log("=" * 60)
    log(f"检查省市不一致 (抽样 {limit} 条)")
    log("=" * 60)

    url = f"{SUPABASE_URL}/rest/v1/camping_spots"
    params = {
        "select": "id,name,province,city,address,latitude,longitude",
        "limit": str(limit),
        "order": "id.asc",
    }

    with httpx.Client(timeout=30) as client:
        resp = client.get(url, headers=db_headers(), params=params)
        resp.raise_for_status()
        spots = resp.json()

    mismatches = []
    api_calls = 0

    for s in spots:
        lat = s.get("latitude")
        lng = s.get("longitude")
        if not lat or not lng:
            continue

        # 调用腾讯地图逆解析
        prov, city, dist = reverse_geocode(float(lat), float(lng))
        api_calls += 1

        if prov and city:
            orig_prov = s.get("province", "")
            orig_city = s.get("city", "")

            # 判断是否不一致 (去掉"市""省"后缀再比)
            def normalize(s):
                return s.replace("省", "").replace("市", "").replace("自治区", "")

            if normalize(prov) != normalize(orig_prov) or normalize(city) != normalize(orig_city):
                mismatches.append({
                    "id": s["id"],
                    "name": s["name"],
                    "orig": f"{orig_prov} {orig_city}",
                    "corrected": f"{prov} {city}",
                    "address": s.get("address", "")[:30],
                })

        # 限速: 腾讯地图免费额度 5次/秒
        if api_calls % 5 == 0:
            import time
            time.sleep(1.1)

    print(f"\n【结果】抽样 {len(spots)} 条, 调用API {api_calls} 次")
    print(f"省市不一致: {len(mismatches)} 条 ({len(mismatches)/len(spots)*100:.1f}%)")

    if mismatches:
        print(f"\n【不一致示例】前 10 条:")
        for m in mismatches[:10]:
            print(f"  #{m['id']} {m['name'][:15]}")
            print(f"    原: {m['orig']}")
            print(f"    正: {m['corrected']}")
            print(f"    地址: {m['address']}")


def fix_city_mismatch(limit: int = 100, dry_run: bool = False):
    """
    修复省市不一致的问题
    注意: 腾讯地图免费额度有限 (每天10000次), 建议分批修
    """
    log("=" * 60)
    log(f"修复省市不一致 {'[DRY RUN]' if dry_run else ''}")
    log("=" * 60)

    # 先全量扫描不一致的 (只比较省名, 快速筛选)
    # 实际策略: 直接逐条调API, 发现不一致就修
    # 为了省API调用, 先按地址关键词粗筛

    url = f"{SUPABASE_URL}/rest/v1/camping_spots"
    params = {
        "select": "id,name,province,city,address,latitude,longitude",
        "limit": str(limit),
        "order": "id.asc",
    }

    with httpx.Client(timeout=30) as client:
        resp = client.get(url, headers=db_headers(), params=params)
        resp.raise_for_status()
        spots = resp.json()

    log(f"获取 {len(spots)} 条数据, 开始逆地址解析...")

    fixed = 0
    errors = 0
    import time

    for i, s in enumerate(spots):
        lat = s.get("latitude")
        lng = s.get("longitude")
        if not lat or not lng:
            continue

        prov, city, dist = reverse_geocode(float(lat), float(lng))

        if prov and city:
            def normalize(s):
                return s.replace("省", "").replace("市", "").replace("自治区", "")

            orig_prov = s.get("province", "")
            orig_city = s.get("city", "")

            prov_diff = normalize(prov) != normalize(orig_prov)
            city_diff = normalize(city) != normalize(orig_city)

            if prov_diff or city_diff:
                if not dry_run:
                    update_data = {
                        "province": prov,
                        "city": city,
                    }
                    if dist:
                        update_data["district"] = dist

                    with httpx.Client(timeout=30) as client:
                        resp = client.patch(
                            f"{SUPABASE_URL}/rest/v1/camping_spots?id=eq.{s['id']}",
                            headers=db_headers(),
                            json=update_data,
                        )
                        if resp.status_code == 204:
                            fixed += 1
                        else:
                            errors += 1
                else:
                    fixed += 1

                if fixed <= 10:
                    log(f"  修正 #{s['id']} {s['name'][:15]}: "
                        f"{orig_prov} {orig_city} → {prov} {city}")

        # 限速
        if (i + 1) % 5 == 0:
            time.sleep(1.1)

    log(f"完成! 修正 {fixed} 条, 错误 {errors} 条")
    if dry_run:
        log("[DRY RUN] 实际未修改数据库")


# ======================== 主函数 ========================

def main():
    parser = argparse.ArgumentParser(description="营图 - 数据质量修复工具")
    parser.add_argument("--sync-list", action="store_true", help="修复列表字段与详情字段同步")
    parser.add_argument("--check-city", action="store_true", help="检查省市不一致情况")
    parser.add_argument("--fix-city", action="store_true", help="修复省市不一致")
    parser.add_argument("--limit", type=int, default=100, help="修复/检查的数量上限")
    parser.add_argument("--dry-run", action="store_true", help="只检测不修改")
    args = parser.parse_args()

    if not any([args.sync_list, args.check_city, args.fix_city]):
        parser.print_help()
        print("\n示例:")
        print("  python fix_data_quality.py --sync-list --dry-run")
        print("  python fix_data_quality.py --sync-list")
        print("  python fix_data_quality.py --check-city --limit 50")
        print("  python fix_data_quality.py --fix-city --limit 200")
        return

    if args.sync_list:
        fix_list_fields(dry_run=args.dry_run)

    if args.check_city:
        check_city_mismatch(limit=args.limit)

    if args.fix_city:
        fix_city_mismatch(limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
