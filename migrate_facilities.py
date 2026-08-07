#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
营地设施数据迁移脚本 v2.0
为数据库中已有的营地补充 sheshi 设施字段和价格信息

新增功能:
  - 自动检测数据库列是否存在
  - 并发请求加速迁移 (10线程)
  - 支持断点续传
  - 详细统计输出

使用方法:
    # 检查数据库列是否就绪
    python migrate_facilities.py --check

    # 全量迁移 (并发10线程)
    python migrate_facilities.py

    # 断点续传
    python migrate_facilities.py --resume

    # 自定义并发数和间隔
    python migrate_facilities.py --workers 5 --delay 0.2

环境变量:
    SUPABASE_KEY: Supabase service_role key (必须)

依赖:
    pip install httpx
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

import httpx

SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
DETAIL_API = "https://zhuche.anying.wang/api/Marker/view"

PROGRESS_FILE = "migrate_progress.json"

# 所有需要迁移的字段
ALL_FIELDS = [
    # 整型字段 (sheshi 代码解析)
    "rv_friendly", "trailer_friendly", "tent_friendly",
    "dining_status", "grocery_status", "fishing_status",
    "accommodation_status", "shower_status",
    # 文本字段 (info memo 解析)
    "price_info", "toilet_info", "water_info", "power_info",
]


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def load_progress():
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except:
            pass
    return {"processed": [], "failed": [], "last_update": ""}


def save_progress(progress):
    progress["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)


def check_columns(client: httpx.Client, key: str):
    """检查数据库中哪些列存在, 返回 (existing_cols, missing_cols)"""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
    }
    existing = []
    missing = []

    for col in ALL_FIELDS:
        try:
            r = client.get(
                f"{SUPABASE_URL}/rest/v1/camping_spots",
                headers=headers,
                params={"select": col, "limit": 1},
                timeout=15
            )
            if r.status_code == 200:
                existing.append(col)
            else:
                missing.append(col)
        except:
            missing.append(col)

    return existing, missing


def fetch_detail(spot_code: str, lng: float, lat: float):
    """获取营地详情并解析设施代码 (独立 httpx 请求, 用于线程池)"""
    params = {"code": spot_code, "from": 10, "longitude": lng, "latitude": lat}
    try:
        with httpx.Client(timeout=15.0) as http:
            r = http.get(DETAIL_API, params=params)
            r.raise_for_status()
            data = r.json()
            if data.get("status") != "200":
                return None
            d = data.get("data", {})

            # 解析 sheshi 设施代码
            sheshi_str = d.get("sheshi", "")
            sheshi_codes = []
            if sheshi_str:
                try:
                    sheshi_codes = json.loads(sheshi_str)
                except:
                    pass

            # 解析 info memo
            def parse_info_memo(info_str):
                if not info_str:
                    return ""
                try:
                    info = json.loads(info_str)
                    return info.get("memo", "")
                except:
                    return ""

            return {
                "rv_friendly": 1 if "15" in sheshi_codes else 0,
                "trailer_friendly": 1 if "20" in sheshi_codes else 0,
                "tent_friendly": 1 if "25" in sheshi_codes else 0,
                "dining_status": 1 if "30" in sheshi_codes else 0,
                "grocery_status": 1 if "35" in sheshi_codes else 0,
                "fishing_status": 1 if "40" in sheshi_codes else 0,
                "accommodation_status": 1 if "45" in sheshi_codes else 0,
                "shower_status": 1 if "50" in sheshi_codes else 0,
                "price_info": parse_info_memo(d.get("zhuche_info", "")),
                "toilet_info": parse_info_memo(d.get("cesuo_info", "")),
                "water_info": parse_info_memo(d.get("jiashui_info", "")),
                "power_info": parse_info_memo(d.get("jiedian_info", "")),
            }
    except Exception:
        return None


