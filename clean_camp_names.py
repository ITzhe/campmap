#!/usr/bin/env python3
"""
清理露营点名称中冗余的括号地址。

规则：
- 只去掉名称末尾的括号，且括号内容看起来像地址（包含省/市/区/县等关键词）
- 中间的括号保留（如"行者在野·露营基地·汤泉(九龙湖店)"中的"(九龙湖店)"）
- 同时处理中文括号（）和英文括号()
- 正确处理嵌套括号（如"(山东省...(东侧))"）

用法：
  python clean_camp_names.py --dry-run    # 预览，不修改
  python clean_camp_names.py --apply       # 正式执行（RPC 批量更新）

前提：已在 Supabase 执行 sql/batch_update_names.sql
"""

import re
import sys
import json
import httpx
from datetime import datetime

# ============ 配置 ============
SUPABASE_URL = 'https://drktdyfwawpfughuzqvs.supabase.co'
ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRya3RkeWZ3YXdwZnVnaHV6cXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyMzYsImV4cCI6MjA5NTI2NTIzNn0.X2KV2LA3ofvhQCTJl3pLIV84VlYSYx0Vf4L3Etr1NEs'

# 强地址关键词：必须包含这些词才认为是地址
ADDR_STRONG_KEYWORDS = [
    '省', '市', '区', '县', '自治', '旗', '盟', '地区',
]

# 括号对
BRACKETS = [
    ('(', ')'),      # 英文括号
    ('（', '）'),    # 中文括号
]

# RPC 批量大小
BATCH_SIZE = 500


def is_address(text: str) -> bool:
    """判断括号内容是否像地址：必须包含至少一个强地址关键词"""
    for kw in ADDR_STRONG_KEYWORDS:
        if kw in text:
            return True
    return False


def clean_name(name: str) -> str:
    """去掉名称末尾的地址括号，正确处理嵌套括号"""
    original = name
    changed = True
    while changed:
        changed = False
        name = name.rstrip()
        for open_b, close_b in BRACKETS:
            if name.endswith(close_b):
                # 从末尾向前数，找到匹配的开括号（处理嵌套）
                depth = 0
                idx = -1
                for i in range(len(name) - 1, -1, -1):
                    ch = name[i]
                    if ch == close_b:
                        depth += 1
                    elif ch == open_b:
                        depth -= 1
                        if depth == 0:
                            idx = i
                            break
                if idx > 0:
                    inner = name[idx + 1: len(name) - len(close_b)]
                    if is_address(inner):
                        name = name[:idx].rstrip()
                        changed = True
                        break
    return name.strip() if name.strip() else original


def get_headers():
    return {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json',
        'Accept-Profile': 'map',
        'Content-Profile': 'map',
    }


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def fetch_all_camps(client):
    """查询所有名称带括号的营地"""
    all_camps = []

    for bracket_enc in ['(', '%EF%BC%88']:
        offset = 0
        batch = 1000
        while True:
            url = (
                f"{SUPABASE_URL}/rest/v1/unified_spots"
                f"?select=spot_code,name"
                f"&name=ilike.*{bracket_enc}*"
                f"&limit={batch}&offset={offset}"
            )
            r = client.get(url, headers=get_headers(), timeout=30)
            if r.status_code != 200:
                log(f"  查询失败: {r.status_code} {r.text[:200]}")
                break
            data = r.json()
            if not data:
                break
            all_camps.extend(data)
            if len(data) < batch:
                break
            offset += batch
            log(f"  已获取 {offset} 条...")

    # 去重
    seen = set()
    unique = []
    for c in all_camps:
        if c['spot_code'] not in seen:
            seen.add(c['spot_code'])
            unique.append(c)
    return unique


def main():
    apply = '--apply' in sys.argv
    dry_run = '--dry-run' in sys.argv or not apply

    if dry_run:
        log("清理露营点名称 - 预览模式（不修改数据）")
    else:
        log("清理露营点名称 - 正式运行（RPC 批量更新）")

    with httpx.Client(timeout=60) as client:
        # 1. 查询所有名称带括号的营地
        log("查询名称带括号的营地...")
        all_camps = fetch_all_camps(client)
        log(f"  名称带括号的营地: {len(all_camps)} 条")

        # 2. 逐个清理名称
        to_update = []
        for camp in all_camps:
            old_name = camp['name']
            new_name = clean_name(old_name)
            if new_name != old_name:
                to_update.append({
                    'spot_code': camp['spot_code'],
                    'old_name': old_name,
                    'new_name': new_name,
                })

        log(f"  需要清理的营地: {len(to_update)} 条")
        log(f"  无需修改的营地: {len(all_camps) - len(to_update)} 条")

        # 3. 显示前 30 条预览
        print()
        print("=== 清理预览（前 30 条）===")
        for item in to_update[:30]:
            print(f"  原名: {item['old_name']}")
            print(f"  新名: {item['new_name']}")
            print()

        if len(to_update) > 30:
            print(f"  ... 还有 {len(to_update) - 30} 条未显示")

        if dry_run:
            print()
            log(f"预览完成，共 {len(to_update)} 条需要清理")
            log("如需正式执行，请先在 Supabase 执行 sql/batch_update_names.sql")
            log("然后运行: python clean_camp_names.py --apply")
            return

        if not to_update:
            log("无需清理的数据")
            return

        # 4. RPC 批量更新
        print()
        log(f"开始 RPC 批量更新 {len(to_update)} 条营地名称（每批 {BATCH_SIZE} 条）...")

        total = len(to_update)
        success = 0
        failed = 0
        total_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE

        for i in range(0, total, BATCH_SIZE):
            batch = to_update[i:i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1

            # 构造 RPC payload
            rpc_data = json.dumps([
                {'spot_code': item['spot_code'], 'new_name': item['new_name']}
                for item in batch
            ])

            url = f"{SUPABASE_URL}/rest/v1/rpc/batch_update_names"
            r = client.post(url, headers=get_headers(), json={'updates': rpc_data}, timeout=120)

            if r.status_code == 200:
                count = r.json() if r.text else len(batch)
                success += int(count)
                log(f"  批次 {batch_num}/{total_batches}: 更新 {count} 条 (总计 {success}/{total})")
            else:
                failed += len(batch)
                log(f"  批次 {batch_num}/{total_batches} 失败: {r.status_code} {r.text[:200]}")

        print()
        log(f"清理完成: 成功 {success} 条, 失败 {failed} 条")


if __name__ == '__main__':
    main()
