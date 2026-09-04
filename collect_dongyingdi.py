import argparse
import base64
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import List, Dict, Optional, Tuple

import httpx
from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad

# ======================== 城市数据加载 ========================
try:
    from cities_data import CITIES
except ImportError:
    CITIES = [
        {"name": "临汾市", "province": "山西省", "lat_min": 35.5, "lat_max": 36.8, "lng_min": 110.5, "lng_max": 112.5},
        {"name": "西安市", "province": "陕西省", "lat_min": 33.7, "lat_max": 34.8, "lng_min": 107.6, "lng_max": 109.8},
        {"name": "青岛市", "province": "山东省", "lat_min": 35.5, "lat_max": 37.1, "lng_min": 119.5, "lng_max": 121.1},
        {"name": "北京市", "province": "北京市", "lat_min": 39.4, "lat_max": 41.1, "lng_min": 115.4, "lng_max": 117.5},
        {"name": "成都市", "province": "四川省", "lat_min": 30.0, "lat_max": 31.5, "lng_min": 102.9, "lng_max": 104.9},
    ]

# ======================== 核心配置 ========================
SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
MAP_API = "https://m.qdhaoka.com/camp/camp/map"
DETAIL_API = "https://m.qdhaoka.com/camp/camp/detail"
COMMENT_API = "https://m.qdhaoka.com/camp/comment/list"

SPOTS_TABLE = "dongyingdi_spots"
COMMENTS_TABLE = "dongyingdi_comments"

AES_KEY = b"5d4bcd5912db00c28e9ce7fd5e9b7f78"
AES_IV  = b"4490d2ded4f2d4ad"

REQ_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.38",
    "channel": "1",
    "Referer": "https://servicewechat.com/wx2d94c4f89037546e/71/page-frame.html"
}

PROGRESS_FILE = "collect_dongyingdi_progress.json"

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

# ======================== 工具函数 ========================
def decrypt_data(b64_str: str) -> dict:
    if not b64_str:
        return {}
    try:
        raw_cipher = base64.b64decode(b64_str.strip().replace('"', ''))
        cipher = AES.new(AES_KEY, AES.MODE_CBC, AES_IV)
        decrypted_bytes = cipher.decrypt(raw_cipher)
        text = unpad(decrypted_bytes, AES.block_size).decode('utf-8')
        return json.loads(text.replace("@kg", " "))
    except Exception:
        return {}

def clean_timestamp(val) -> Optional[str]:
    """清洗时间，防止 PostgreSQL 22007 报错"""
    if not val or str(val).strip() in ("", "None", "null"):
        return None
    val_str = str(val).strip().replace("/", "-")
    if re.match(r'^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$', val_str):
        val_str += ":00"
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%Y-%m-%d %H:%M"):
        try:
            dt = datetime.strptime(val_str, fmt)
            return dt.isoformat()
        except ValueError:
            pass
    return None

# ======================== 进度管理 ========================
def load_progress() -> Dict:
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"completed": [], "failed": [], "last_update": ""}

def save_progress(progress: Dict):
    progress["last_update"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)

