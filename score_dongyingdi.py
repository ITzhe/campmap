"""
懂营地过夜友好度评分计算脚本
================================
基于设施字段，为 dongyingdi_spots 表批量计算过夜友好度评分。

评分公式（第一阶段，设施基础分）：
  综合评分 = 基础设施分 + 额外加分

  基础设施分（满分 4.0）：
    厕所 0.8 + 水 0.7 + 电 0.6 + 淋浴 0.5 + 做饭 0.5 + 帐篷 0.5 + 餐饮 0.4

  额外加分（最高 1.0）：
    可停拖挂 + 0.3
    可钓鱼 + 0.2

  注：不做营地类型区分（用户决策），类型系数统一为 1.0

  三个维度：
    能否过夜：根据综合评分映射到 3 档（可以过夜/勉强能住/不建议过夜）
    噪音：基于名称关键词粗估（第一阶段）
    安全：基于设施粗估（第一阶段）

用法:
  python score_dongyingdi.py --dry-run     # 试运行，只统计结果不写入
  python score_dongyingdi.py --apply       # 正式运行，写入数据库
  python score_dongyingdi.py --apply --batch 200  # 指定批次大小
"""

import argparse
import os
import sys
import time
from datetime import datetime
from typing import Dict, List, Tuple

import httpx

# ======================== 配置 ========================
SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
TABLE = "dongyingdi_spots"

# 基础设施权重
FACILITY_WEIGHTS = {
    "toilet_status": 0.8,    # 厕所
    "water_status":  0.7,    # 水
    "power_status":  0.6,    # 电
    "shower_status": 0.5,    # 淋浴
    "cook_friendly": 0.5,    # 做饭
    "tent_friendly": 0.5,   # 帐篷
    "dining_status": 0.4,   # 餐饮
}


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ======================== 评分计算 ========================
def estimate_noise(name: str) -> str:
    """估算噪音程度（第一阶段：基于名称关键词）"""
    if any(kw in name for kw in ["高速", "国道", "省道", "路边", "路旁", "大路边", "马路边", "加油站"]):
        return "较吵"
    if any(kw in name for kw in ["公园", "森林", "山林", "湖边", "水库", "江边", "河边", "海边", "湿地", "山"]):
        return "较安静"
    return "一般"


def estimate_safety(spot: Dict) -> str:
    """估算安全程度（第一阶段：基于设施）

    评分标准：
    - 有厕所 → 有人管理 +1
    - 有餐饮 → 有人活动 +1
    - 有电 → 有基础设施 +0.5
    - 有水 → 基础保障 +0.5
    - 收费 → 通常有管理 +0.5

    阈值：
    - ≥2.5 → 很安全
    - ≥1.5 → 一般
    - <1.5 → 需注意
    """
    score = 0
    if spot.get("toilet_status") == 1:
        score += 1
    if spot.get("dining_status") == 1:
        score += 1
    if spot.get("power_status") == 1:
        score += 0.5
    if spot.get("water_status") == 1:
        score += 0.5
    if spot.get("is_fee") == 1:
        score += 0.5

    if score >= 2.5:
        return "很安全"
    elif score >= 1.5:
        return "一般"
    else:
        return "需注意"


def calc_overnight_status(score: float) -> Tuple[int, str]:
    """根据综合评分计算过夜状态
    与设计文档的评分分级保持一致：
    - 极佳 (4.5-5.0) / 良好 (3.5-4.4) → 可以过夜
    - 一般 (2.5-3.4) → 勉强能住
    - 较差 (1.5-2.4) / 很差 (0-1.4) → 不建议过夜
    """
    if score >= 3.5:
        return 1, "可以过夜"
    elif score >= 2.5:
        return 2, "勉强能住"
    else:
        return 3, "不建议过夜"


