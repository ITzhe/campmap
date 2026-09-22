#!/usr/bin/env python3
"""
为 unified_spots 表中缺失评分的营地批量计算过夜友好度评分。

针对 overnight_status=0 的营地，基于设施字段计算：
  - overnight_score (0~5.0)
  - overnight_status (1=可以过夜, 2=勉强能住, 3=不建议过夜)
  - dim_noise (字符串：较安静/一般/较吵)
  - dim_safety (字符串：很安全/一般/需注意)
  - overnight_data_source = "facility_calculated"
  - score_source = "facility_calculated"

用法:
  python score_unified.py --dry-run     # 预览，不修改
  python score_unified.py --apply        # 正式执行（线程池并发 PATCH）
"""

import sys
import os
import time
import json
import urllib.request
import urllib.parse
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ============ 配置 ============
SUPABASE_URL = 'https://drktdyfwawpfughuzqvs.supabase.co'
SERVICE_KEY = os.getenv('SUPABASE_KEY', '')

if not SERVICE_KEY:
    print("[!] 请先设置环境变量 SUPABASE_KEY")
    print("    export SUPABASE_KEY=你的service_role_key")
    sys.exit(1)

# 基础设施权重（满分 4.0）
FACILITY_WEIGHTS = {
    'toilet_status': 0.8,
    'water_status': 0.7,
    'power_status': 0.6,
    'shower_status': 0.5,
    'cooking_status': 0.5,
    'tent_friendly': 0.5,
    'dining_status': 0.4,
}

# 并发线程数
THREADS = 20


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def estimate_noise(name, intro=''):
    """估算噪音程度（基于名称关键词）"""
    text = (name or '') + (intro or '')
    noisy_kw = ['高速', '国道', '省道', '路边', '路旁', '加油站', '服务区', '火车站', '工厂']
    quiet_kw = ['公园', '森林', '山林', '湖边', '水库', '江边', '河边', '海边', '湿地', '山', '村', '草原', '岛']
    if any(kw in text for kw in noisy_kw):
        return '较吵'
    if any(kw in text for kw in quiet_kw):
        return '较安静'
    return '一般'


def estimate_safety(spot):
    """估算安全程度（基于设施）"""
    score = 0
    if spot.get('toilet_status') == 1:
        score += 1
    if spot.get('dining_status') == 1:
        score += 1
    if spot.get('power_status') == 1:
        score += 0.5
    if spot.get('water_status') == 1:
        score += 0.5
    if spot.get('parking_status') == 1:
        score += 0.5
    if spot.get('grocery_status') == 1:
        score += 0.5
    if score >= 2.5:
        return '很安全'
    elif score >= 1.5:
        return '一般'
    else:
        return '需注意'


def calc_overnight_status(score):
    """根据评分计算过夜状态"""
    if score >= 3.5:
        return 1  # 可以过夜
    elif score >= 2.5:
        return 2  # 勉强能住
    else:
        return 3  # 不建议过夜


def calculate_score(spot):
    """计算单个营地的过夜友好度评分"""
    # 基础设施分
    base_score = 0.0
    for field, weight in FACILITY_WEIGHTS.items():
        if spot.get(field) == 1:
            base_score += weight

    # 额外加分
    bonus = 0.0
    if spot.get('trailer_friendly') == 1:
        bonus += 0.3
    if spot.get('fishing_status') == 1:
        bonus += 0.2
    bonus = min(bonus, 1.0)

    # 综合评分
    total_score = min(round(base_score + bonus, 1), 5.0)

    # 过夜状态
    status = calc_overnight_status(total_score)

    # 噪音 & 安全
    noise = estimate_noise(spot.get('name', ''), spot.get('intro', ''))
    safety = estimate_safety(spot)

    return {
        'overnight_score': total_score,
        'overnight_status': status,
        'dim_noise': noise,
        'dim_safety': safety,
        'score_source': 'facility_calculated',
        'overnight_data_source': 'facility_calculated',
    }


