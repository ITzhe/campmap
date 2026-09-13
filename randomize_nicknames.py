#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
随机化评论用户昵称
====================
将 dongyingdi_comments 和 anying_comments 表中的 user_nickname 替换为随机中文名。
不影响 camp_comments（小程序用户自己发的评论）。

用法:
  python randomize_nicknames.py --dry-run     # 试运行，只统计
  python randomize_nicknames.py --apply       # 正式执行
"""

import argparse
import os
import random
import sys
from datetime import datetime
from typing import Dict, List

import httpx

# ======================== 配置 ========================
SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"

# 随机姓名池
SURNAMES = [
    "李", "王", "张", "刘", "陈", "杨", "赵", "黄", "周", "吴",
    "徐", "孙", "胡", "朱", "高", "林", "何", "郭", "马", "罗",
    "梁", "宋", "郑", "谢", "韩", "唐", "冯", "于", "董", "萧",
    "程", "曹", "袁", "邓", "许", "傅", "沈", "曾", "彭", "蒋",
    "蔡", "贾", "魏", "薛", "叶", "阎", "余", "潘", "杜", "戴",
    "夏", "钟", "汪", "田", "任", "姜", "范", "方", "石", "姚",
    "谭", "廖", "邹", "熊", "金", "陆", "郝", "龚", "裴", "贺",
]

# 两字名
GIVEN_NAMES_2 = [
    "伟", "芳", "娜", "敏", "静", "丽", "强", "磊", "军", "洋",
    "勇", "艳", "杰", "娟", "涛", "明", "超", "秀英", "霞", "平",
    "刚", "桂英", "辉", "玲", "燕", "婷", "飞", "彬", "宇", "浩",
    "雨", "欣", "佳", "悦", "晨", "子涵", "子轩", "诗", "语", "梦",
    "瑶", "晴", "安", "帆", "远", "博", "宁", "翔", "楠", "蕊",
]

# 三字名的后两字组合
GIVEN_NAMES_3_PART2 = [
    "明", "华", "军", "伟", "强", "杰", "斌", "波", "辉", "龙",
    "飞", "鹏", "宇", "博", "远", "翔", "晨", "阳", "佳", "欣",
    "雨", "梦", "瑶", "晴", "悦", "佳", "诗", "语", "蕊", "燕",
    "娜", "敏", "静", "丽", "霞", "娟", "芳", "艳", "玲", "婷",
    "磊", "洋", "超", "涛", "平", "刚", "宁", "彬", "浩", "帆",
]

# 昵称后缀（增加多样性）
NICK_SUFFIXES = [
    "", "_房车", "_露营", "_旅行", "_自驾", "_户外", "_路上", "_远方",
    "_行者", "_老司机", "_车友", "_游侠", "_背包客", "_摩旅", "_骑行",
    "_徒步", "_摄影", "_钓鱼", "_摄影", "_探险", "_机车",
]

# 省份/地区前缀（模拟原数据的地域风格）
REGION_PREFIXES = [
    "北京", "上海", "广东", "山东", "江苏", "浙江", "四川", "湖北",
    "湖南", "河南", "河北", "福建", "安徽", "辽宁", "黑龙江", "陕西",
    "山西", "云南", "贵州", "广西", "甘肃", "内蒙古", "新疆", "西藏",
    "海南", "宁夏", "青海", "吉林", "重庆", "天津", "江西",
]


def generate_nickname() -> str:
    """生成随机中文昵称"""
    style = random.randint(0, 3)

    if style == 0:
        # 地区 + 姓 + 随机数（如 "山东·李5481"）
        region = random.choice(REGION_PREFIXES)
        surname = random.choice(SURNAMES)
        num = random.randint(1000, 9999)
        return f"{region}·{surname}_{num}"

    elif style == 1:
        # 姓 + 两字名（如 "李伟"）
        surname = random.choice(SURNAMES)
        given = random.choice(GIVEN_NAMES_2)
        # 加后缀
        if random.random() < 0.3:
            suffix = random.choice(NICK_SUFFIXES)
            return f"{surname}{given}{suffix}"
        return f"{surname}{given}"

    elif style == 2:
        # 姓 + 三字名（如 "李明华"）
        surname = random.choice(SURNAMES)
        given1 = random.choice(GIVEN_NAMES_3_PART2)
        given2 = random.choice(GIVEN_NAMES_3_PART2)
        # 避免相同字
        if given1 == given2:
            given2 = random.choice(GIVEN_NAMES_3_PART2)
        return f"{surname}{given1}{given2}"

    else:
        # 网名风格（如 "远方行者_8842"）
        prefixes = ["远方", "路途", "山水", "星夜", "风行", "云游", "山野",
                     "湖畔", "林间", "海边", "草原", "行者", "旅人", "漫游"]
        suffixes = ["行者", "旅人", "客", "侠", "人", "者", "派", "帮"]
        prefix = random.choice(prefixes)
        suffix = random.choice(suffixes)
        num = random.randint(100, 9999)
        return f"{prefix}{suffix}_{num}"


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ======================== 数据库操作 ========================

def get_count(client: httpx.Client, key: str, table: str) -> int:
    """获取表记录数"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Prefer": "count=exact",
    }
    r = client.get(
        f"{SUPABASE_URL}/rest/v1/{table}?select=id&limit=1",
        headers=h,
        timeout=30,
    )
    range_header = r.headers.get("content-range", "0-0/0")
    try:
        return int(range_header.split("/")[-1])
    except (ValueError, IndexError):
        return 0


