#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
营地设施数据迁移脚本 v1.0
为数据库中已有的营地补充 sheshi 设施字段（房车/拖挂/帐篷/淋浴/钓鱼）

使用方法:
    python migrate_facilities.py

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

import httpx

SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
DETAIL_API = "https://zhuche.anying.wang/api/Marker/view"
LIST_API = "https://zhuche.anying.wang/api/Marker/getmarkers"

PROGRESS_FILE = "migrate_progress.json"


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


def fetch_detail(http: httpx.Client, spot_code: str, lng: float, lat: float):
    """获取营地详情并解析设施代码"""
    params = {"code": spot_code, "from": 10, "longitude": lng, "latitude": lat}
    try:
        r = http.get(DETAIL_API, params=params, timeout=15)
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

        return {
            "rv_friendly": 1 if "15" in sheshi_codes else 0,
            "trailer_friendly": 1 if "20" in sheshi_codes else 0,
            "tent_friendly": 1 if "25" in sheshi_codes else 0,
            "shower_status": 1 if "50" in sheshi_codes else 0,
            "fishing_status": 1 if "40" in sheshi_codes else 0,
        }
    except Exception as e:
        return None


def get_all_camps(client: httpx.Client, key: str):
    """从数据库获取所有营地的 spot_code 和坐标"""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Content-Profile": "map",
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
            log(f"  已读取 {len(all_camps)} 个营地...")
            if len(batch) < batch_size:
                break
            offset += batch_size
            time.sleep(0.2)
        except Exception as e:
            log(f"  [读取失败] {e}")
            break

    return all_camps


def update_camp_facilities(client: httpx.Client, key: str, spot_code: str, facilities: dict):
    """更新营地设施字段"""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Prefer": "return=minimal",
    }
    try:
        r = client.patch(
            f"{SUPABASE_URL}/rest/v1/camping_spots?spot_code=eq.{spot_code}",
            json=facilities,
            headers=headers,
            timeout=30
        )
        return r.status_code in (200, 204)
    except Exception as e:
        log(f"  [更新失败 {spot_code}] {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="营地设施数据迁移 - 补充房车/拖挂/帐篷/淋浴/钓鱼字段")
    parser.add_argument("--delay", type=float, default=0.3, help="详情请求间隔秒数 (默认0.3)")
    parser.add_argument("--resume", action="store_true", help="断点续传")
    parser.add_argument("--progress", action="store_true", help="查看进度")
    parser.add_argument("--reset", action="store_true", help="重置进度")
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
            rv_count = sum(1 for x in p["processed"] if x.get("rv_friendly"))
            trailer_count = sum(1 for x in p["processed"] if x.get("trailer_friendly"))
            tent_count = sum(1 for x in p["processed"] if x.get("tent_friendly"))
            shower_count = sum(1 for x in p["processed"] if x.get("shower_status"))
            fishing_count = sum(1 for x in p["processed"] if x.get("fishing_status"))
            log(f"  其中房车: {rv_count}, 拖挂: {trailer_count}, 帐篷: {tent_count}, 淋浴: {shower_count}, 钓鱼: {fishing_count}")
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
    log("营地设施数据迁移工具 v1.0")
    log("=" * 60)

    http = httpx.Client(timeout=30.0)
    db_client = httpx.Client(timeout=30.0)

    # 读取所有营地
    log("读取数据库中所有营地...")
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

    # 开始迁移
    updated = 0
    rv_count = 0
    trailer_count = 0
    tent_count = 0
    shower_count = 0
    fishing_count = 0
    fail_count = 0

    log(f"开始迁移, 间隔 {args.delay}秒...")
    log("-" * 60)

    for i, camp in enumerate(camps):
        spot_code = camp["spot_code"]
        name = camp.get("name", "")
        lng = camp.get("longitude", 0)
        lat = camp.get("latitude", 0)

        try:
            facilities = fetch_detail(http, spot_code, lng, lat)
            if facilities:
                success = update_camp_facilities(db_client, key, spot_code, facilities)
                if success:
                    updated += 1
                    rv_count += facilities["rv_friendly"]
                    trailer_count += facilities["trailer_friendly"]
                    tent_count += facilities["tent_friendly"]
                    shower_count += facilities["shower_status"]
                    fishing_count += facilities["fishing_status"]
                    progress["processed"].append({
                        "code": spot_code,
                        "name": name,
                        **facilities
                    })
                else:
                    fail_count += 1
                    progress["failed"].append({"code": spot_code, "reason": "update_failed"})
            else:
                fail_count += 1
                progress["failed"].append({"code": spot_code, "reason": "fetch_failed"})

            # 每 50 个保存一次进度
            if (i + 1) % 50 == 0:
                save_progress(progress)
                log(f"  进度 {i+1}/{len(camps)} - 成功 {updated}, 失败 {fail_count}")
                log(f"    设施统计: 房车={rv_count}, 拖挂={trailer_count}, 帐篷={tent_count}, 淋浴={shower_count}, 钓鱼={fishing_count}")

            time.sleep(args.delay)

        except KeyboardInterrupt:
            log(f"\n[!] 用户中断, 保存进度...")
            save_progress(progress)
            break
        except Exception as e:
            fail_count += 1
            progress["failed"].append({"code": spot_code, "reason": str(e)})

    save_progress(progress)

    log("=" * 60)
    log("迁移完成!")
    log(f"  成功: {updated} 个")
    log(f"  失败: {fail_count} 个")
    log(f"  设施统计:")
    log(f"    房车可停: {rv_count}")
    log(f"    拖挂可停: {trailer_count}")
    log(f"    帐篷可搭: {tent_count}")
    log(f"    淋浴可用: {shower_count}")
    log(f"    可钓鱼: {fishing_count}")
    log(f"  进度文件: {PROGRESS_FILE}")
    log(f"  使用 --resume 继续未完成的")
    log("=" * 60)

    http.close()
    db_client.close()


if __name__ == "__main__":
    main()