def get_all_camps(client: httpx.Client, key: str):
    """从数据库获取所有营地的 spot_code 和坐标"""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
    }
    all_camps = []
    offset = 0
    batch_size = 1000

    while True:
        try:
            r = client.get(
                f"{SUPABASE_URL}/rest/v1/camping_spots",
                headers=headers,
                params={
                    "select": "spot_code,longitude,latitude,name",
                    "limit": batch_size,
                    "offset": offset,
                    "order": "spot_code"
                },
                timeout=30
            )
            r.raise_for_status()
            batch = r.json()
            if not batch:
                break
            all_camps.extend(batch)
            if len(all_camps) % 5000 == 0:
                log(f"  已读取 {len(all_camps)} 个营地...")
            if len(batch) < batch_size:
                break
            offset += batch_size
            time.sleep(0.2)
        except Exception as e:
            log(f"  [读取失败] {e}")
            break

    return all_camps


def update_camp_facilities(client: httpx.Client, key: str, spot_code: str,
                           facilities: dict, existing_cols: list):
    """更新营地设施字段 (只更新存在的列)"""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Prefer": "return=minimal",
    }
    # 只包含数据库中存在的列
    update_data = {k: v for k, v in facilities.items() if k in existing_cols}
    if not update_data:
        return False

    try:
        r = client.patch(
            f"{SUPABASE_URL}/rest/v1/camping_spots?spot_code=eq.{spot_code}",
            json=update_data,
            headers=headers,
            timeout=30
        )
        return r.status_code in (200, 204)
    except Exception:
        return False


def process_camp(args_tuple):
    """处理单个营地 (用于线程池)"""
    camp, existing_cols, key = args_tuple
    spot_code = camp["spot_code"]
    lng = camp.get("longitude", 0)
    lat = camp.get("latitude", 0)

    facilities = fetch_detail(spot_code, lng, lat)
    if not facilities:
        return spot_code, None, "fetch_failed"

    # 更新数据库
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Prefer": "return=minimal",
    }
    update_data = {k: v for k, v in facilities.items() if k in existing_cols}
    if not update_data:
        return spot_code, facilities, "no_columns"

    try:
        with httpx.Client(timeout=30.0) as client:
            r = client.patch(
                f"{SUPABASE_URL}/rest/v1/camping_spots?spot_code=eq.{spot_code}",
                json=update_data,
                headers=headers,
                timeout=30
            )
            if r.status_code in (200, 204):
                return spot_code, facilities, "ok"
            else:
                return spot_code, facilities, f"http_{r.status_code}"
    except Exception as e:
        return spot_code, facilities, str(e)


