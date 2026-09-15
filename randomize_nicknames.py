#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
随机化评论用户昵称
====================
将 dongyingdi_comments 和 anying_comments 表中的 user_nickname 替换为随机中文名。
不影响 camp_comments（小程序用户自己发的评论）。

使用数据库端 RPC 函数分批执行，每批一个独立事务，避免 statement timeout。
需要先执行 sql/randomize_comment_nicknames.sql 创建函数。

用法:
  python randomize_nicknames.py --dry-run          # 试运行，只统计
  python randomize_nicknames.py --apply            # 正式执行
  python randomize_nicknames.py --apply --batch 20000  # 指定每批数量
"""

import argparse
import os
import sys
import time
from datetime import datetime

import httpx

# ======================== 配置 ========================
SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
DEFAULT_BATCH = 20000  # 每批 2 万条，约几秒内完成，不会超时


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


def randomize_batch(client: httpx.Client, key: str, table: str,
                    offset: int, batch_size: int) -> int:
    """调用分批 RPC 函数，处理一批记录
    返回本批更新的记录数，失败返回 -1
    """
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Content-Type": "application/json",
    }
    r = client.post(
        f"{SUPABASE_URL}/rest/v1/rpc/randomize_comment_nicknames_batch",
        json={
            "table_name": table,
            "offset_val": offset,
            "batch_size": batch_size,
        },
        headers=h,
        timeout=120,  # 单批 2 万条，留 2 分钟足够
    )
    if r.status_code not in (200, 204):
        log(f"  第 {offset} 批失败: {r.status_code} {r.text[:300]}")
        return -1
    try:
        result = r.json()
        if isinstance(result, int):
            return result
        if isinstance(result, dict):
            return result.get("randomize_comment_nicknames_batch", 0)
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
    parser.add_argument("--batch", type=int, default=DEFAULT_BATCH,
                        help=f"每批处理数量 (默认 {DEFAULT_BATCH})")
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
        log(f"分批执行，每批 {args.batch} 条（避免 statement timeout）")

    tables = ["dongyingdi_comments", "anying_comments"]
    if args.table:
        if args.table not in tables:
            log(f"无效的表名: {args.table}，可选: {tables}")
            sys.exit(1)
        tables = [args.table]

    grand_total = 0
    grand_updated = 0

    with httpx.Client(timeout=120.0) as client:

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
                # 正式执行：分批调用 RPC
                offset = 0
                table_updated = 0
                t0 = time.time()
                fail_streak = 0

                while offset < total:
                    n = randomize_batch(client, key, table, offset, args.batch)
                    if n < 0:
                        fail_streak += 1
                        if fail_streak >= 3:
                            log(f"  连续失败 3 次，中止！")
                            break
                        log(f"  本批失败，重试 ({fail_streak}/3)...")
                        time.sleep(2)
                        continue

                    fail_streak = 0
                    table_updated += n
                    offset += n  # 用实际处理数推进，不用 batch_size

                    pct = min(offset, total) / total * 100
                    elapsed = time.time() - t0
                    speed = table_updated / elapsed if elapsed > 0 else 0
                    eta = (total - table_updated) / speed if speed > 0 else 0
                    log(f"  进度: {min(offset, total):>6d}/{total} ({pct:5.1f}%) "
                        f"速度: {speed:.0f}条/秒  剩余: {eta:.0f}s")

                    if n == 0:
                        # 返回 0 表示处理完了
                        break

                log(f"  {table} 完成: 更新 {table_updated}/{total} 条，"
                    f"耗时 {time.time()-t0:.1f}s")
                grand_updated += table_updated

    log(f"\n{'='*50}")
    if args.apply:
        log(f"全部完成: 共更新 {grand_updated}/{grand_total} 条评论昵称")
    else:
        log(f"统计完成: 共 {grand_total} 条评论待处理")
        log("（试运行，未实际写入）")


if __name__ == "__main__":
    main()