def fetch_nicknames(client: httpx.Client, key: str, table: str,
                     offset: int, limit: int) -> List[Dict]:
    """获取评论 ID 和当前昵称"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
    }
    id_field = "camp_id" if table == "dongyingdi_comments" else "spot_code"
    r = client.get(
        f"{SUPABASE_URL}/rest/v1/{table}?select=id,user_nickname&limit={limit}&offset={offset}&order=id",
        headers=h,
        timeout=60,
    )
    if r.status_code not in (200, 206):
        log(f"  获取失败: {r.status_code} {r.text[:200]}")
        return []
    return r.json()


def update_nicknames(client: httpx.Client, key: str, table: str,
                      updates: List[Dict]) -> int:
    """批量更新昵称（逐条 PATCH）"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    updated = 0
    for item in updates:
        try:
            r = client.patch(
                f"{SUPABASE_URL}/rest/v1/{table}?id=eq.{item['id']}",
                json={"user_nickname": item["new_nickname"]},
                headers=h,
                timeout=15,
            )
            if r.status_code in (200, 204):
                updated += 1
        except Exception:
            pass
    return updated


# ======================== 主入口 ========================

def main():
    parser = argparse.ArgumentParser(description="随机化爬取评论的用户昵称")
    parser.add_argument("--dry-run", action="store_true", help="试运行，不写入")
    parser.add_argument("--apply", action="store_true", help="正式执行")
    parser.add_argument("--batch", type=int, default=500, help="每批处理数量")
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        print("请指定 --dry-run 或 --apply")
        sys.exit(1)

    key = os.getenv("SUPABASE_KEY", "")
    if not key:
        print("[!] 请先设置环境变量 SUPABASE_KEY")
        sys.exit(1)

    mode = "试运行" if args.dry_run else "正式运行"
    log(f"随机化评论昵称 - {mode}")

    tables = ["dongyingdi_comments", "anying_comments"]
    grand_total = 0
    grand_updated = 0

    with httpx.Client(
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        timeout=60.0,
    ) as client:

        for table in tables:
            log(f"\n{'='*50}")
            log(f"处理表: {table}")

            total = get_count(client, key, table)
            log(f"  总记录数: {total}")
            if total == 0:
                continue

            offset = 0
            table_updated = 0
            seen_names = set()  # 避免同一批内重复

            while offset < total:
                batch_size = min(args.batch, total - offset)
                rows = fetch_nicknames(client, key, table, offset, batch_size)
                if not rows:
                    break

                if args.apply:
                    updates = []
                    for row in rows:
                        new_name = generate_nickname()
                        # 确保不重复
                        while new_name in seen_names:
                            new_name = generate_nickname()
                        seen_names.add(new_name)
                        updates.append({
                            "id": row["id"],
                            "new_nickname": new_name,
                        })
                    n = update_nicknames(client, key, table, updates)
                    table_updated += n
                else:
                    # dry-run: 生成几个样例
                    for row in rows[:3]:
                        log(f"  {row['user_nickname']:20s} -> {generate_nickname()}")

                offset += batch_size
                if offset % (args.batch * 5) == 0 or offset >= total:
                    pct = offset / total * 100
                    log(f"  进度: {offset}/{total} ({pct:.0f}%)")

            log(f"  {table} 完成: {table_updated}/{total}")
            grand_total += total
            grand_updated += table_updated

    log(f"\n{'='*50}")
    log(f"全部完成: 更新 {grand_updated}/{grand_total} 条评论昵称")
    if args.dry_run:
        log("（试运行，未实际写入）")


if __name__ == "__main__":
    main()
