"""
懂营地过夜友好度评分计算脚本
================================
基于设施字段 + 营地类型，为 dongyingdi_spots 表批量计算过夜友好度评分。

评分公式（第一阶段，设施基础分）：
  综合评分 = 基础设施分 × 类型系数 + 额外加分

  基础设施分（满分 4.0）：
    厕所 0.8 + 水 0.7 + 电 0.6 + 淋浴 0.5 + 做饭 0.5 + 帐篷 0.5 + 餐饮 0.4

  类型系数：
    专业营地（露营地/房车营地/自驾车营地等）× 1.2
    公园/服务区/景区停车场 × 1.0
    路边/观景台/临时停靠 × 0.8

  额外加分（最高 1.0）：
    可停拖挂 + 0.3
    可钓鱼 + 0.2
    有水 + 有厕所 + 可做饭 → 基础过夜三件套 + 0.3
    有电 + 0.2

  三个维度：
    能否过夜：根据综合评分映射到 3 档
    噪音：基于营地类型粗估（第一阶段）
    安全：基于设施 + 类型粗估（第一阶段）

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
    "tent_friendly": 0.5,    # 帐篷
    "dining_status": 0.4,    # 餐饮
}

# 营地类型关键词 → 类型等级
# level 2 = 专业营地 (×1.2) — 真正有管理的营地
# level 1 = 公园/服务区/普通驻车地 (×1.0) — 中性，设施分说了算
# level 0 = 路边/临时 (×0.8) — 明显不适合过夜的类型
#
# 注意："露营地(驻车地)"是懂营地的默认分类，范围很宽，不能当作专业营地
TYPE_KEYWORDS = {
    2: [
        "房车营地", "自驾车营地", "自驾营地", "汽车营地",
        "露营地",  # 纯"露营地"（不含"驻车地"后缀的才算专业营地）
        "度假村", "度假营", "农庄", "庄园", "露营公园",
        "星空营地", "帐篷营地", "温泉营地",
    ],
    1: [
        "服务区", "服务点", "驿站", "公园", "停车场",
        "景区", "景点", "广场", "游客中心",
        "水库", "湖边", "江边", "河边", "海边", "湿地",
        "体育馆", "体育中心", "文化中心",
    ],
    0: [
        "路边", "路旁", "观景台", "观景点", "临时停靠",
        "加油站", "公路旁", "国道旁", "省道旁",
    ],
}

# level 2 的关键词必须命中（不能包含"驻车地"）
PROFESSIONAL_EXCLUDE = ["驻车地"]

TYPE_COEFFICIENT = {
    2: 1.2,
    1: 1.0,
    0: 0.8,
}

TYPE_LABEL = {
    2: "专业营地",
    1: "公园/服务区",
    0: "路边/临时",
}


def log(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ======================== 评分计算 ========================
def classify_camp_type(cate: str, name: str) -> int:
    """根据类型字段和名称判断营地等级"""
    text = f"{cate} {name}"

    # 先检查是否是专业营地（需要命中关键词且不含排除词）
    is_professional = False
    for kw in TYPE_KEYWORDS[2]:
        if kw in text:
            # 检查排除词：如果 cate 或 name 包含"驻车地"，不算专业营地
            if any(excl in cate for excl in PROFESSIONAL_EXCLUDE):
                break
            is_professional = True
            break
    if is_professional:
        return 2

    # 检查是否是路边/临时类型（最差档）
    for kw in TYPE_KEYWORDS[0]:
        if kw in text:
            return 0

    # 默认归为 1（公园/服务区/普通驻车地）
    return 1


def estimate_noise(camp_type: int, name: str) -> str:
    """估算噪音程度（第一阶段：基于类型和名称关键词）"""
    # 关键词检测
    name_lower = name
    if any(kw in name_lower for kw in ["高速", "国道", "省道", "路边", "路旁", "大路边", "马路边"]):
        return "较吵"
    if any(kw in name_lower for kw in ["公园", "森林", "山林", "湖边", "水库", "江边", "海边", "湿地"]):
        return "较安静"

    # 按类型
    if camp_type == 2:
        return "一般"
    elif camp_type == 1:
        return "一般"
    else:
        return "较吵"


def estimate_safety(spot: Dict, camp_type: int) -> str:
    """估算安全程度（第一阶段：基于设施和类型）

    评分标准：
    - 有厕所 → 有人管理 +1
    - 有餐饮 → 有人活动 +1
    - 有电 → 有基础设施 +1
    - 专业营地 → 有管理 +1
    - 收费 → 通常有管理 +0.5

    阈值：
    - ≥3.0 → 很安全
    - ≥1.5 → 一般
    - <1.5 → 需注意
    """
    score = 0
    if spot.get("toilet_status") == 1:
        score += 1
    if spot.get("dining_status") == 1:
        score += 1
    if spot.get("power_status") == 1:
        score += 1
    if camp_type == 2:
        score += 1
    if spot.get("is_fee") == 1:
        score += 0.5

    if score >= 3.0:
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
    # 1. 基础设施分
    base_score = 0.0
    for field, weight in FACILITY_WEIGHTS.items():
        if spot.get(field) == 1:
            base_score += weight

    # 2. 营地类型系数
    camp_type = classify_camp_type(spot.get("cate", ""), spot.get("name", ""))
    type_coeff = TYPE_COEFFICIENT[camp_type]

    # 3. 额外加分
    bonus = 0.0
    # 拖挂友好
    if spot.get("trailer_friendly") == 1:
        bonus += 0.3
    # 可钓鱼
    if spot.get("fishing_status") == 1:
        bonus += 0.2
    # 过夜三件套（水+厕所+做饭）
    if (spot.get("water_status") == 1
            and spot.get("toilet_status") == 1
            and spot.get("cook_friendly") == 1):
        bonus += 0.3
    # 有电
    if spot.get("power_status") == 1:
        bonus += 0.2

    # 额外加分封顶 1.0
    bonus = min(bonus, 1.0)

    # 4. 综合评分
    total_score = base_score * type_coeff + bonus

    # 封顶 5.0
    total_score = min(total_score, 5.0)
    # 保留 1 位小数
    total_score = round(total_score, 1)

    # 5. 过夜状态
    status, status_label = calc_overnight_status(total_score)

    # 6. 噪音估算
    noise = estimate_noise(camp_type, spot.get("name", ""))

    # 7. 安全估算
    safety = estimate_safety(spot, camp_type)

    return {
        "overnight_score": total_score,
        "overnight_status": status,
        "status_label": status_label,
        "dim_noise": noise,
        "dim_safety": safety,
        "score_source": "facility_calculated",
        "camp_type_level": camp_type,
        "base_score": round(base_score, 2),
        "type_coeff": type_coeff,
        "bonus": round(bonus, 2),
    }


# ======================== 数据库操作 ========================
def get_total_count(client: httpx.Client, key: str) -> int:
    """获取总记录数（通过 HEAD 请求读取 content-range）"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Prefer": "count=exact",
    }
    r = client.head(
        f"{SUPABASE_URL}/rest/v1/{TABLE}?select=id",
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
    fields = "id,name,cate,water_status,power_status,toilet_status,shower_status," \
             "tent_friendly,cook_friendly,fishing_status,dining_status," \
             "trailer_friendly,is_fee,stay_status"
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
    """批量更新评分"""
    h = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Prefer": "return=minimal,resolution=merge-duplicates",
        "Content-Type": "application/json",
    }
    # 只保留需要写入的字段
    payload = []
    for r in records:
        payload.append({
            "id": r["id"],
            "overnight_score": r["overnight_score"],
            "overnight_status": r["overnight_status"],
            "dim_noise": r["dim_noise"],
            "dim_safety": r["dim_safety"],
            "score_source": r["score_source"],
            "score_updated_at": datetime.utcnow().isoformat() + "Z",
        })

    endpoint = f"{SUPABASE_URL}/rest/v1/{TABLE}?on_conflict=id"
    r = client.post(endpoint, json=payload, headers=h, timeout=60)
    if r.status_code in (200, 201, 204):
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

    # 营地类型分布
    type_counts = {}
    for r in results:
        t = r["camp_type_level"]
        type_counts[t] = type_counts.get(t, 0) + 1
    print(f"\n  营地类型分布:")
    for t in sorted(type_counts.keys()):
        count = type_counts[t]
        pct = count / total * 100
        label = TYPE_LABEL.get(t, f"level={t}")
        print(f"    {label:12s}: {count:6d} ({pct:5.1f}%)")

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
