# 营图 - 设计文档

> 最后更新: 2026-09-13
> 当前版本: v1.1.0

## 一、项目概述

营图是一款面向房车、帐篷露营爱好者的营地发现工具。整合全国各地营地信息，提供精确的地图定位、设施查询、线路规划与用户评价服务。

**核心数据**：全国 337 个地级行政区，66,306 个营地（安营 + 懂营地双数据源合并去重后），包含停车、水电、设施、价格、过夜友好度评分、用户评论等完整信息。

---

## 二、技术架构

### 2.1 前端
- **框架**：微信小程序原生开发
- **地图**：微信内置 map 组件（腾讯地图）
- **路线规划**：腾讯地图 WebService Direction API（驾车路线）
- **天气查询**：腾讯地图 WebService Weather API（实时天气）
- **内容安全**：微信 msgSecCheck / imgSecCheck API（通过 Supabase Edge Function 代理）
- **样式系统**：CSS 变量 + 全局 app.wxss 设计令牌
- **注意**：`cover-view` 组件不支持 CSS 变量和 `box-shadow`，map 内样式需使用硬编码颜色

### 2.2 后端
- **数据库**：Supabase (PostgreSQL)
  - Schema: `map`
  - 统一营地表: `unified_spots`（66,306 条，安营 + 懂营地合并去重后）
  - 源数据表: `camping_spots`（安营，25,352 条）+ `dongyingdi_spots`（懂营地，53,643 条）
  - 评论表: `camp_comments`（用户自评）+ `anying_comments`（安营爬取）+ `dongyingdi_comments`（懂营地爬取）
  - 评论点赞表: `comment_likes`
  - 营地纠错表: `camp_corrections`
  - 营地相册表: `camp_photos`
  - 用户积分: `user_points`
  - RPC: `daily_checkin`, `deduct_point`, `increment_like`, `truncate_unified_spots`, `batch_update_dyd_score`, `batch_update_anying_score`, `recalculate_overnight_score`
- **API**：Supabase REST API (PostgREST)
- **对象存储**：阿里云 OSS (`camp-map.oss-cn-beijing.aliyuncs.com`)，用于用户头像、营地纠错照片、评论图片等图片上传
- **数据采集**：Python 脚本批量采集
  - `collect_national.py` — 安营 API 采集，覆盖全国 337 个地级行政区
  - `collect_dongyingdi.py` — 懂营地 API 采集，AES 加密解密 + 并发详情/评论
  - `score_anying.py` / `score_dongyingdi.py` — 过夜友好度评分计算
  - `merge_to_unified.py` — 双数据源去重合并到 unified_spots 表
  - `randomize_nicknames.py` — 爬取评论用户昵称随机化

### 2.3 服务器域名配置 (微信小程序后台)

真机发布时必须在微信公众平台 → 开发管理 → 开发设置 → 服务器域名中添加：

| 类型 | 域名 | 用途 |
|------|------|------|
| request合法域名 | `https://drktdyfwawpfughuzqvs.supabase.co` | 数据库 API |
| request合法域名 | `https://apis.map.qq.com` | 腾讯地图 API (路线规划 + POI 搜索) |
| uploadFile合法域名 | `https://camp-map.oss-cn-beijing.aliyuncs.com` | 阿里云 OSS 图片上传 |

### 2.4 本地存储 (localStorage)

| Key | 用途 |
|-----|------|
| `camp_user` | 用户数据 (本地标识, 积分, 签到, 加入日期) |
| `camp_favorites` | 收藏的营地列表 |
| `camp_submissions` | 用户提交的营地列表 |
| `camp_settings` | 应用设置 (通知, 地图缩放偏好, 房车营地显示) |
| `route_favorites` | 收藏的路线 |
| `feedback_list` | 用户反馈 |
| `liked_comment_ids` | 已点赞评论 ID 列表 |

### 2.5 用户标识说明
- `openid` 为本地生成的随机字符串 (`mock_` + random)，不调用 `wx.login`，不获取微信真实身份
- 昵称通过 `<input type="nickname">` 组件获取（微信官方推荐方式）
- 头像通过 `<button open-type="chooseAvatar">` 组件获取
- 手机号为选填项，存储在本地 `camp_user.phone` 中，用于营地审核联系
- 不收集用户微信号等联系方式

### 2.6 腾讯地图 API 配置
- **API Key**: 在 `utils/config.js` 中配置 `MAP_KEY`
- **需开通的服务**:
  - WebService API - 路径规划 (Direction API): 用于线路规划的驾车路线
  - WebService API - 天气查询 (Weather API): 用于营地天气信息显示
- **开通方式**: 腾讯地图控制台 → 应用管理 → 选择应用 → 开启对应的 WebService 权限
- **常见错误码**:
  - 120: 该 Key 未开通对应服务
  - 310: Key 无效或被禁用
  - 311: 请求频率超限

---

## 三、设计系统

### 3.1 色彩