def calculate_score(spot: Dict) -> Dict:
    """计算单个营地的过夜友好度评分"""
    # 1. 基础设施分（满分 4.0）
    base_score = 0.0
    for field, weight in FACILITY_WEIGHTS.items():
        if spot.get(field) == 1:
            base_score += weight

    # 2. 额外加分（最高 1.0）
    bonus = 0.0
    # 拖挂友好
    if spot.get("trailer_friendly") == 1:
        bonus += 0.3
    # 可钓鱼
    if spot.get("fishing_status") == 1:
        bonus += 0.2

    # 额外加分封顶 1.0
    bonus = min(bonus, 1.0)

    # 3. 综合评分（不做类型区分，系数统一 1.0）
    total_score = base_score + bonus

    # 封顶 5.0
    total_score = min(total_score, 5.0)
    # 保留 1 位小数
    total_score = round(total_score, 1)

    # 4. 过夜状态
    status, status_label = calc_overnight_status(total_score)

    # 5. 噪音估算（基于名称关键词）
    noise = estimate_noise(spot.get("name", ""))

    # 6. 安全估算（基于设施）
    safety = estimate_safety(spot)

    return {
        "overnight_score": total_score,
        "overnight_status": status,
        "status_label": status_label,
        "dim_noise": noise,
        "dim_safety": safety,
        "score_source": "facility_calculated",
        "base_score": round(base_score, 2),
        "bonus": round(bonus, 2),
    }


# ======================== 数据库操作 ========================
def get_total_count(client: httpx.Client, key: str) -> int:
    """获取总记录数（通过 GET 请求 limit=1 读取 content-range）"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Prefer": "count=exact",
    }
    r = client.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}?select=id&limit=1",
        headers=h,
        timeout=30,
    )
    range_header = r.headers.get("content-range", "0-0/0")
    try:
        return int(range_header.split("/")[-1])
    except (ValueError, IndexError):
        return 0


def fetch_batch(client: httpx.Client, key: str, offset: int, limit: int) -> List[Dict]:
    """批量获取营地数据"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
    }
    fields = "id,name,water_status,power_status,toilet_status,shower_status," \
             "tent_friendly,cook_friendly,fishing_status,dining_status," \
             "trailer_friendly,is_fee"
    r = client.get(
        f"{SUPABASE_URL}/rest/v1/{TABLE}?select={fields}&limit={limit}&offset={offset}&order=id",
        headers=h,
        timeout=60,
    )
    if r.status_code not in (200, 206):
        log(f"  获取数据失败: {r.status_code} {r.text[:200]}")
        return []
    return r.json()