def mark_completed(progress: Dict, city_name: str, spots_count: int, comments_count: int):
    progress["completed"].append({
        "city": city_name,
        "spots_count": spots_count,
        "comments_count": comments_count,
        "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    save_progress(progress)

def is_completed(progress: Dict, city_name: str) -> bool:
    clean = city_name.replace("市", "")
    return any(clean in c["city"] for c in progress["completed"])

# ======================== API 请求模块 ========================
def fetch_map_markers(http: httpx.Client, lat: float, lng: float) -> List[Dict]:
    params = {
        "cate_id": "", "score": "", "time": 0, "distance": 100,
        "is_fee": "", "is_dian": 0, "is_water": 0, "is_toilet": 0,
        "is_tuo": 0, "is_xiu": 0, "is_cook": 0, "is_fish": 0,
        "is_bathe": 0, "is_stay": 0, "is_tent": 0, "is_canyin": 0,
        "is_shower": 0, "is_home": 0, "latitude": lat, "longitude": lng,
        "scale": 9, "is_app": 0, "is_recommend": 0, "is_camp": 0
    }
    try:
        r = http.get(MAP_API, params=params, headers=REQ_HEADERS, timeout=15)
        if r.status_code == 200:
            res = decrypt_data(r.text)
            data = res.get('data') or res.get('list') or []
            if isinstance(data, dict) and 'list' in data:
                data = data['list']
            return data if isinstance(data, list) else []
    except Exception:
        pass
    return []

def fetch_camp_detail(http: httpx.Client, camp_id: int) -> Optional[Dict]:
    try:
        r = http.get(DETAIL_API, params={"id": camp_id}, headers=REQ_HEADERS, timeout=12)
        if r.status_code == 200:
            res = decrypt_data(r.text)
            return res.get('data') or res
    except Exception:
        pass
    return None

def fetch_camp_comments(http: httpx.Client, camp_id: int, camp_name: str) -> List[Dict]:
    comments = []
    page = 1
    while page <= 4:
        try:
            params = {"id": camp_id, "page": page, "type": 0}
            r = http.get(COMMENT_API, params=params, headers=REQ_HEADERS, timeout=10)
            if r.status_code != 200:
                break
            
            res = decrypt_data(r.text)
            data_obj = res.get('data') or res.get('list') or {}
            
            if isinstance(data_obj, dict):
                items = data_obj.get('data') or data_obj.get('list') or []
            elif isinstance(data_obj, list):
                items = data_obj
            else:
                items = []

            if not items:
                break

            for item in items:
                user = item.get('user') or {}
                content_text = str(item.get('user_content') or item.get('content') or '').strip()
                
                comments.append({
                    "id": int(item.get('id', f"{camp_id}{len(comments)+1}")),
                    "camp_id": camp_id,
                    "camp_name": camp_name,
                    "user_nickname": item.get('user_name') or user.get('nickname') or "车友",
                    "user_score": float(item.get('score', 0)),
                    "content": content_text if content_text else "现场打卡",
                    "likes": int(item.get('like_count', 0)),
                    "comment_time": clean_timestamp(item.get('create_time'))
                })
            page += 1
        except Exception:
            break
    return comments


def fetch_detail_and_comments(http: httpx.Client, camp_id: int, marker: Dict,
                               detail_delay: float) -> Tuple[Dict, List[Dict]]:
    """并发安全：获取单个营地的详情 + 评论"""
    d = fetch_camp_detail(http, camp_id)
    camp_name = (d or {}).get('campName') or (d or {}).get('name') or marker.get('campName') or marker.get('name') or f"营地_{camp_id}"
    comments = fetch_camp_comments(http, camp_id, camp_name)
    if detail_delay > 0:
        time.sleep(detail_delay)
    return camp_id, marker, d, comments


# ======================== Supabase 写入模块 ========================
def import_to_supabase(client: httpx.Client, key: str, table_name: str, records: List[Dict]) -> int:
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
    
    batch_size = 25
    imported = 0
    endpoint = f"{SUPABASE_URL}/rest/v1/{table_name}?on_conflict=id"

    for i in range(0, len(records), batch_size):
        batch = records[i:i + batch_size]
        success = False
        
        for retry in range(3):
            try:
                r = client.post(endpoint, json=batch, headers=headers, timeout=45.0)
                if r.status_code in (200, 201):
                    imported += len(batch)
                    success = True
                    break
            except Exception:
                pass
            time.sleep(1.0 + retry * 1.5)

        time.sleep(0.1)
    return imported

# ======================== 单城市采集流程 ========================
def collect_city(http: httpx.Client, city: Dict, grid_step: float,
                 grid_delay: float, detail_delay: float, workers: int = 5) -> Tuple[List[Dict], List[Dict]]:
    city_name = city["name"]
    log(f"\n[{city_name}] 开始扫描点位...")

    points = []
    lat = city["lat_min"]
    while lat <= city["lat_max"]:
        lng = city["lng_min"]
        while lng <= city["lng_max"]:
            points.append((round(lat, 4), round(lng, 4)))
            lng += grid_step
        lat += grid_step

    all_spots = {}
    for i, (p_lat, p_lng) in enumerate(points, 1):
        markers = fetch_map_markers(http, p_lat, p_lng)
        for m in markers:
            cid = m.get('id')
            if cid and cid not in all_spots:
                all_spots[cid] = m
        if i % 4 == 0 or i == len(points):
            log(f"  网格 {i}/{len(points)} - 累计 {len(all_spots)} 个点")
        time.sleep(grid_delay)

    log(f"  发现独立营地: {len(all_spots)} 个，并发采集详情+评论 (workers={workers})...")

    # 并发获取详情 + 评论
    spot_records = []
    comment_records = []
    detail_success = 0
    city_label = city_name + "市" if not city_name.endswith(("市", "州", "盟", "地区")) else city_name

    total = len(all_spots)
    done_count = 0

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(fetch_detail_and_comments, http, cid, marker, detail_delay): cid
            for cid, marker in all_spots.items()
        }

        for future in as_completed(futures):
            try:
                cid, marker, d, comments = future.result()
                done_count += 1

                if d and isinstance(d, dict) and (d.get('campName') or d.get('name')):
                    detail_success += 1
                    camp_name = d.get('campName') or d.get('name')
                    spot_record = {
                        "id": cid,
                        "spot_code": str(cid),
                        "name": camp_name,
                        "province": d.get('province') or d.get('sheng') or city.get('province', ''),
                        "city": d.get('city') or d.get('shi') or city_label,
                        "xian": d.get('xian', ''),
                        "address": d.get('address') or d.get('city_text', ''),
                        "longitude": float(d.get('longitude') or marker.get('longitude', 0)),
                        "latitude": float(d.get('latitude') or marker.get('latitude', 0)),
                        "altitude": int(d.get('altitude', 0)) if d.get('altitude') else 0,
                        "score": float(d.get('score') or marker.get('score', 0)),
                        "is_fee": int(d.get('is_fee', 0)),
                        "price_info": "收费" if str(d.get('is_fee')) == '1' else "免费",
                        "phone": d.get('phone') or d.get('mobile') or "暂无",
                        "cate": str(d.get('cate', '')).strip(),
                        "intro": str(d.get('intro', '')).strip(),
                        "business_hours": str(d.get('businessHours', '')).strip(),
                        "parking_status": 1,
                        "stay_status": int(d.get('is_stay', 0)),
                        "water_status": int(d.get('is_water', 0)),
                        "power_status": int(d.get('is_dian', 0)),
                        "toilet_status": int(d.get('is_toilet', 0)),
                        "shower_status": int(d.get('is_shower', 0)),
                        "rv_friendly": 1,
                        "trailer_friendly": int(d.get('is_tuo', 0)),
                        "tent_friendly": int(d.get('is_tent', 0)),
                        "cook_friendly": int(d.get('is_cook', 0)),
                        "fishing_status": int(d.get('is_fish', 0)),
                        "dining_status": int(d.get('is_canyin', 0)),
                        "browse_count": int(d.get('browse', 0)),
                        "collect_count": int(d.get('collect', 0)),
                        "comment_count": int(d.get('comment', 0)),
                        "nav_count": int(d.get('nav_num', 0)),
                        "cover_image": d.get('cover', ''),
                        "raw_detail": d
                    }
                else:
                    camp_name = marker.get('campName') or marker.get('name') or f"营地_{cid}"
                    spot_record = {
                        "id": cid,
                        "spot_code": str(cid),
                        "name": camp_name,
                        "province": city.get('province', ''),
                        "city": city_label,
                        "xian": "",
                        "address": "",
                        "longitude": float(marker.get('longitude', 0)),
                        "latitude": float(marker.get('latitude', 0)),
                        "altitude": 0,
                        "score": float(marker.get('score', 0)),
                        "is_fee": int(marker.get('is_fee', 0)) if marker.get('is_fee') is not None else 0,
                        "price_info": "未知",
                        "phone": "暂无",
                        "cate": "露营地",
                        "intro": "",
                        "business_hours": "",
                        "parking_status": 1,
                        "stay_status": 0,
                        "water_status": 0,
                        "power_status": 0,
                        "toilet_status": 0,
                        "shower_status": 0,
                        "rv_friendly": 1,
                        "trailer_friendly": 0,
                        "tent_friendly": 0,
                        "cook_friendly": 0,
                        "fishing_status": 0,
                        "dining_status": 0,
                        "browse_count": 0,
                        "collect_count": 0,
                        "comment_count": 0,
                        "nav_count": 0,
                        "cover_image": "",
                        "raw_detail": marker
                    }

                spot_records.append(spot_record)

                if comments:
                    comment_records.extend(comments)

                if done_count % 50 == 0 or done_count == total:
                    log(f"  进度: [{done_count}/{total}] 详情补全: {detail_success} | 累计评论: {len(comment_records)} 条")

            except Exception as e:
                done_count += 1
                log(f"  [详情异常] {e}")

    log(f"  [{city_name}] 采集完成: {len(spot_records)} 个营地, {len(comment_records)} 条评论, 详情 {detail_success}")
    return spot_records, comment_records

# ======================== 主入口 ========================
def main():
    parser = argparse.ArgumentParser(description="懂营地 - 全量详情 + 车友评论采集入库 (并发版)")
    parser.add_argument("--city", help="采集指定城市 (如: 西安 / 临汾 / 青岛)")
    parser.add_argument("--province", help="采集整个省份 (如: 陕西省 / 山西省)")
    parser.add_argument("--all", action="store_true", help="全量采集全国所有城市")
    parser.add_argument("--city-delay", type=int, default=5, help="城市间等待秒数 (默认5)")
    parser.add_argument("--grid-delay", type=float, default=0.5, help="网格请求间隔 (默认0.5)")
    parser.add_argument("--detail-delay", type=float, default=0.1, help="详情请求间隔 (默认0.1)")
    parser.add_argument("--grid-step", type=float, default=0.8, help="切片步长 (默认0.8)")
    parser.add_argument("--workers", type=int, default=5, help="并发线程数 (默认5)")
    parser.add_argument("--no-import", action="store_true", help="仅导出本地 JSON")
    parser.add_argument("--resume", action="store_true", help="断点续采")
    args = parser.parse_args()

    if not args.city and not args.all and not args.province:
        print("请指定采集范围: --city 城市名 / --province 省份 / --all 全部")
        sys.exit(1)

    if args.all:
        targets = CITIES
    elif args.province:
        p_clean = args.province.replace("省", "").replace("市", "")
        targets = [c for c in CITIES if p_clean in c.get("province", "")]
    else:
        c_clean = args.city.replace("市", "").replace("地区", "").replace("盟", "").replace("州", "")
        targets = [c for c in CITIES if c_clean in c.get("name", "")]

    if not targets:
        log(f"未找到目标城市/省份: {args.city or args.province}")
        sys.exit(1)

    progress = load_progress()
    if args.resume:
        targets = [c for c in targets if not is_completed(progress, c["name"])]
        log(f"断点续采: 剩余 {len(targets)} 个城市待处理")

    key = os.getenv("SUPABASE_KEY", "")
    if not key and not args.no_import:
        print("[!] 请先设置环境变量: $env:SUPABASE_KEY='你的service_role_key'")
        sys.exit(1)

    log("=" * 60)
    log(f"懂营地采集任务启动 | 目标: {len(targets)} 个城市")
    log(f"并发线程数: {args.workers} | 详情间隔: {args.detail_delay}s | 城市间隔: {args.city_delay}s")
    log(f"写入目标: Supabase -> map.{SPOTS_TABLE} & map.{COMMENTS_TABLE}")
    log("=" * 60)

    http = httpx.Client(timeout=30.0, limits=httpx.Limits(max_keepalive_connections=20, max_connections=30))
    db_client = httpx.Client(timeout=45.0, limits=httpx.Limits(max_keepalive_connections=5, max_connections=10), http2=False) if not args.no_import else None

    for ci, city in enumerate(targets):
        city_name = city["name"]
        log(f"\n{'─' * 60}")
        log(f"城市进度: {ci + 1}/{len(targets)} - {city_name} ({city.get('province', '')})")

        spots, comments = collect_city(http, city, args.grid_step, args.grid_delay, args.detail_delay, args.workers)

        os.makedirs("backup_data", exist_ok=True)
        with open(f"backup_data/dongyingdi_{city_name}_spots.json", "w", encoding="utf-8") as f:
            json.dump(spots, f, ensure_ascii=False, indent=2)
        with open(f"backup_data/dongyingdi_{city_name}_comments.json", "w", encoding="utf-8") as f:
            json.dump(comments, f, ensure_ascii=False, indent=2)

        if not args.no_import:
            imp_spots = import_to_supabase(db_client, key, SPOTS_TABLE, spots)
            imp_comments = import_to_supabase(db_client, key, COMMENTS_TABLE, comments)
            log(f"  [{city_name}] 入库: {imp_spots}/{len(spots)} 营地, {imp_comments}/{len(comments)} 评论")
            mark_completed(progress, city_name, imp_spots, imp_comments)
        else:
            log(f"  已导出本地 JSON: {len(spots)} 个营地, {len(comments)} 条评论")
            mark_completed(progress, city_name, len(spots), len(comments))

        if ci < len(targets) - 1:
            log(f"  等待 {args.city_delay}s...")
            time.sleep(args.city_delay)

    http.close()
    if db_client:
        db_client.close()

if __name__ == "__main__":
    main()