| 变量 | 值 | 用途 |
|------|------|------|
| `--green` | `#2d6a4f` | 主色（导航栏、按钮、强调） |
| `--green-2` | `#40916c` | 次绿色（渐变、图标） |
| `--green-3` | `#52b788` | 亮绿色 |
| `--green-light` | `#d8f3dc` | 浅绿色背景（标签、卡片） |
| `--orange` | `#f4a261` | 橙色（收费标记、途经点） |
| `--red` | `#ee6c4d` | 红色（终点、退出、警告） |
| `--blue` | `#277da1` | 蓝色（房车营地标记） |
| `--bg` | `#f4f7f5` | 页面背景 |
| `--text` | `#1a2e1f` | 主文本 |
| `--text-2` | `#6b7c70` | 次文本 |
| `--text-ph` | `#adb5bd` | 占位文本 |
| `--line` | `#dde6e0` | 分割线 |

### 3.2 字号
- 标题: 32-34rpx / 700
- 卡片标题: 28rpx / 700
- 正文: 26-28rpx
- 标签: 22-24rpx
- 微提示: 20-22rpx

### 3.3 圆角与阴影
- 卡片圆角: `--radius: 24rpx`
- 小圆角: `--radius-sm: 16rpx`
- 卡片阴影: `0 4rpx 24rpx rgba(45, 106, 79, 0.12)`
- FAB 阴影: `0 8rpx 28rpx rgba(0, 0, 0, 0.18)`
- **注意**: `cover-view` 内不支持 `box-shadow`，需用硬编码

### 3.4 营地标记 (矢量图标)
- 🟢 绿色图钉 (`free.png`, 2.9K): 免费营地
- 🟠 橙色图钉 (`paid.png`, 2.9K): 收费营地
- 所有标记使用透明背景 PNG，`anchor: { x: 0.5, y: 1 }` 定位
- 不使用 callout（避免白框问题）
- 地图图例仅显示免费和收费两类标记

### 3.5 资源大小约束
- 微信小程序单个图片/音频资源不超过 200K
- 所有图片资源均为 PNG 格式，最大 2.9K
- 项目总大小约 780K（不含 .git）

---

## 四、页面结构

### 4.1 页面清单 (15 个页面)

| 页面 | 路径 | 类型 | 功能 |
|------|------|------|------|
| 地图首页 | `pages/map/` | TabBar | 全屏地图、营地标记、筛选、底部卡片、天气信息 |
| 线路规划 | `pages/route/` | TabBar | 起终点选择(wx.chooseLocation)、途经点(无限制)排序、驾车路线、沿途营地(5km走廊) |
| 我的 | `pages/mine/` | TabBar | 用户信息、签到、功能入口 |
| 营地详情 | `pages/detail/` | Navigate | 设施、价格、评价、收藏、打卡、营地相册、纠错 |
| 营地录入 | `pages/submit/` | Navigate | 用户提交新营地 |
| 积分明细 | `pages/points/` | Navigate | 积分历史、签到周历 |
| 城市选择 | `pages/city-picker/` | Navigate | 按省份选择城市 |
| 意见反馈 | `pages/feedback/` | Navigate | 反馈类型、内容描述 |
| 使用教程 | `pages/tutorial/` | Navigate | 6 步功能引导 |
| 线路收藏 | `pages/route-fav/` | Navigate | 收藏的路线列表 |
| 关于我们 | `pages/about/` | Navigate | 项目介绍、数据来源、版权声明、免责声明 |
| **应用设置** | `pages/settings/` | Navigate | 通知、地图缩放、缓存、退出 |
| **我的收藏** | `pages/favorites/` | Navigate | 收藏的营地列表 |
| **我的提交** | `pages/submissions/` | Navigate | 提交的营地及审核状态 |
| **隐私协议** | `pages/privacy/` | Navigate | 隐私政策、数据版权与禁止爬取条款 |

### 4.2 导航流程

```
[TabBar]
├── 地图首页 ──→ 营地详情 ──→ (导航/分享/收藏/打卡/评论/纠错/相册)
│    ├──→ 城市选择
│    └──→ 营地录入
├── 线路规划 ──→ 沿途营地列表 ──→ 营地详情
│    ├──→ 线路收藏
│    └── 途经点 (无限制)
└── 我的
     ├──→ 积分明细
     ├──→ 营地录入
     ├──→ 我的收藏 ──→ 营地详情
     ├──→ 我的提交 ──→ 营地详情
     ├──→ 线路收藏
     ├──→ 意见反馈
     ├──→ 使用教程
     ├──→ 应用设置
     └──→ 关于我们
```

---

## 五、数据字段

### 5.1 统一营地表 (unified_spots)

> 前端唯一查询的营地表，由 `merge_to_unified.py` 从 `camping_spots` + `dongyingdi_spots` 合并去重后生成。

