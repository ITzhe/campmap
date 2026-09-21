#!/usr/bin/env python3
"""
清理露营点名称中与 address 字段重复的地址前缀。

规则：
- 计算 name 和 address 的最长公共前缀
- 如果公共前缀 >= 4 字符且包含 省/市/区/县 等行政区划词，则去掉前缀
- 如果去掉后为空（name 和 address 完全相同），保留原名不动
- 同时处理前端显示兜底：在 utils 中添加 cleanDisplayName 函数

用法：
  python clean_name_prefix.py --dry-run    # 预览，不修改
  python clean_name_prefix.py --apply       # 正式执行（线程池并发 PATCH）
"""

import sys
import time
import httpx
import urllib.parse
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed

# ============ 配置 ============
SUPABASE_URL = 'https://drktdyfwawpfughuzqvs.supabase.co'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRya3RkeWZ3YXdwZnVnaHV6cXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyMzYsImV4cCI6MjA5NTI2NTIzNn0.X2KV2LA3ofvhQCTJl3pLIV84VlYSYx0Vf4L3Etr1NEs'

# 行政区划关键词
ADDR_KEYWORDS = ['省', '市', '区', '县', '自治', '旗', '盟', '地区']

# 省份列表（用于查询 name 以省名开头的记录）
PROVINCES = [
    '北京', '天津', '上海', '重庆', '河北', '山西', '辽宁', '吉林',
    '黑龙江', '江苏', '浙江', '安徽', '福建', '江西', '山东',
    '河南', '湖北', '湖南', '广东', '广西', '海南', '四川',
    '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏',
    '新疆', '内蒙古',
]

# 并发线程数
THREADS = 20


def get_common_prefix_len(name, address):
    """计算 name 和 address 的最长公共前缀长度"""
    min_len = min(len(name), len(address))
    for i in range(min_len):
        if name[i] != address[i]:
            return i
    return min_len


def clean_name_with_address(name, address):
    """
    去掉 name 中与 address 重复的地址前缀。
    返回清理后的 name，如果无法清理则返回原 name。
    """
    if not name or not address:
        return name

    lcp_len = get_common_prefix_len(name, address)
    lcp = name[:lcp_len]

    # 公共前缀至少 4 字符，且包含行政区划词
    if lcp_len >= 4 and any(kw in lcp for kw in ADDR_KEYWORDS):
        remainder = name[lcp_len:].strip()
        # 如果去掉后为空，说明 name 和 address 完全相同，保留原名
        if remainder:
            return remainder

    return name


def get_headers():
    return {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json',
        'Accept-Profile': 'map',
        'Content-Profile': 'map',
    }


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def fetch_camps_with_province_prefix(client):
    """查询所有 name 以省名开头的营地"""
    all_camps = []

    for prov in PROVINCES:
        enc = urllib.parse.quote(prov)
        offset = 0
        batch = 1000
        while True:
            url = (
                f"{SUPABASE_URL}/rest/v1/unified_spots"
                f"?select=spot_code,name,address"
                f"&name=ilike.{enc}%25"
                f"&limit={batch}&offset={offset}"
            )
            r = client.get(url, headers=get_headers(), timeout=30)
            if r.status_code != 200:
                break
            data = r.json()
            if not data:
                break
            all_camps.extend(data)
            if len(data) < batch:
                break
            offset += batch

    # 去重
    seen = set()
    unique = []
    for c in all_camps:
        if c['spot_code'] not in seen:
            seen.add(c['spot_code'])
            unique.append(c)
    return unique


def update_one(item):
    """线程函数：更新单条营地名称"""
    url = f"{SUPABASE_URL}/rest/v1/unified_spots?spot_code=eq.{item['spot_code']}"
    try:
        with httpx.Client(timeout=30) as c:
            r = c.patch(url, headers=get_headers(), json={'name': item['new_name']})
            return r.status_code in (200, 204)
    except Exception:
        return False


def main():
    apply = '--apply' in sys.argv
    dry_run = '--dry-run' in sys.argv or not apply

    if dry_run:
        log("清理名称地址前缀 - 预览模式（不修改数据）")
    else:
        log(f"清理名称地址前缀 - 正式运行（{THREADS} 线程并发 PATCH）")

    with httpx.Client(timeout=60) as client:
        # 1. 查询所有 name 以省名开头的营地
        log("查询 name 以省名开头的营地...")
        all_camps = fetch_camps_with_province_prefix(client)
        log(f"  name 以省名开头的营地: {len(all_camps)} 条")

        # 2. 逐个清理名称
        to_update = []
        for camp in all_camps:
            old_name = camp['name']
            address = camp.get('address', '')
            new_name = clean_name_with_address(old_name, address)
            if new_name != old_name:
                to_update.append({
                    'spot_code': camp['spot_code'],
                    'old_name': old_name,
                    'new_name': new_name,
                    'address': address,
                })

        log(f"  需要清理的营地: {len(to_update)} 条")
        log(f"  无需修改的营地: {len(all_camps) - len(to_update)} 条")

        # 3. 显示前 30 条预览
        print()
        print("=== 清理预览（前 30 条）===")
        for item in to_update[:30]:
            print(f"  原名: {item['old_name']}")
            print(f"  地址: {item['address']}")
            print(f"  → 新名: {item['new_name']}")
            print()

        if len(to_update) > 30:
            print(f"  ... 还有 {len(to_update) - 30} 条未显示")

        if dry_run:
            print()
            log(f"预览完成，共 {len(to_update)} 条需要清理")
            log("如需正式执行，请运行: python clean_name_prefix.py --apply")
            return

        if not to_update:
            log("无需清理的数据")
            return

        # 4. 线程池并发 PATCH 更新
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
        log(f"清理完成: 成功 {success} 条, 失败 {failed} 条, 耗时 {elapsed:.0f} 秒")


if __name__ == '__main__':
    main()