def update_batch(client: httpx.Client, key: str, records: List[Dict]) -> int:
    """批量更新评分（通过 RPC 函数，避免 UPSERT 的 NOT NULL 问题）"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Content-Type": "application/json",
    }
    # 只保留需要写入的字段
    now_utc = datetime.now().isoformat() + "Z"
    payload = [
        {
            "id": r["id"],
            "overnight_score": r["overnight_score"],
            "overnight_status": r["overnight_status"],
            "dim_noise": r["dim_noise"],
            "dim_safety": r["dim_safety"],
            "score_source": r["score_source"],
            "score_updated_at": now_utc,
        }
        for r in records
    ]

    # 调用 RPC 函数批量更新
    endpoint = f"{SUPABASE_URL}/rest/v1/rpc/batch_update_dyd_score"
    r = client.post(endpoint, json={"p_scores": payload}, headers=h, timeout=60)
    if r.status_code in (200, 201, 204):
        try:
            result = r.json()
            return int(result) if result else len(payload)
        except (ValueError, TypeError):
            return len(payload)
    else:
        log(f"  写入失败: {r.status_code} {r.text[:300]}")
        return 0


# ======================== 统计分析 ========================
def print_statistics(results: List[Dict]):
    """打印评分分布统计"""
    total = len(results)
    if total == 0:
        print("  无数据")
        return

    scores = [r["overnight_score"] for r in results]
    avg = sum(scores) / total

    print(f"\n{'='*50}")
    print(f"  评分统计（共 {total} 个营地）")
    print(f"{'='*50}")
    print(f"  平均分: {avg:.2f}")
    print(f"  最高分: {max(scores):.1f}")
    print(f"  最低分: {min(scores):.1f}")

    # 评分分布
    buckets = [(0, 1.4), (1.5, 2.4), (2.5, 3.4), (3.5, 4.4), (4.5, 5.0)]
    labels = ["很差 (0-1.4)", "较差 (1.5-2.4)", "一般 (2.5-3.4)",
              "良好 (3.5-4.4)", "极佳 (4.5-5.0)"]
    print(f"\n  评分分布:")
    for (lo, hi), label in zip(buckets, labels):
        count = sum(1 for s in scores if lo <= s <= hi)
        pct = count / total * 100
        bar = "█" * int(pct / 2)
        print(f"    {label:18s}: {count:6d} ({pct:5.1f}%) {bar}")

    # 过夜状态分布
    status_counts = {}
    for r in results:
        s = r["overnight_status"]
        status_counts[s] = status_counts.get(s, 0) + 1
    print(f"\n  过夜状态:")
    status_labels = {1: "可以过夜", 2: "勉强能住", 3: "不建议过夜"}
    for s in sorted(status_counts.keys()):
        count = status_counts[s]
        pct = count / total * 100
        label = status_labels.get(s, f"status={s}")
        print(f"    {label:10s}: {count:6d} ({pct:5.1f}%)")

    # 噪音分布
    noise_counts = {}
    for r in results:
        n = r["dim_noise"]
        noise_counts[n] = noise_counts.get(n, 0) + 1
    print(f"\n  噪音估算:")
    for n, c in sorted(noise_counts.items(), key=lambda x: -x[1]):
        pct = c / total * 100
        print(f"    {n:8s}: {c:6d} ({pct:5.1f}%)")

    # 安全分布
    safety_counts = {}
    for r in results:
        s = r["dim_safety"]
        safety_counts[s] = safety_counts.get(s, 0) + 1
    print(f"\n  安全估算:")
    for s, c in sorted(safety_counts.items(), key=lambda x: -x[1]):
        pct = c / total * 100
        print(f"    {s:8s}: {c:6d} ({pct:5.1f}%)")

    # 显示几个高分和低分样例
    sorted_results = sorted(results, key=lambda x: x["overnight_score"], reverse=True)
    print(f"\n  高分样例 (Top 5):")
    for r in sorted_results[:5]:
        print(f"    [{r['overnight_score']:.1f}] {r['name'][:50]}")

    print(f"\n  低分样例 (Bottom 5):")
    for r in sorted_results[-5:]:
        print(f"    [{r['overnight_score']:.1f}] {r['name'][:50]}")

    print(f"{'='*50}\n")


# ======================== 主入口 ========================
def main():
    parser = argparse.ArgumentParser(description="懂营地过夜友好度评分计算")
    parser.add_argument("--dry-run", action="store_true", help="试运行，不写入数据库")
    parser.add_argument("--apply", action="store_true", help="正式运行，写入数据库")
    parser.add_argument("--batch", type=int, default=500, help="每批处理数量 (默认500)")
    parser.add_argument("--limit", type=int, default=0, help="只处理前 N 个营地（测试用）")
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        print("请指定 --dry-run 或 --apply")
        sys.exit(1)

    key = os.getenv("SUPABASE_KEY", "")
    if not key:
        print("[!] 请先设置环境变量 SUPABASE_KEY")
        sys.exit(1)

    mode = "试运行" if args.dry_run else "正式运行"
    log(f"过夜友好度评分计算 - {mode}")
    log(f"批次大小: {args.batch}")

    with httpx.Client(
        limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
        timeout=60.0,
    ) as client:

        total = get_total_count(client, key)
        if args.limit > 0:
            total = min(total, args.limit)
        log(f"营地总数: {total}")

        all_results = []
        offset = 0
        processed = 0
        updated = 0
        batch_num = 0

        while offset < total:
            batch_num += 1
            batch_size = min(args.batch, total - offset)
            log(f"  第 {batch_num} 批: offset={offset}, size={batch_size}")

            # 获取数据
            spots = fetch_batch(client, key, offset, batch_size)
            if not spots:
                log("  无数据，结束")
                break

            # 计算评分
            batch_results = []
            for spot in spots:
                result = calculate_score(spot)
                result["id"] = spot["id"]
                result["name"] = spot.get("name", "")
                batch_results.append(result)

            all_results.extend(batch_results)
            processed += len(batch_results)

            # 写入数据库
            if args.apply:
                n = update_batch(client, key, batch_results)
                updated += n
                log(f"    计算 {len(batch_results)} 条, 写入 {n} 条")
            else:
                log(f"    计算 {len(batch_results)} 条 (dry-run)")

            offset += batch_size

            # 每 10 批打印一次进度统计
            if batch_num % 10 == 0:
                scores = [r["overnight_score"] for r in all_results]
                avg = sum(scores) / len(scores) if scores else 0
                log(f"  进度: {processed}/{total} ({processed/total*100:.1f}%), 当前均分={avg:.2f}")

        # 最终统计
        log(f"处理完成: {processed} 个营地")
        if args.apply:
            log(f"成功写入: {updated} 条")

        if all_results:
            print_statistics(all_results)


if __name__ == "__main__":
    main()