| 字段 | 类型 | 说明 |
|------|------|------|
| spot_code | text | 营地唯一编码 (PK)，安营原样，懂营地加 `dyd_` 前缀 |
| name | text | 营地名称 |
| address | text | 地址 |
| latitude | numeric | 纬度 |
| longitude | numeric | 经度 |
| parking_status | int | 停车收费 (0=免费, 1=收费) |
| toilet_status | int | 厕所 |
| water_status | int | 接水 |
| power_status | int | 接市电 |
| charging_status | int | 充电桩 |
| rv_friendly | int | 房车可停 (0/1) |
| trailer_friendly | int | 拖挂可停 (0/1) |
| tent_friendly | int | 帐篷可搭 (0/1) |
| shower_status | int | 淋浴 |
| fishing_status | int | 钓鱼 |
| cooking_status | int | 做饭 |
| fire_status | int | 明火 |
| repair_status | int | 修车 |
| grocery_status | int | 买菜/超市 |
| dining_status | int | 餐饮 |
| accommodation_status | int | 住宿 |
| overnight_score | numeric | 过夜友好度评分 (0-5.0) |
| overnight_status | int | 过夜状态 (1=可以过夜, 2=勉强能住, 3=不建议) |
| noise_level | int | 噪音等级 (1-5，安营格式) |
| safety_level | int | 安全等级 (1-5，安营格式) |
| dim_noise | text | 噪音描述 (懂营地格式：较安静/一般/较吵) |
| dim_safety | text | 安全描述 (懂营地格式：很安全/一般/需注意) |
| signal_level | int | 手机信号 (0=未知) |
| ground_type | int | 地面类型 (0=未知) |
| overnight_data_source | text | 评分来源 |
| score_source | text | 评分计算方式 (facility_calculated 等) |
| source_type | text | 数据来源 (anying/dyd/merged) |
| dyd_id | int | 懂营地原始 ID（用于关联评论，可为空） |
| price_info | text | 收费备注 |
| intro | text | 营地简介 |
| memo | text | 营地备注 |

### 5.2 评论数据 (三张表)

**用户自评评论 (camp_comments)**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 评论 ID (PK) |
| spot_code | text | 营地编码 |
| openid | text | 用户本地标识 |
| nick | text | 昵称 |
| avatar | text | 头像 (emoji 或 OSS URL) |
| content | text | 评论内容 |
| photo_urls | text | 评论图片 URL (OSS，最多 6 张) |
| type | text | 类型 (comment/checkin) |
| likes | int | 点赞数 |
| created_at | timestamptz | 创建时间 |

**安营爬取评论 (anying_comments)**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 评论 ID (PK) |
| spot_code | text | 安营营地编码 |
| camp_name | text | 营地名称 |
| user_nickname | text | 用户昵称（已随机化） |
| content | text | 评论内容 |
| comment_time | text | 评论时间 |
| act_type | int | 行为类型 |
| source | text | 数据来源 (anying) |

**懂营地爬取评论 (dongyingdi_comments)**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | bigint | 评论 ID (PK) |
| camp_id | int | 懂营地营地 ID（关联 unified_spots.dyf_id） |
| camp_name | text | 营地名称 |
| user_nickname | text | 用户昵称（已随机化） |
| user_score | numeric | 用户评分 |
| content | text | 评论内容 |
| likes | int | 点赞数 |
| comment_time | timestamptz | 评论时间 |

### 5.3 过夜友好度评分系统

**评分公式（第一阶段，设施基础分）**

```
综合评分 = 基础设施分 + 额外加分

基础设施分（满分 4.0）：
  厕所 0.8 + 水 0.7 + 电 0.6 + 淋浴 0.5 + 做饭 0.5 + 帐篷 0.5 + 餐饮 0.4

额外加分（最高 1.0）：
  可停拖挂 + 0.3
  可钓鱼 + 0.2

注：不做营地类型区分，类型系数统一为 1.0
```

**评分分级**

| 等级 | 分数范围 | 过夜状态 | 颜色主题 |
|------|----------|----------|----------|
| 极佳 | 4.5-5.0 | 可以过夜 (1) | 绿色 |
| 良好 | 3.5-4.4 | 可以过夜 (1) | 绿色 |
| 一般 | 2.5-3.4 | 勉强能住 (2) | 橙色 |
| 较差 | 1.5-2.4 | 不建议过夜 (3) | 灰色 |
| 很差 | 0-1.4 | 不建议过夜 (3) | 灰色 |

