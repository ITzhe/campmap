#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
随机化评论用户昵称
====================
将 dongyingdi_comments 和 anying_comments 表中的 user_nickname 替换为随机中文名。
不影响 camp_comments（小程序用户自己发的评论）。

使用数据库端 RPC 函数批量执行，比逐条 API 调用快数百倍。
需要先执行 sql/randomize_comment_nicknames.sql 创建函数。

用法:
  python randomize_nicknames.py --dry-run     # 试运行，只统计
  python randomize_nicknames.py --apply       # 正式执行
"""

import argparse
import os
import sys
from datetime import datetime

import httpx

# ======================== 配置 ========================
SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"


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


def randomize_via_rpc(client: httpx.Client, key: str, table: str) -> int:
    """通过 RPC 函数在数据库端批量随机化昵称，一次调用完成"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Content-Type": "application/json",
    }
    r = client.post(
        f"{SUPABASE_URL}/rest/v1/rpc/randomize_comment_nicknames",
        json={"table_name": table},
        headers=h,
        timeout=600,  # 大表可能需要较长时间，给 10 分钟超时
    )
    if r.status_code not in (200, 204):
        log(f"  RPC 调用失败: {r.status_code} {r.text[:300]}")
        return -1
    # 返回值是更新的记录数
    try:
        result = r.json()
        if isinstance(result, int):
            return result
        if isinstance(result, dict):
            return result.get("randomize_comment_nicknames", 0)
        return 0
    except Exception:
        return 0


def sample_nicknames(client: httpx.Client, key: str, table: str, limit: int = 5):
    """获取几条样例昵称用于 dry-run 展示"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
    }
    r = client.get(
        f"{SUPABASE_URL}/rest/v1/{table}?select=user_nickname&limit={limit}&order=id",
        headers=h,
        timeout=30,
    )
    if r.status_code not in (200, 206):
        return []
    return [row["user_nickname"] for row in r.json()]


# ======================== 主入口 ========================

def main():
    parser = argparse.ArgumentParser(description="随机化爬取评论的用户昵称")
    parser.add_argument("--dry-run", action="store_true", help="试运行，不写入")
    parser.add_argument("--apply", action="store_true", help="正式执行")
    parser.add_argument("--table", type=str, default="",
                        help="只处理指定表 (dongyingdi_comments 或 anying_comments)")
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
    if args.apply:
        log("使用数据库端 RPC 函数批量执行（一次调用完成全表）")

    tables = ["dongyingdi_comments", "anying_comments"]
    if args.table:
        if args.table not in tables:
            log(f"无效的表名: {args.table}，可选: {tables}")
            sys.exit(1)
        tables = [args.table]

    grand_total = 0
    grand_updated = 0

    with httpx.Client(timeout=600.0) as client:

        for table in tables:
            log(f"\n{'='*50}")
            log(f"处理表: {table}")

            total = get_count(client, key, table)
            log(f"  总记录数: {total}")
            grand_total += total

            if total == 0:
                continue

            if args.dry_run:
                # 试运行：只展示样例
                samples = sample_nicknames(client, key, table)
                log(f"  样例昵称: {samples[:5]}")
                log(f"  （试运行模式，不实际修改）")
            else:
                # 正式执行：一次 RPC 调用搞定
                log(f"  开始执行 RPC 批量更新（请耐心等待，26万条约需1-3分钟）...")
                n = randomize_via_rpc(client, key, table)
                if n < 0:
                    log(f"  {table} 执行失败！")
                else:
                    log(f"  {table} 完成: 更新 {n} 条")
                    grand_updated += n

    log(f"\n{'='*50}")
    if args.apply:
        log(f"全部完成: 共更新 {grand_updated}/{grand_total} 条评论昵称")
    else:
        log(f"统计完成: 共 {grand_total} 条评论待处理")
        log("（试运行，未实际写入）")


if __name__ == "__main__":
    main()