def main():
    parser = argparse.ArgumentParser(description="营地设施数据迁移工具 v2.0")
    parser.add_argument("--delay", type=float, default=0.15, help="请求间隔秒数 (默认0.15)")
    parser.add_argument("--workers", type=int, default=10, help="并发线程数 (默认10)")
    parser.add_argument("--resume", action="store_true", help="断点续传")
    parser.add_argument("--progress", action="store_true", help="查看进度")
    parser.add_argument("--reset", action="store_true", help="重置进度")
    parser.add_argument("--check", action="store_true", help="检查数据库列是否就绪")
    args = parser.parse_args()

    key = os.getenv("SUPABASE_KEY", "")
    if not key and not args.progress and not args.reset:
        print("[!] 请设置环境变量 SUPABASE_KEY")
        print("    export SUPABASE_KEY='your_service_role_key'")
        sys.exit(1)

    # 查看进度
    if args.progress:
        p = load_progress()
        log(f"迁移进度:")
        log(f"  已处理: {len(p['processed'])}")
        log(f"  失败: {len(p['failed'])}")
        log(f"  最后更新: {p.get('last_update', '无')}")
        if p["processed"]:
            for field in ["rv_friendly", "trailer_friendly", "tent_friendly",
                          "dining_status", "grocery_status", "accommodation_status",
                          "shower_status", "fishing_status"]:
                count = sum(1 for x in p["processed"] if x.get(field))
                log(f"    {field:25s}: {count}")
            price_count = sum(1 for x in p["processed"] if x.get("price_info"))
            log(f"    {'price_info':25s}: {price_count}")
        return

    # 重置进度
    if args.reset:
        if os.path.exists(PROGRESS_FILE):
            os.remove(PROGRESS_FILE)
            log("进度已重置")
        else:
            log("无进度文件")
        return

    log("=" * 60)
    log("营地设施数据迁移工具 v2.0")
    log(f"  并发线程: {args.workers}")
    log(f"  请求间隔: {args.delay}秒")
    log("=" * 60)

    # 检查数据库列
    log("检查数据库列...")
    with httpx.Client(timeout=15.0) as check_client:
        existing_cols, missing_cols = check_columns(check_client, key)

    log(f"  存在的列: {', '.join(existing_cols)}")
    if missing_cols:
        log(f"  缺失的列: {', '.join(missing_cols)}")
        log("")
        log("[!] 数据库缺少以下列, 请先在 Supabase SQL Editor 中执行 add_columns.sql:")
        log("    ALTER TABLE map.camping_spots")
        for col in missing_cols:
            log(f"      ADD COLUMN IF NOT EXISTS {col} TEXT DEFAULT '';")
        log("")
        log("  缺失列将被跳过, 其他列继续迁移。")
        log("  执行 SQL 后重新运行本脚本可补充缺失列的数据。")
        log("")

    if not existing_cols:
        log("[!] 没有可迁移的列, 请先添加数据库列")
        return

    if args.check:
        log("检查完成 (使用 --check 仅检查, 不迁移)")
        return

    # 读取所有营地
    log("读取数据库中所有营地...")
    with httpx.Client(timeout=30.0) as db_client:
        camps = get_all_camps(db_client, key)
    log(f"共 {len(camps)} 个营地需要更新")

    # 断点续传
    progress = load_progress()
    if args.resume:
        processed_codes = set(x["code"] for x in progress["processed"])
        camps = [c for c in camps if c["spot_code"] not in processed_codes]
        log(f"断点续传: 跳过 {len(processed_codes)} 个, 剩余 {len(camps)} 个")

    if not camps:
        log("没有需要更新的营地")
        return

    # 开始迁移 (并发)
    updated = 0
    fail_count = 0
    stats = {f: 0 for f in ALL_FIELDS}

    log(f"开始迁移 ({args.workers} 线程并发)...")
    log("-" * 60)

    task_args = [(camp, existing_cols, key) for camp in camps]

    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(process_camp, ta): ta[0] for ta in task_args}

        for i, future in enumerate(as_completed(futures)):
            camp = futures[future]
            spot_code = camp["spot_code"]
            name = camp.get("name", "")

            try:
                code, facilities, status = future.result()

                if status == "ok" and facilities:
                    updated += 1
                    for f in ALL_FIELDS:
                        if facilities.get(f):
                            stats[f] += 1
                    progress["processed"].append({
                        "code": spot_code,
                        "name": name,
                        **{f: facilities.get(f, 0) for f in ALL_FIELDS}
                    })
                else:
                    fail_count += 1
                    progress["failed"].append({"code": spot_code, "reason": status})

            except Exception as e:
                fail_count += 1
                progress["failed"].append({"code": spot_code, "reason": str(e)})

            # 每 200 个保存进度 + 打印
            if (i + 1) % 200 == 0:
                save_progress(progress)
                pct = (i + 1) / len(camps) * 100
                log(f"  进度 {i+1}/{len(camps)} ({pct:.1f}%) - 成功 {updated}, 失败 {fail_count}")

            if args.delay > 0 and (i + 1) % args.workers == 0:
                time.sleep(args.delay)

    save_progress(progress)

    log("=" * 60)
    log("迁移完成!")
    log(f"  成功: {updated} 个")
    log(f"  失败: {fail_count} 个")
    log(f"  设施统计:")
    for f in ALL_FIELDS:
        if f.endswith("_status") or f.endswith("_friendly"):
            log(f"    {f:25s}: {stats[f]}")
        else:
            log(f"    {f:25s}: {stats[f]} 条有数据")
    if missing_cols:
        log(f"  跳过的列: {', '.join(missing_cols)}")
        log(f"  请执行 add_columns.sql 后重新运行 --resume")
    log(f"  进度文件: {PROGRESS_FILE}")
    log(f"  使用 --resume 继续未完成的")
    log("=" * 60)


if __name__ == "__main__":
    main()