**评分展示 UI（方案A - 环形评分卡片）**
- 使用 `conic-gradient` 实现环形进度条
- 三色主题：绿色 (#2d6a4f) / 橙色 (#f4a261) / 灰色 (#adb5bd)
- 0 分显示"暂无"而非"0.0 / 5.0"
- 打卡后自动刷新评分（调用 `recalculate_overnight_score` RPC）

### 5.4 数据合并去重策略

- **去重半径**：200 米（GPS 距离）
- **名称相似度**：Jaccard 相似度 ≥ 0.3
- **合并规则**：设施取并集，评分取更高的一方，名称/地址取更完整的
- **合并标记**：`source_type = merged`，保留 `dyd_id` 用于评论关联
- **执行方式**：Python 脚本 `merge_to_unified.py --apply`，先 TRUNCATE 再批量 INSERT
- **网格分桶优化**：按经纬度网格分桶，避免 O(n²) 全量比较

---

## 六、积分系统

> **注意**：当前处于推广期，积分系统已隐藏，用户可免费无限制使用所有功能。积分相关代码保留，待推广期结束后恢复。

| 行为 | 积分 |
|------|------|
| 新用户注册 | +10 |
| 每日签到 | +10 |
| 查看营地详情 | -1 |
| 营地打卡 | +5 |
| 营地录入审核通过 | +100 |

**隐藏的内容**：
- 我的页面：签到栏（积分显示、签到按钮、积分明细入口）
- 核心功能：积分明细入口
- 地图首页：积分不足弹窗
- 详情页：顶部"−1积分"标记
- 营地录入：积分奖励提示
- 地图首页 `viewDetail()`：积分校验逻辑已跳过

---

## 七、修改记录

### 7.1 早期修改 (2026-08-07 ~ 08-09)

#### Bug 修复
- **状态栏遮挡**：改用 JS 动态获取 `statusBarHeight`，通过内联 style 设置 `cover-view` 的 `padding-top`
- **地图营地数量过少**：增大搜索半径计算公式，API 限制提升至 5000
- **线路规划为直线**：集成腾讯地图 Direction API 获取真实驾车路线，解码 polyline 绘制实际路径
- **城市名固定显示"当前位置"**：实现离线逆向地理编码，内置 170+ 城市坐标表
- **评论使用虚拟数据**：创建 `camp_comments` 和 `comment_likes` 表，实现 Supabase CRUD
- **评论发布失败 (HTTP 400)**：`camp_comments.avatar` 列从 VARCHAR(10) 改为 TEXT
- **评论列表头像 URL 显示为文字**：avatar 为 OSS 链接时用 `<image>` 渲染，为 emoji 时用 `<text>` 渲染
- **筛选弹窗样式丢失**：组件 `styleIsolation` 改为 `apply-shared`
- **筛选按钮与微信关闭按钮冲突**：筛选按钮从顶部栏移至右下角浮动按钮组
- **路线返回后消失**：在 `onShow` 生命周期中刷新标记和折线

#### 新增功能
| 功能 | 说明 | 日期 |
|------|------|------|
| 应用设置页 | 通知开关、地图设置、缓存管理 | 08-08 |
| 我的收藏页 | 收藏营地列表、删除、跳转详情 | 08-08 |
| 我的提交页 | 提交记录、审核状态、统计栏 | 08-08 |
| 营地收藏功能 | 详情页添加收藏按钮 | 08-08 |
| 用户头像上传 | 点击头像上传至阿里云 OSS | 08-08 |
| 营地纠错功能 | 详情页纠错弹窗，支持修改设施/地址/照片 | 08-08 |
| 阿里云 OSS 存储 | 所有图片上传迁移至 OSS | 08-08 |
| 评论图片上传 | 评论支持上传 6 张图片 | 08-09 |
| 微信登录集成 | 通过 `<input type="nickname">` 获取昵称 | 08-09 |
| 评论删除 | 用户可删除自己的评论，RLS 策略 | 08-09 |
| 线路途经点 | 线路规划支持添加最多 5 个途经点 | 08-09 |
| 营地相册 | 详情页用户可上传营地照片 | 08-09 |
| 隐私协议页 | 完整隐私政策展示 | 08-09 |

### 7.2 最新修改 (2026-08-09 ~ 08-13) — v1.0.2

#### Bug 修复

| 问题 | 原因 | 修复方案 | 日期 |
|------|------|----------|------|
| 营地标记白框 | marker callout 渲染白色背景 | 完全移除 callout 配置 | 08-09 |
| 标记图标难看 | 低质量像素化图标 | 生成高清矢量风格 PNG (2.9K/个) | 08-09 |
| "查看详情"按钮框线 | `cover-view` 不支持 CSS 变量和 box-shadow | 替换为硬编码颜色，移除 box-shadow，添加 border:none | 08-12 |
| 图片资源超过 200K | `filter-funnel.jpg` (229K) 未被引用但计入包大小 | 删除未引用的大文件 (jpg/json/py) | 08-12 |
| 真机只显示 6 个营地 | API 失败后降级到 Mock 数据 (仅 6 条) | 移除 Mock 降级，返回空数组并提示 | 08-12 |
| 微信审核提示收集用户身份信息 | 意见反馈页收集"微信号/手机号" | 移除联系方式输入框 | 08-10 |
| 城市选择白屏 | 缺少 `index.json` | 补充组件配置文件 | 08-09 |
| 筛选多选按钮无选中状态 | `innerFilters` 状态未正确绑定 | 预计算选中状态 | 08-09 |
| 线路规划地图太小 | 高度仅 340rpx | 增大至 520rpx | 08-09 |
| 营地相册无提交按钮 | 照片选择后无提交入口 | 改为两步流程：预览 → 提交 | 08-09 |
| 路线规划显示直线 | 腾讯地图 Direction API 调用失败后静默降级为直线 | 增加详细错误提示 (弹窗显示具体错误原因)，区分错误码 (120/310/311)，提示用户检查 API Key 权限 | 08-13 |
| 设置-默认缩放级别无反应 | 设置页保存了 zoomIndex 但地图首页未读取 | 地图首页 onLoad 时读取 camp_settings 中的 zoomIndex 并映射为实际 scale (低=6/中=11/高=14/超高=17) | 08-13 |

#### 新增功能

| 功能 | 说明 | 日期 |
|------|------|------|
| 地图首页 POI 搜索 | 腾讯地图 Place API 搜索露营/房车营地/露营地/帐篷营地 | 08-12 |
| 营地数据合并去重 | 数据库营地 + POI 搜索结果合并，1km 内去重 | 08-12 |
| 地图拖动联动搜索 | 拖动/缩放后 1.5s 防抖重新加载 + POI 搜索 | 08-12 |
| 线路规划 POI 搜索 | 沿路线每 50km 采样搜索，多关键词并行请求 | 08-09 |
| 线路规划途经点 | 支持添加最多 5 个途经点，分段请求路线 | 08-09 |
| 房车蓝色标记 | RV 营地改用蓝色矢量标记图标 | 08-09 |
| 漏斗筛选图标 | 筛选按钮改用漏斗形状图标 (PNG) | 08-09 |
| 品牌更名 | 全站从"露营地图"更名为"营图"，更新所有配置文件和页面文案 | 08-13 |

#### 代码质量改进

| 改进 | 说明 |
|------|------|
| 移除 Mock 数据降级 | API 失败不再静默降级，返回空数组并提示用户 |
| cover-view 样式规范 | map 内所有样式使用硬编码颜色，不依赖 CSS 变量 |
| 资源文件清理 | 删除未引用的大文件，确保所有资源 < 200K |
| 用户标识规范化 | 明确 openid 为本地随机字符串，不调用 wx.login |
| 隐私合规 | 移除所有联系方式收集，仅通过官方组件获取昵称/头像 |
| 路线规划错误透明化 | API 失败时显示弹窗告知用户具体错误原因，不再静默降级 |
| 设置生效机制 | 设置页的缩放级别等配置实际被地图首页读取和应用 |

### 7.3 最新修改 (2026-08-13 ~ 08-15) — v1.0.3

#### Bug 修复

| 问题 | 原因 | 修复方案 | 日期 |
|------|------|----------|------|
| 路线规划一直显示"规划中" | 营地查询用 await 同步阻塞路线结果显示 | 路线先显示，营地在后台异步加载 | 08-14 |
| 沿途营地显示 0 个 | `findCampsAlongRoute` 引用未定义变量 `startPt` | 补充 `const startPt = routePoints[0]` | 08-14 |
| 沿途营地数量偏少 | 5 秒超时截断 + 5km 范围查询太小 | 移除额外超时，增大查询范围至 10km | 08-14 |
| 路线规划 POI 返回非露营场所 | "营地"关键词匹配到"教育基地"等 | 移除路线规划 POI 搜索，仅显示数据库营地 | 08-13 |
| 路线时长显示错误 (31km 显示 1 分钟) | 腾讯 API 返回分钟，代码当秒处理 | 修正单位为分钟 | 08-13 |
| 腾讯地图路径规划返回错误 120 | WebServiceAPI 产品未开通 | 文档补充开通说明 | 08-13 |
| "最近路线"残留空白框 | 仅移除文字未移除样式和 JS 数据 | 彻底清理 WXML/WXSS/JS 中的残留代码 | 08-13 |

#### 新增功能

| 功能 | 说明 | 日期 |
|------|------|------|
| 路线规划自定义搜索弹窗 | 替换 wx.chooseLocation，支持输入文字搜索地点，默认选中第一个结果 | 08-15 |
| 途经点排序 | 途经点支持上移/下移调整顺序 | 08-15 |
| 路线规划取消功能 | 规划过程中可点击"取消规划"中断 | 08-14 |
| 营地后台异步加载 | 路线计算完成后立即显示，营地在后台加载完成后更新 | 08-14 |
| 走廊宽度 5km | 沿途营地搜索范围从 3km 调整为 5km | 08-14 |
| POI 搜索并发限制 | 地图首页 POI 搜索最大并发数 3 | 08-13 |
| 品牌更名 | 全站从"露营地图"更名为"营图" | 08-13 |
| 积分系统隐藏 (推广期) | 推广期间免费无限制使用，隐藏积分/签到相关 UI | 08-15 |

#### 代码质量改进

| 改进 | 说明 |
|------|------|
| 路线规划体验优化 | 路线优先显示，营地异步加载，不再阻塞用户 |
| 搜索体验优化 | 自定义搜索弹窗替代系统 chooseLocation，支持防抖和默认选中 |
| 推广期免费策略 | 积分校验、签到栏、积分明细入口全部隐藏，代码保留待恢复 |

### 7.4 最新修改 (2026-08-15 ~ 08-16) — v1.0.4

#### Bug 修复

| 问题 | 原因 | 修复方案 | 日期 |
|------|------|----------|------|
| 路线规划搜索搜不到地点 | 自定义搜索弹窗使用 nearby 限制搜索范围，无法搜到远处地点 | 还原为 `wx.chooseLocation` 微信原生位置选择 | 08-16 |
| POI 搜索混入非营地结果 | 关键词"露营"太宽泛，匹配到"北京自驾蔚县露营徒步之旅"等旅行路线 | 彻底移除 POI 搜索功能，营地数据仅来自数据库（安营地图数据源） | 08-16 |
| 地图图例多余房车图标 | 图例显示免费/收费/房车三类，但实际只需区分免费和收费 | 移除房车图例项，仅保留免费和收费 | 08-16 |
| 筛选时 bounds 为 null | 添加筛选条件时 fetchBounds 被设为 null，触发防爬虫拦截 | 始终传递地图 bounds，不再为 null | 08-15 |
| 搜索五四广场搜不到 | boundary 参数使用 region 格式不正确 | 改用 nearby 格式 (已废弃，最终还原为 wx.chooseLocation) | 08-15 |

#### 新增功能

| 功能 | 说明 | 日期 |
|------|------|------|
| 途经点无限制 | 移除最多 5 个途经点的限制，支持添加任意数量途经点 | 08-16 |
| 营地天气信息 | 点击营地标记时，底部卡片显示实时天气（温度/天气/风向/湿度），调用腾讯地图天气 API | 08-15 |
| 防爬虫：bounds 必填 | API 层强制要求传入地理范围，禁止无 bounds 的全量查询 | 08-15 |
| 防爬虫：返回行数限制 | 单次查询最大返回 100 条 | 08-15 |
| 版权与禁止爬取声明 | 关于我们、隐私协议新增数据版权归属和禁止爬取条款 | 08-15 |

#### 代码质量改进

| 改进 | 说明 |
|------|------|
| 移除 POI 搜索功能 | 营地数据统一来自数据库（安营地图数据源），不再通过腾讯地图 POI 搜索补充，避免混入非营地结果 |
| 路线搜索简化 | 移除自定义搜索弹窗（~200 行代码），还原为微信原生 wx.chooseLocation |
| 地图标记简化 | 移除 RV 标记逻辑，仅区分免费/收费两类 |

### 7.5 最新修改 (2026-08-16 ~ 08-17) — v1.0.5

#### Bug 修复 (微信审核驳回)

| 问题 | 原因 | 修复方案 | 日期 |
|------|------|----------|------|
| 头像功能内容安全风险 | UGC内容未接入内容安全检测 | 所有UGC场景（头像/昵称/评论/营地录入/营地照片/营地纠错/意见反馈）接入微信msgSecCheck/imgSecCheck API | 08-17 |
| 隐私保护指引不明确 | 隐私协议内容笼统，未明确信息收集场景和目的 | 重写隐私协议，按信息类型（位置/头像昵称/UGC/设备）明确收集内容、目的、场景、授权方式；启用`__usePrivacyCheck__` | 08-17 |

#### 新增功能

| 功能 | 说明 | 日期 |
|------|------|------|
| 内容安全检测模块 (`utils/security.js`) | 封装微信msgSecCheck文本检测和imgSecCheck图片检测，通过Supabase Edge Function代理调用 | 08-17 |
| Supabase Edge Function (`security-check`) | 服务端代理微信安全API，管理access_token缓存，支持文本和图片检测 | 08-17 |
| 隐私授权弹窗组件 (`privacy-popup`) | 接入`wx.onNeedPrivacyAuthorization`，用户首次使用敏感API时弹出隐私授权 | 08-17 |
| 6处UGC安全检测 | 头像保存、营地录入、评论发布、营地照片、营地纠错、意见反馈全部接入安全检测 | 08-17 |
| 隐私协议重写 | 8章详细协议：信息收集与目的、信息使用、信息披露、信息存储与保护、用户权利、未成年人保护、政策更改、数据版权 | 08-17 |

#### 部署要求

| 项目 | 说明 |
|------|------|
| Supabase Edge Function | 需部署`security-check`函数，设置环境变量`WECHAT_APPID`和`WECHAT_SECRET` |
| 小程序后台隐私设置 | 需在「小程序设置-基本设置-服务内容声明-用户隐私保护指引」中填写隐私协议 |
| 域名配置 | Supabase Edge Function域名需添加到小程序合法域名列表 |

### 7.6 最新修改 (2026-08-17 ~ 08-19) — v1.0.6

#### Bug 修复

| 问题 | 原因 | 修复方案 | 日期 |
|------|------|----------|------|
| 营地不加载 + 定位城市失败 | `onLoad`中调用`this.tryLocate()`但该方法从未定义（只有`tryLocateAndLoad`），TypeError中断页面生命周期 | 将`tryLocateAndLoad`重命名为`tryLocate`，增加`wx.getSetting`授权检查，拆分`doGetLocation`执行实际定位；`onLoad`中try-catch包裹防止异常中断 | 08-18 |
| 内容安全检测误判（所有名称都触发"违规信息"） | Supabase Edge Function未部署(返回401)，security.js采用fail-closed策略拦截所有内容 | 改为fail-open策略：API不可用时降级放行，记录警告日志，不阻塞用户正常使用 | 08-19 |
| 地图加载被定位阻塞 | `__usePrivacyCheck__`导致`wx.getLocation`挂起，阻止营地数据加载 | 移除`__usePrivacyCheck__`，实现先加载默认中心营地数据，异步定位成功后刷新 | 08-18 |
| loadCamps并发调用丢失 | 定位成功时loadCamps正在执行，直接return丢弃了新定位的加载请求 | 增加`_needReload`机制：加载中标记需要重载，当前加载完成后自动重新加载 | 08-18 |

#### 新增功能

| 功能 | 说明 | 日期 |
|------|------|------|
| 用户手机号（选填） | 编辑个人信息弹窗新增手机号输入框，校验格式（1开头11位），存储在本地`camp_user.phone`，用于营地审核联系 | 08-19 |
| 路线规划页面地图入口 | 导航栏左侧新增"🗺 地图"按钮，一键跳转到地图首页 | 08-19 |
| 筛选按钮优化 | 从圆形图标按钮改为带文字的胶囊按钮（"筛选"文字 + 阴影），更直观明确 | 08-19 |
| 底部卡片只显示已有设施 | 点击营地标记后底部卡片仅展示该营地实际拥有的设施标签，移除灰色未开通的标签 | 08-19 |

#### 设计决策

| 决策 | 原因 | 日期 |
|------|------|------|
| 内容安全检测fail-open策略 | Edge Function部署需要配置WECHAT_APPID和WECHAT_SECRET，当前未部署；fail-closed导致所有UGC操作被阻断，影响正常使用；改为fail-open后，API可用时自动生效检测 | 08-19 |
| 微信API签名不适用于本项目 | 该文档针对微信开放平台服务端API的加密签名（RSA/SM2签名 + AES256/SM4加密），适用于调用`api.weixin.qq.com`的场景；营图后端为Supabase自有数据库，不调用微信服务端API，无需此机制 | 08-19 |
| 异步定位不阻塞数据加载 | 用户体验优先：先用默认城市中心加载营地数据（青岛），定位成功后自动刷新到用户实际位置；避免定位授权弹窗阻塞数据展示 | 08-18 |
| 手机号选填不强制 | 符合最小化收集原则，营地审核时可选联系，不强制用户必须提供 | 08-19 |

### 7.7 数据库变更汇总

| 变更 | 说明 |
|------|------|
| camp_comments.avatar 列 | VARCHAR(10) → TEXT |
| camp_comments.photo_urls 列 | 新增 TEXT 列，存储评论图片 URL |
| camp_corrections 表 | 新增营地纠错表 |
| comment_likes 删除策略 | RLS DELETE 策略 + GRANT DELETE |
| 序列权限 | camp_comments_id_seq GRANT USAGE |
| camp_photos 表 | 新增营地照片表 |
| unified_spots 表 | 新增统一营地表，合并安营 + 懂营地数据 |
| dongyingdi_spots 表 | 懂营地源数据表（53,643 条） |
| dongyingdi_comments 表 | 懂营地爬取评论表 |
| anying_comments 表 | 安营爬取评论表 |
| overnight_score 等列 | camping_spots / dongyingdi_spots 新增过夜评分相关列 |
| truncate_unified_spots() | RPC 函数，TRUNCATE 清空 unified_spots 表 |
| batch_update_anying_score() | RPC 函数，批量更新安营评分 |
| batch_update_dyd_score() | RPC 函数，批量更新懂营地评分 |
| recalculate_overnight_score() | RPC 函数，实时重算单个营地评分（打卡后调用） |
| dongyingdi_spots RLS | allow_read_dyd_spots 策略，anon SELECT |
| dongyingdi_comments RLS | allow_read_dyd_comments 策略，anon SELECT |

### 7.8 v1.1.0 更新 (2026-09-08 ~ 09-13)

#### 新增功能

| 功能 | 说明 | 日期 |
|------|------|------|
| 双数据源整合 | 安营 + 懂营地双数据源，前端单表查询 unified_spots | 09-10 |
| 过夜友好度评分系统 | 基础设施分 + 额外加分，3 档过夜状态，3 色主题展示 | 09-08 |
| 环形评分卡片 UI | conic-gradient 环形进度条，0 分显示"暂无" | 09-08 |
| 实时评分重算 | 打卡后调用 RPC 自动刷新评分 | 09-09 |
| 懂营地评论展示 | 详情页合并展示本站评论 + 懂营地爬取评论 | 09-09 |
| 安营评论展示 | 详情页合并展示本站评论 + 安营爬取评论 | 09-09 |
| 评论昵称随机化 | 爬取评论的用户昵称替换为随机中文名 | 09-13 |
| 数据合并去重 | 200 米 GPS 距离 + Jaccard 名称相似度去重，网格分桶优化 | 09-10 |

#### Bug 修复

| 问题 | 原因 | 修复方案 | 日期 |
|------|------|----------|------|
| 评分显示 0.0 / 5.0 | 评分为 0 时仍显示数字 | 0 分显示"暂无"，隐藏"/5.0"后缀 | 09-09 |
| 数据来源显示英文 | facility_calculated 等英文标识直接显示 | 添加中文映射（设施评估/用户评价/安营导入） | 09-09 |
| 懂营地评论不显示 | detail 页判断 camp.source === 'dyd'，但 unified_spots 字段名是 source_type | 直接读 dyd_id 字段查询评论 | 09-12 |
| 前端未切换到 unified_spots | 合并冲突时 api.js 和 detail/index.js 改动被覆盖 | 重新修改 fetchCampsites/fetchCampDetail/searchCamps 查 unified_spots | 09-12 |
| DELETE 全表超时 | Supabase 语句超时限制 | 创建 truncate_unified_spots() RPC 函数用 TRUNCATE | 09-12 |
| score_source 字段不存在 | 安营表没有此字段 | 脚本中去掉该字段引用 | 09-12 |
| 合并脚本找不到表 | DELETE 缺少 Content-Profile: map header | 改用 RPC 函数清空 | 09-12 |
| 营地数量偏少 | API limit=100 硬编码 | 改为 limit=5000 | 09-09 |
| 懂营地表权限不足 | anon 无 SELECT 权限 | fix_dyd_permissions.sql 授权 + RLS 策略 | 09-09 |
| 去重耗时 20 分钟 | O(n²) 全量比较 | 改用网格分桶优化，1 秒完成 | 09-12 |
| 合并后 dyd_id 丢失 | 去重合并时未保留 dyd_id 字段 | 合并时保留 dyd_id 用于评论关联 | 09-10 |

#### 架构决策

| 决策 | 原因 | 日期 |
|------|------|------|
| 前端单表查询 | 每次打开地图两份请求 + 内存去重性能差；改为 unified_spots 单表，一次请求 | 09-10 |
| 200 米去重半径 | 用户指定，比 150 米更宽松，合并更多相邻营地 | 09-08 |
| 评论不显示来源标签 | 避免用户误解数据来源，统一展示 | 09-10 |
| 昵称随机化 | 爬取评论的原始昵称含用户隐私信息，替换为随机中文名 | 09-13 |
| TRUNCATE 代替 DELETE | DELETE 全表受 Supabase 语句超时限制，TRUNCATE 瞬间完成 | 09-12 |

### 7.9 版本历史

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| v1.0.0 | 2026-08-09 | 初始上线版本 |
| v1.0.2 | 2026-08-13 | 品牌更名"营图"，修复路线规划和设置页问题 |
| v1.0.3 | 2026-08-15 | 路线规划搜索优化，途经点排序，推广期隐藏积分 |
| v1.0.4 | 2026-08-16 | 路线搜索还原为原生选择，POI过滤收紧，天气信息，防爬虫措施 |
| v1.0.5 | 2026-08-17 | 内容安全API接入，隐私协议重写，隐私授权弹窗 |
| v1.0.6 | 2026-08-19 | 修复tryLocate致命bug，安全检测改fail-open，手机号，筛选按钮优化，设施标签只显示已有 |
| v1.1.0 | 2026-09-13 | 双数据源整合，unified_spots 统一表，过夜友好度评分系统，评论合并展示，昵称随机化 |

---

## 八、未来规划

- [x] ~~营地搜索功能（按名称/地址搜索）~~
- [x] ~~途经点支持（线路规划添加多个中间点）~~
- [x] ~~营地图片上传~~
- [x] ~~用户昵称/头像自定义~~
- [x] ~~地图 POI 搜索补充营地~~
- [x] ~~营地评分系统（过夜友好度评分）~~
- [x] ~~双数据源整合（安营 + 懂营地）~~
- [x] ~~评论合并展示（本站 + 爬取）~~
- [ ] 积分排行榜
- [ ] 定时采集自动化（Supabase Edge Functions / 本地定时任务）
- [ ] 离线地图缓存
- [ ] 营地推荐算法
- [ ] 用户社区/动态功能
- [ ] 评分第二阶段（用户评价加权 + 时间衰减）
