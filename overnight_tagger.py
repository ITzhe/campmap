#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
营图 - 过夜属性智能标注工具 v1.0
通过关键词提取 + 场地类型推断, 批量标注营地的过夜友好属性

标注维度:
  - overnight_status: 能否过夜 (0未知/1可以/2不可/3不推荐)
  - noise_level: 噪音等级 (0-5)
  - safety_level: 安全程度 (0-5)
  - signal_level: 手机信号 (0-5)
  - ground_type: 地面类型 (0-6)
  - overnight_score: 过夜友好度综合评分 (0-5星)

使用方法:
    # 测试模式: 随机抽100条, 只打印结果不写入数据库
    python overnight_tagger.py --test --limit 100

    # 全量标注: 写入数据库 (需 SUPABASE_KEY 环境变量)
    python overnight_tagger.py --apply

    # 只标注某个省
    python overnight_tagger.py --apply --province 山西省

    # 查看统计报告
    python overnight_tagger.py --stats
"""

import argparse
import os
import re
import sys
from datetime import datetime
from typing import Dict, List, Tuple, Optional

try:
    import httpx
except ImportError:
    print("请先安装 httpx: pip install httpx")
    sys.exit(1)

# ======================== 配置 ========================

SUPABASE_URL = "https://drktdyfwawpfughuzqvs.supabase.co"
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRya3RkeWZ3YXdwZnVnaHV6cXZzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2ODkyMzYsImV4cCI6MjA5NTI2NTIzNn0.X2KV2LA3ofvhQCTJl3pLIV84VlYSYx0Vf4L3Etr1NEs"

BATCH_SIZE = 100  # 每批处理数量


def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def headers():
    key = SUPABASE_KEY or ANON_KEY
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept-Profile": "map",
        "Content-Profile": "map",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }


# ======================== 关键词规则 ========================

# --- 能否过夜 ---
OVERNIGHT_YES = [
    "可以过夜", "能过夜", "过夜没问题", "适合过夜", "驻车过夜",
    "床车", "房车驻车", "过夜首选", "推荐过夜", "经常有人过夜",
    "很多房车", "很多床车", "晚上也有车", "24小时", "通宵",
    "服务区", "服务站", "停车区", "加油站", "医院",
]

OVERNIGHT_NO = [
    "不能过夜", "不让过夜", "禁止过夜", "不准过夜",
    "晚上锁门", "夜间关闭", "晚上清场", "夜间清场",
    "只可临时停靠", "临时停车", "短暂停留", "不建议过夜",
    "不适合过夜", "过夜不推荐",
]

OVERNIGHT_NOT_RECOMMENDED = [
    "有点吵", "比较吵", "很吵", "太吵了", "噪音大",
    "大车多", "货车多", "重卡多", "通宵大车",
    "路边", "国道边", "省道边", "公路边",
]

# --- 噪音等级 ---
NOISE_LOW = [  # 1-2级
    "非常安静", "特别安静", "很安静", "安静", "幽静",
    "僻静", "清净", "宁静", "静悄悄",
    "公园深处", "小区里", "院内", "院子里",
]

NOISE_MID = [  # 3级
    "有点吵", "一般", "还行吧", "凑合",
    "白天吵", "白天热闹", "晚上就安静了", "晚上安静",
    "9点后安静", "10点后安静", "下班后人少",
]

NOISE_HIGH = [  # 4-5级
    "很吵", "太吵", "非常吵", "特别吵", "噪音大",
    "通宵吵", "一夜没睡好", "睡不着", "吵得慌",
    "大车多", "货车多", "重卡", "工程车",
    "国道旁", "省道旁", "高速旁", "高架下",
    "旁边是工地", "施工", "装修",
    "广场舞", "音乐", "喇叭",
]

# --- 安全程度 ---
SAFETY_HIGH = [  # 4-5级
    "非常安全", "很安全", "安全", "放心",
    "有保安", "有安保", "保安巡逻", "有人看管", "有人管理",
    "有监控", "监控全覆盖", "24小时监控",
    "有路灯", "照明好", "晚上很亮",
    "政府", "村委", "派出所", "法院", "机关",
    "服务区", "服务站", "医院", "加油站",
    "城区", "市区", "县城里", "镇上",
]

SAFETY_MID = [  # 3级
    "还行", "一般", "还可以", "凑合",
    "有其他车友", "有房车", "有床车", "有人一起",
    "村里", "村口", "乡镇",
]

SAFETY_LOW = [  # 1-2级
    "偏僻", "太偏了", "荒郊野外", "荒无人烟", "没人",
    "没有路灯", "很黑", "晚上害怕", "不太安全",
    "注意安全", "小心", "保管好财物", "注意防盗",
    "车窗被砸", "被盗", "被偷",
    "野地", "荒地", "无人区",
]

# --- 手机信号 ---
SIGNAL_GOOD = [  # 4-5级
    "信号很好", "信号满格", "5G", "4G满格",
    "信号不错", "信号好", "上网快",
    "移动联通电信都有", "三网都有",
]

SIGNAL_MID = [  # 3级
    "信号一般", "信号还行", "凑合用", "能打电话",
    "有信号", "移动有信号", "联通有信号",
]

SIGNAL_BAD = [  # 1-2级
    "信号差", "信号不好", "信号弱", "没信号", "无信号",
    "上不了网", "上网卡", "网速慢",
    "只有2G", "2G信号", "E网",
    "山里没信号", "山沟里没信号",
]

# --- 地面类型 ---
GROUND_HARD = [  # 1=硬化路面
    "硬化路面", "水泥地", "柏油路", "沥青", "地砖",
    "停车场", "停车位", "车位", "地下车库",
]

GROUND_GRAVEL = [  # 2=碎石
    "碎石", "石子路", "砂石", "砂石路",
]

GROUND_GRASS = [  # 3=草地
    "草地", "草坪", "草皮", "草地上",
]

GROUND_MUD = [  # 4=泥地
    "泥地", "泥土", "土路", "烂泥", "泥泞",
]

GROUND_SAND = [  # 5=沙土
    "沙地", "沙土", "沙滩", "沙土地",
]

GROUND_UNEVEN = [  # 6=斜坡不平
    "不平", "不平整", "斜坡", "坡地", "坡度大",
    "坑洼", "颠簸", "不好停车", "不好找平",
]

# --- 场地类型推断 (根据名称/地址关键词) ---
PLACE_TYPES = {
    "service_area": {
        "keywords": ["服务区", "服务站", "停车区"],
        "baseline": {  # 高速服务区基线
            "overnight_status": 1, "noise_level": 4,
            "safety_level": 5, "signal_level": 4, "ground_type": 1,
            "confidence": 0.8,
        }
    },
    "gas_station": {
        "keywords": ["加油站", "中石油", "中石化", "壳牌", "加油"],
        "baseline": {
            "overnight_status": 1, "noise_level": 3,
            "safety_level": 4, "signal_level": 4, "ground_type": 1,
            "confidence": 0.6,
        }
    },
    "hospital": {
        "keywords": ["医院", "卫生院", "人民医院", "中医院"],
        "baseline": {
            "overnight_status": 1, "noise_level": 3,
            "safety_level": 5, "signal_level": 5, "ground_type": 1,
            "confidence": 0.7,
        }
    },
    "gov_plaza": {
        "keywords": ["政府", "村委", "村委会", "广场", "文化广场", "市民广场", "镇政府", "乡政府"],
        "baseline": {
            "overnight_status": 1, "noise_level": 2,
            "safety_level": 5, "signal_level": 4, "ground_type": 1,
            "confidence": 0.7,
        }
    },
    "park": {
        "keywords": ["公园", "湿地公园", "森林公园", "生态公园", "体育公园"],
        "baseline": {
            "overnight_status": 0, "noise_level": 2,  # 不确定能不能过夜
            "safety_level": 4, "signal_level": 4, "ground_type": 1,
            "confidence": 0.5,
        }
    },
    "scenic": {
        "keywords": ["景区", "风景区", "景点", "旅游区", "度假区"],
        "baseline": {
            "overnight_status": 0, "noise_level": 1,
            "safety_level": 3, "signal_level": 3, "ground_type": 1,
            "confidence": 0.4,
        }
    },
    "mall": {
        "keywords": ["商场", "超市", "购物中心", "万达广场", "万象城"],
        "baseline": {
            "overnight_status": 2, "noise_level": 3,  # 一般不让过夜
            "safety_level": 5, "signal_level": 5, "ground_type": 1,
            "confidence": 0.5,
        }
    },
    "highway_stop": {
        "keywords": ["国道", "省道", "公路边", "路旁", "路边停车"],
        "baseline": {
            "overnight_status": 3, "noise_level": 4,  # 不推荐过夜
            "safety_level": 3, "signal_level": 4, "ground_type": 1,
            "confidence": 0.5,
        }
    },
    "village": {
        "keywords": ["村", "村庄", "村委会", "村部"],
        "baseline": {
            "overnight_status": 1, "noise_level": 1,
            "safety_level": 4, "signal_level": 3, "ground_type": 1,
            "confidence": 0.5,
        }
    },
}


# ======================== 核心算法 ========================

def match_keywords(text: str, keywords: List[str]) -> int:
    """统计文本中匹配到的关键词数量"""
    if not text:
        return 0
    count = 0
    for kw in keywords:
        if kw in text:
            count += 1
    return count


def infer_place_type(name: str, address: str) -> Tuple[str, Dict]:
    """根据名称和地址推断场地类型, 返回 (类型名, 基线属性)"""
    full_text = (name or "") + (address or "")
    for ptype, info in PLACE_TYPES.items():
        for kw in info["keywords"]:
            if kw in full_text:
                return ptype, info["baseline"]
    return "unknown", {}


def analyze_overnight(spot: Dict) -> Dict:
    """
    分析单个营地的过夜属性
    输入: 营地数据字典
    输出: { overnight_status, noise_level, safety_level, signal_level,
            ground_type, overnight_score, overnight_data_source, reasons: [] }
    """
    # 收集所有文本
    text_fields = [
        spot.get("name", ""),
        spot.get("address", ""),
        spot.get("intro", ""),
        spot.get("memo", ""),
        spot.get("parking_info", ""),
        spot.get("toilet_info", ""),
        spot.get("water_info", ""),
        spot.get("power_info", ""),
        spot.get("price_info", ""),
    ]
    full_text = " ".join([t for t in text_fields if t])

    result = {
        "overnight_status": 0,
        "noise_level": 0,
        "safety_level": 0,
        "signal_level": 0,
        "ground_type": 0,
        "overnight_score": 0.0,
        "overnight_data_source": "",
        "reasons": [],  # 推断理由, 用于调试
    }

    # --- 第1步: 场地类型基线推断 ---
    place_type, baseline = infer_place_type(
        spot.get("name", ""), spot.get("address", "")
    )
    if place_type != "unknown":
        for k, v in baseline.items():
            if k != "confidence" and v > 0:
                result[k] = v
        result["reasons"].append(f"场地类型:{place_type}")

    # --- 第2步: 关键词细化 (覆盖基线) ---

    # 能否过夜
    yes_count = match_keywords(full_text, OVERNIGHT_YES)
    no_count = match_keywords(full_text, OVERNIGHT_NO)
    not_rec_count = match_keywords(full_text, OVERNIGHT_NOT_RECOMMENDED)

    if yes_count > 0 and no_count == 0:
        result["overnight_status"] = 1
        result["reasons"].append(f"过夜关键词:{yes_count}个")
    elif no_count > 0:
        result["overnight_status"] = 2
        result["reasons"].append(f"禁过夜关键词:{no_count}个")
    elif not_rec_count > 2 and yes_count == 0:
        result["overnight_status"] = 3
        result["reasons"].append("条件一般不推荐过夜")

    # 噪音等级
    low_n = match_keywords(full_text, NOISE_LOW)
    mid_n = match_keywords(full_text, NOISE_MID)
    high_n = match_keywords(full_text, NOISE_HIGH)

    if high_n > 0 and low_n == 0:
        result["noise_level"] = min(5, 3 + high_n)
        result["reasons"].append(f"噪音高关键词:{high_n}个")
    elif low_n > 0 and high_n == 0:
        result["noise_level"] = max(1, 3 - low_n)
        result["reasons"].append(f"安静关键词:{low_n}个")
    elif mid_n > 0:
        result["noise_level"] = 3
        result["reasons"].append("噪音一般")

    # 安全程度
    safe_n = match_keywords(full_text, SAFETY_HIGH)
    mid_safe_n = match_keywords(full_text, SAFETY_MID)
    unsafe_n = match_keywords(full_text, SAFETY_LOW)

    if safe_n > 0 and unsafe_n == 0:
        result["safety_level"] = min(5, 3 + safe_n)
        result["reasons"].append(f"安全关键词:{safe_n}个")
    elif unsafe_n > 0 and safe_n == 0:
        result["safety_level"] = max(1, 3 - unsafe_n)
        result["reasons"].append(f"安全隐患关键词:{unsafe_n}个")
    elif mid_safe_n > 0:
        result["safety_level"] = 3

    # 手机信号
    good_sig = match_keywords(full_text, SIGNAL_GOOD)
    mid_sig = match_keywords(full_text, SIGNAL_MID)
    bad_sig = match_keywords(full_text, SIGNAL_BAD)

    if good_sig > 0 and bad_sig == 0:
        result["signal_level"] = min(5, 4 + good_sig)
        result["reasons"].append(f"信号好关键词:{good_sig}个")
    elif bad_sig > 0 and good_sig == 0:
        result["signal_level"] = max(1, 3 - bad_sig)
        result["reasons"].append(f"信号差关键词:{bad_sig}个")
    elif mid_sig > 0:
        result["signal_level"] = 3

    # 地面类型
    if match_keywords(full_text, GROUND_HARD):
        result["ground_type"] = 1
        result["reasons"].append("硬化路面")
    elif match_keywords(full_text, GROUND_GRASS):
        result["ground_type"] = 3
        result["reasons"].append("草地")
    elif match_keywords(full_text, GROUND_GRAVEL):
        result["ground_type"] = 2
        result["reasons"].append("碎石")
    elif match_keywords(full_text, GROUND_MUD):
        result["ground_type"] = 4
        result["reasons"].append("泥地")
    elif match_keywords(full_text, GROUND_SAND):
        result["ground_type"] = 5
        result["reasons"].append("沙土")

    if match_keywords(full_text, GROUND_UNEVEN) and result["ground_type"] == 0:
        result["ground_type"] = 6
        result["reasons"].append("不平整")

    # --- 第3步: 计算过夜友好度综合评分 ---
    result["overnight_score"] = calc_overnight_score(result, spot)

    # 数据来源
    sources = []
    if place_type != "unknown":
        sources.append("type")
    if len(result["reasons"]) > 1 or (len(result["reasons"]) == 1 and not result["reasons"][0].startswith("场地类型")):
        sources.append("keyword")
    result["overnight_data_source"] = "+".join(sources) if sources else "none"

    return result


def calc_overnight_score(r: Dict, spot: Dict) -> float:
    """
    计算过夜友好度综合评分 (0-5星)
    权重分配:
      - 能否过夜: 25% (前提条件, 不能过夜直接0分)
      - 安全程度: 25% (最重要)
      - 噪音等级: 20% (越安静越好)
      - 手机信号: 15%
      - 地面平整度: 10%
      - 基础设施加成: 5% (厕所/水/电)

    置信度惩罚: 数据维度越少, 评分上限越低, 避免仅凭少量信息给高分
    """
    # 不能过夜 = 0分
    if r["overnight_status"] == 2:
        return 0.0

    weighted_sum = 0.0
    total_weight = 0.0
    data_dimensions = 0  # 有多少个维度有数据

    # 1. 能否过夜 (前提, 占25%)
    if r["overnight_status"] == 1:
        weighted_sum += 5.0 * 0.25
        total_weight += 0.25
        data_dimensions += 1
    elif r["overnight_status"] == 3:  # 不推荐
        weighted_sum += 2.0 * 0.25
        total_weight += 0.25
        data_dimensions += 1
    # overnight_status=0 时不计入

    # 2. 安全程度 (25%)
    if r["safety_level"] > 0:
        weighted_sum += r["safety_level"] * 0.25
        total_weight += 0.25
        data_dimensions += 1

    # 3. 噪音等级 (20%) — 反转: 越安静分越高
    if r["noise_level"] > 0:
        reversed_noise = 6 - r["noise_level"]  # 1级安静=5分, 5级吵=1分
        weighted_sum += reversed_noise * 0.20
        total_weight += 0.20
        data_dimensions += 1

    # 4. 手机信号 (15%)
    if r["signal_level"] > 0:
        weighted_sum += r["signal_level"] * 0.15
        total_weight += 0.15
        data_dimensions += 1

    # 5. 地面类型 (10%)
    ground_scores = {1: 5, 2: 3.5, 3: 4, 4: 2, 5: 2.5, 6: 1.5}
    if r["ground_type"] > 0:
        weighted_sum += ground_scores.get(r["ground_type"], 3) * 0.10
        total_weight += 0.10
        data_dimensions += 1

    # 6. 基础设施加成 (5%) — 厕所/水/电/淋浴
    fac_score = 0
    if spot.get("toilet_status") == 1:
        fac_score += 1
    if spot.get("water_status") == 1:
        fac_score += 1
    if spot.get("power_status") == 1:
        fac_score += 1.5
    if spot.get("shower_status") == 1:
        fac_score += 1.5
    if fac_score > 0:
        fac_bonus = min(5, fac_score * 1.25)
        weighted_sum += fac_bonus * 0.05
        total_weight += 0.05
        # 基础设施不算独立维度, 算作附加项

    # 没有任何有效数据 = 0分(未评分)
    if data_dimensions == 0 and total_weight == 0:
        return 0.0

    # 归一化: 加权和 / 总权重 = 0-5分
    if total_weight > 0:
        normalized = weighted_sum / total_weight
    else:
        normalized = 0.0

    # 置信度惩罚: 数据维度越少, 上限越低
    # 1个维度: 最高3.0星 (数据太少, 不敢给高分)
    # 2个维度: 最高4.0星
    # 3个维度: 最高4.5星
    # 4个及以上: 不设限 (最高5.0星)
    caps = {0: 0.0, 1: 3.0, 2: 4.0, 3: 4.5}
    cap = caps.get(data_dimensions, 5.0) if data_dimensions > 0 else 0
    final_score = min(normalized, cap) if cap > 0 else normalized

    # 保底: 只要确定能过夜, 至少给2.5星(及格线)
    if r["overnight_status"] == 1 and final_score < 2.5 and data_dimensions >= 1:
        final_score = 2.5

    return round(final_score, 1)


# ======================== 数据库操作 ========================

def fetch_spots(limit: int = 100, province: str = None, offset: int = 0) -> List[Dict]:
    """从数据库获取营地数据"""
    url = f"{SUPABASE_URL}/rest/v1/camping_spots"
    params = {
        "select": "id,name,address,intro,memo,province,city,"
                  "parking_status,parking_info,toilet_status,toilet_info,"
                  "water_status,water_info,power_status,power_info,"
                  "shower_status,rv_friendly,trailer_friendly,tent_friendly,"
                  "charging_status,cooking_status,fire_status,fishing_status,"
                  "grocery_status,dining_status,accommodation_status,price_info",
        "limit": str(limit),
        "offset": str(offset),
        "order": "id.asc",
    }
    if province:
        params["province"] = f"eq.{province}"

    with httpx.Client(timeout=30) as client:
        resp = client.get(url, headers=headers(), params=params)
        resp.raise_for_status()
        return resp.json()


def count_spots(province: str = None) -> int:
    """统计营地总数"""
    url = f"{SUPABASE_URL}/rest/v1/camping_spots"
    params = {"select": "id", "limit": "1"}
    if province:
        params["province"] = f"eq.{province}"

    h = headers()
    h["Prefer"] = "count=exact"
    with httpx.Client(timeout=30) as client:
        resp = client.get(url, headers=h, params=params)
        resp.raise_for_status()
        return int(resp.headers.get("content-range", "0/0").split("/")[-1])


def update_spot(spot_id: int, data: Dict) -> bool:
    """更新单条营地数据"""
    url = f"{SUPABASE_URL}/rest/v1/camping_spots"
    with httpx.Client(timeout=30) as client:
        resp = client.patch(
            f"{url}?id=eq.{spot_id}",
            headers=headers(),
            json=data,
        )
        return resp.status_code == 204


# ======================== 模式函数 ========================

def run_test(limit: int, province: str = None):
    """测试模式: 只分析不写入"""
    log(f"测试模式: 获取 {limit} 条营地数据...")
    spots = fetch_spots(limit=limit, province=province)
    log(f"获取到 {len(spots)} 条数据")

    stats = {
        "total": len(spots),
        "overnight_yes": 0, "overnight_no": 0, "overnight_not_rec": 0, "overnight_unknown": 0,
        "with_noise": 0, "with_safety": 0, "with_signal": 0, "with_ground": 0,
        "with_score": 0,
        "score_dist": {"5": 0, "4": 0, "3": 0, "2": 0, "1": 0, "0": 0},
    }

    print("\n" + "=" * 100)
    print(f"{'ID':<6} {'名称':<20} {'过夜':<4} {'噪音':<4} {'安全':<4} {'信号':<4} {'地面':<4} {'评分':<5} 推断依据")
    print("-" * 100)

    ground_names = {0: "未知", 1: "硬化", 2: "碎石", 3: "草地", 4: "泥地", 5: "沙土", 6: "不平"}
    overnight_names = {0: "未知", 1: "可以", 2: "不行", 3: "不推荐"}

    for spot in spots:
        result = analyze_overnight(spot)

        # 统计
        if result["overnight_status"] == 1:
            stats["overnight_yes"] += 1
        elif result["overnight_status"] == 2:
            stats["overnight_no"] += 1
        elif result["overnight_status"] == 3:
            stats["overnight_not_rec"] += 1
        else:
            stats["overnight_unknown"] += 1

        if result["noise_level"] > 0:
            stats["with_noise"] += 1
        if result["safety_level"] > 0:
            stats["with_safety"] += 1
        if result["signal_level"] > 0:
            stats["with_signal"] += 1
        if result["ground_type"] > 0:
            stats["with_ground"] += 1
        if result["overnight_score"] > 0:
            stats["with_score"] += 1

        score_bucket = str(int(result["overnight_score"]))
        if score_bucket in stats["score_dist"]:
            stats["score_dist"][score_bucket] += 1

        name = spot["name"][:18] + ".." if len(spot["name"]) > 20 else spot["name"]
        reasons = ", ".join(result["reasons"][:3])
        print(
            f"{spot['id']:<6} {name:<20} "
            f"{overnight_names[result['overnight_status']]:<4} "
            f"{result['noise_level'] or '-':<4} "
            f"{result['safety_level'] or '-':<4} "
            f"{result['signal_level'] or '-':<4} "
            f"{ground_names[result['ground_type']]:<4} "
            f"{result['overnight_score']:<5} "
            f"{reasons}"
        )

    # 统计报告
    print("\n" + "=" * 100)
    print("【统计报告】")
    print(f"  总样本数: {stats['total']}")
    print(f"  能否过夜: 可以={stats['overnight_yes']} 不行={stats['overnight_no']} "
          f"不推荐={stats['overnight_not_rec']} 未知={stats['overnight_unknown']}")
    print(f"  有噪音数据: {stats['with_noise']} ({stats['with_noise']/stats['total']*100:.1f}%)")
    print(f"  有安全数据: {stats['with_safety']} ({stats['with_safety']/stats['total']*100:.1f}%)")
    print(f"  有信号数据: {stats['with_signal']} ({stats['with_signal']/stats['total']*100:.1f}%)")
    print(f"  有地面数据: {stats['with_ground']} ({stats['with_ground']/stats['total']*100:.1f}%)")
    print(f"  有综合评分: {stats['with_score']} ({stats['with_score']/stats['total']*100:.1f}%)")
    print(f"  评分分布:")
    for i in range(5, -1, -1):
        cnt = stats["score_dist"][str(i)]
        pct = cnt / stats["total"] * 100
        bar = "█" * int(pct / 2)
        print(f"    {i}星: {cnt:>4} ({pct:>5.1f}%) {bar}")


def run_apply(province: str = None):
    """全量标注模式: 写入数据库"""
    if not SUPABASE_KEY:
        log("错误: 请设置 SUPABASE_KEY 环境变量 (service_role key)")
        sys.exit(1)

    total = count_spots(province)
    log(f"开始全量标注, 共 {total} 条营地数据" + (f" (省份: {province})" if province else ""))

    updated = 0
    skipped = 0
    errors = 0
    offset = 0

    while offset < total:
        batch_end = min(offset + BATCH_SIZE, total)
        log(f"处理 {offset+1}-{batch_end} / {total} ...")

        spots = fetch_spots(limit=BATCH_SIZE, province=province, offset=offset)

        for spot in spots:
            try:
                result = analyze_overnight(spot)

                # 没有任何有效数据就跳过
                if result["overnight_data_source"] == "none":
                    skipped += 1
                    continue

                update_data = {
                    "overnight_status": result["overnight_status"],
                    "noise_level": result["noise_level"],
                    "safety_level": result["safety_level"],
                    "signal_level": result["signal_level"],
                    "ground_type": result["ground_type"],
                    "overnight_score": result["overnight_score"],
                    "overnight_data_source": result["overnight_data_source"],
                }

                ok = update_spot(spot["id"], update_data)
                if ok:
                    updated += 1
                else:
                    errors += 1

            except Exception as e:
                errors += 1
                log(f"  错误: 营地 {spot.get('id')} - {e}")

        offset += BATCH_SIZE

    log(f"完成! 更新 {updated} 条, 跳过 {skipped} 条, 错误 {errors} 条")


def run_stats():
    """查看当前数据库的过夜字段统计"""
    log("获取统计数据...")
    # 简单起见, 取前1000条统计
    spots = fetch_spots(limit=1000)

    stats = {
        "total": len(spots),
        "overnight": {0: 0, 1: 0, 2: 0, 3: 0},
        "noise": {},
        "safety": {},
        "signal": {},
        "ground": {},
        "scored": 0,
    }

    for s in spots:
        ov = s.get("overnight_status", 0)
        stats["overnight"][ov] = stats["overnight"].get(ov, 0) + 1
        nl = s.get("noise_level", 0)
        stats["noise"][nl] = stats["noise"].get(nl, 0) + 1
        sl = s.get("safety_level", 0)
        stats["safety"][sl] = stats["safety"].get(sl, 0) + 1
        sig = s.get("signal_level", 0)
        stats["signal"][sig] = stats["signal"].get(sig, 0) + 1
        gr = s.get("ground_type", 0)
        stats["ground"][gr] = stats["ground"].get(gr, 0) + 1
        if s.get("overnight_score", 0) > 0:
            stats["scored"] += 1

    print(f"\n【过夜属性统计】(抽样 {len(spots)} 条)")
    ov_names = {0: "未知", 1: "可以过夜", 2: "不可过夜", 3: "不推荐过夜"}
    print(f"  能否过夜:")
    for k, v in sorted(stats["overnight"].items()):
        print(f"    {ov_names.get(k, k)}: {v} ({v/len(spots)*100:.1f}%)")
    print(f"  有综合评分: {stats['scored']} ({stats['scored']/len(spots)*100:.1f}%)")


# ======================== 主函数 ========================

def main():
    parser = argparse.ArgumentParser(description="营图 - 过夜属性智能标注工具")
    parser.add_argument("--test", action="store_true", help="测试模式: 只分析不写入")
    parser.add_argument("--apply", action="store_true", help="应用模式: 写入数据库")
    parser.add_argument("--stats", action="store_true", help="查看统计")
    parser.add_argument("--limit", type=int, default=100, help="测试模式的样本数量")
    parser.add_argument("--province", type=str, default=None, help="指定省份")
    args = parser.parse_args()

    if args.stats:
        run_stats()
    elif args.test:
        run_test(args.limit, args.province)
    elif args.apply:
        run_apply(args.province)
    else:
        parser.print_help()
        print("\n示例:")
        print("  python overnight_tagger.py --test --limit 50")
        print("  python overnight_tagger.py --test --limit 200 --province 山西省")
        print("  python overnight_tagger.py --apply --province 山西省")
        print("  python overnight_tagger.py --stats")


if __name__ == "__main__":
    main()