def fetch_camps_without_score():
    """查询所有 overnight_status=0 的营地"""
    all_camps = []
    offset = 0
    batch = 1000

    fields = 'spot_code,name,intro,toilet_status,water_status,power_status,' \
             'shower_status,cooking_status,tent_friendly,dining_status,' \
             'trailer_friendly,fishing_status,parking_status,grocery_status'

    while True:
        url = (
            f'{SUPABASE_URL}/rest/v1/unified_spots'
            f'?select={fields}'
            f'&overnight_status=eq.0'
            f'&limit={batch}&offset={offset}'
        )
        req = urllib.request.Request(url, headers={
            'apikey': SERVICE_KEY,
            'Authorization': 'Bearer ' + SERVICE_KEY,
            'Accept-Profile': 'map',
        })
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
            if not data:
                break
            all_camps.extend(data)
            if len(data) < batch:
                break
            offset += batch
            log(f'  已获取 {len(all_camps)} 条...')

    return all_camps


def update_one(item):
    """线程函数：更新单条营地评分"""
    url = f'{SUPABASE_URL}/rest/v1/unified_spots?spot_code=eq.{item["spot_code"]}'
    payload = json.dumps(item['update']).encode('utf-8')
    req = urllib.request.Request(url, data=payload, method='PATCH', headers={
        'apikey': SERVICE_KEY,
        'Authorization': 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
        'Accept-Profile': 'map',
        'Content-Profile': 'map',
    })
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status in (200, 204)
    except Exception:
        return False


def main():
    apply = '--apply' in sys.argv
    dry_run = '--dry-run' in sys.argv or not apply

    if dry_run:
        log("unified_spots 评分计算 - 预览模式")
    else:
        log(f"unified_spots 评分计算 - 正式运行（{THREADS} 线程并发）")

    # 1. 查询无评分营地
    log("查询 overnight_status=0 的营地...")
    camps = fetch_camps_without_score()
    log(f"  无评分营地: {len(camps)} 条")

    # 2. 计算评分
    to_update = []
    for camp in camps:
        score_data = calculate_score(camp)
        to_update.append({
            'spot_code': camp['spot_code'],
            'name': camp.get('name', ''),
            'update': score_data,
            'score': score_data['overnight_score'],
            'status': score_data['overnight_status'],
        })

    # 3. 统计
    scores = [u['score'] for u in to_update]
    if scores:
        avg = sum(scores) / len(scores)
        log(f"  平均分: {avg:.2f}, 最高: {max(scores):.1f}, 最低: {min(scores):.1f}")

        status_counts = {}
        for u in to_update:
            s = u['status']
            status_counts[s] = status_counts.get(s, 0) + 1
        status_labels = {1: '可以过夜', 2: '勉强能住', 3: '不建议过夜'}
        for s in sorted(status_counts.keys()):
            log(f"  {status_labels[s]}: {status_counts[s]} 条 ({status_counts[s]/len(to_update)*100:.1f}%)")

    # 4. 显示前 20 条预览
    print()
    print("=== 预览（前 20 条）===")
    for item in to_update[:20]:
        print(f"  {item['spot_code']} | {item['name'][:30]}")
        print(f"    → 评分: {item['score']}, 状态: {status_labels[item['status']]}")
        print(f"    → 噪音: {item['update']['dim_noise']}, 安全: {item['update']['dim_safety']}")
    if len(to_update) > 20:
        print(f"  ... 还有 {len(to_update) - 20} 条")

    if dry_run:
        print()
        log(f"预览完成，共 {len(to_update)} 条需要更新")
        log("如需正式执行: python score_unified.py --apply")
        return

    if not to_update:
        log("无需更新的数据")
        return

    # 5. 并发 PATCH
    print()
    log(f"开始并发更新 {len(to_update)} 条（{THREADS} 线程）...")

    total = len(to_update)
    success = 0
    failed = 0
    start_time = time.time()

    with ThreadPoolExecutor(max_workers=THREADS) as executor:
        futures = {executor.submit(update_one, item): i for i, item in enumerate(to_update)}
        for future in as_completed(futures):
            ok = future.result()
            if ok:
                success += 1
            else:
                failed += 1

            done = success + failed
            if done % 500 == 0 or done == total:
                elapsed = time.time() - start_time
                speed = done / elapsed if elapsed > 0 else 0
                eta = (total - done) / speed if speed > 0 else 0
                log(f"  进度: {done}/{total} ({done/total*100:.0f}%) "
                    f"成功:{success} 失败:{failed} "
                    f"速度:{speed:.0f}条/秒 剩余:{eta:.0f}秒")

    elapsed = time.time() - start_time
    print()
    log(f"评分计算完成: 成功 {success} 条, 失败 {failed} 条, 耗时 {elapsed:.0f} 秒")


if __name__ == '__main__':
    main()
