# 露营地图小程序 - 设计文档

> 最后更新: 2026-08-08

## 一、项目概述

露营地图是一款面向房车、帐篷露营爱好者的营地发现工具。整合全国各地营地信息，提供精确的地图定位、设施查询、线路规划与用户评价服务。

**核心数据**：全国 337 个地级行政区，25,618 个营地，包含停车、水电、设施、价格等完整信息。

---

## 二、技术架构

### 2.1 前端
- **框架**：微信小程序原生开发
- **地图**：微信内置 map 组件（腾讯地图）
- **路线规划**：腾讯地图 WebService Direction API（驾车路线）
- **样式系统**：CSS 变量 + 全局 app.wxss 设计令牌

### 2.2 后端
- **数据库**：Supabase (PostgreSQL)
  - Schema: `map`
  - 主表: `camping_spots`（营地数据）
  - 评论表: `camp_comments` + `comment_likes`
  - 用户积分: `user_points`
  - RPC: `daily_checkin`, `deduct_point`, `increment_like`
- **API**：Supabase REST API (PostgREST)
- **数据采集**：Python 脚本 `collect_national.py` 采集安营 API 数据
- **数据迁移**：`migrate_facilities.py` 补充设施/价格字段

### 2.3 本地存储 (localStorage)

| Key | 用途 |
|-----|------|
| `camp_user` | 用户数据 (openid, 积分, 签到, 加入日期) |
| `camp_favorites` | 收藏的营地列表 |
| `camp_submissions` | 用户提交的营地列表 |
| `camp_settings` | 应用设置 (通知, 地图偏好) |
| `route_favorites` | 收藏的路线 |
| `feedback_list` | 用户反馈 |
| `liked_comment_ids` | 已点赞评论 ID 列表 |

---

## 三、设计系统

### 3.1 色彩

| 变量 | 值 | 用途 |
|------|------|------|
| `--green` | `#2d6a4f` | 主色（导航栏、按钮、强调） |
| `--green-2` | `#40916c` | 次绿色（渐变、图标） |
| `--green-3` | `#52b788` | 亮绿色 |
| `--green-light` | `#d8f3dc` | 浅绿色背景（标签、卡片） |
| `--orange` | `#f4a261` | 橙色（收费标记、积分） |
| `--red` | `#ee6c4d` | 红色（终点、退出、警告） |
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

### 3.4 营地标记
- 🟢 绿色图钉: 免费营地
- 🟠 橙色图钉: 收费营地
- 🟪 紫色方块: 房车友好营地

---

## 四、页面结构

### 4.1 页面清单 (14 个页面)

| 页面 | 路径 | 类型 | 功能 |
|------|------|------|------|
| 地图首页 | `pages/map/` | TabBar | 全屏地图、营地标记、筛选、底部卡片 |
| 线路规划 | `pages/route/` | TabBar | 起终点选择、驾车路线、沿途营地 |
| 我的 | `pages/mine/` | TabBar | 用户信息、签到、功能入口 |
| 营地详情 | `pages/detail/` | Navigate | 设施、价格、评价、收藏、打卡 |
| 营地录入 | `pages/submit/` | Navigate | 用户提交新营地 |
| 积分明细 | `pages/points/` | Navigate | 积分历史、签到周历 |
| 城市选择 | `pages/city-picker/` | Navigate | 按省份选择城市 |
| 意见反馈 | `pages/feedback/` | Navigate | 反馈类型、内容、联系方式 |
| 使用教程 | `pages/tutorial/` | Navigate | 6 步功能引导 |
| 线路收藏 | `pages/route-fav/` | Navigate | 收藏的路线列表 |
| 关于我们 | `pages/about/` | Navigate | 项目介绍、数据来源、免责声明 |
| **应用设置** | `pages/settings/` | Navigate | 通知、地图、缓存、退出 |
| **我的收藏** | `pages/favorites/` | Navigate | 收藏的营地列表 |
| **我的提交** | `pages/submissions/` | Navigate | 提交的营地及审核状态 |

### 4.2 导航流程

```
[TabBar]
├── 地图首页 ──→ 营地详情 ──→ (导航/分享/收藏/打卡/评论)
│    ├──→ 城市选择
│    └──→ 营地录入
├── 线路规划 ──→ 沿途营地列表 ──→ 营地详情
│    └──→ 线路收藏
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

### 5.1 营地数据 (camping_spots)

| 字段 | 类型 | 说明 |
|------|------|------|
| spot_code | text | 营地唯一编码 (PK) |
| name | text | 营地名称 |
| address | text | 地址 |
| latitude | numeric | 纬度 |
| longitude | numeric | 经度 |
| parking_status | int | 停车收费 (0=免费, 1=收费) |
| toilet_status | int | 厕所 (0/1/多值) |
| water_status | int | 接水 |
| power_status | int | 接市电 (0/1/4/12/13) |
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
| price_info | text | 收费备注 |
| toilet_info | text | 厕所备注 |
| water_info | text | 加水备注 |
| power_info | text | 接电备注 |
| intro | text | 营地简介 |
| memo | text | 营地备注 |

### 5.2 设施代码映射 (sheshi)

| 代码 | 含义 |
|------|------|
| 15 | 房车可停 |
| 20 | 拖挂可停 |
| 25 | 帐篷可搭 |
| 30 | 餐饮 |
| 35 | 买菜/超市 |
| 40 | 钓鱼 |
| 45 | 住宿 |
| 50 | 淋浴 |

### 5.3 评论数据 (camp_comments)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | serial | 评论 ID (PK) |
| spot_code | text | 营地编码 |
| openid | text | 用户 openid |
| nick | text | 昵称 |
| avatar | text | 头像 (emoji) |
| content | text | 评论内容 |
| type | text | 类型 (comment/checkin) |
| likes | int | 点赞数 |
| created_at | timestamptz | 创建时间 |

---

## 六、最近修改记录 (2026-08-07 ~ 08-08)

### 6.1 Bug 修复

#### 状态栏遮挡 (2026-08-08)
- **问题**：地图页顶部搜索栏与系统状态栏重叠，城市名和筛选按钮被遮挡
- **修复**：改用 JS 动态获取 `statusBarHeight`，通过内联 style 设置 `cover-view` 的 `padding-top`
- **影响文件**：`pages/map/index.js`, `pages/map/index.wxml`, `pages/map/index.wxss`

#### 地图营地数量过少 (2026-08-08)
- **问题**：青岛地区仅显示 6 个营地，实际应有数百个
- **修复**：增大搜索半径计算公式（从 `5.0/2^(scale-8)` 改为 `3.0/2^(scale-9)`），API 限制从 1000 提升至 5000
- **影响文件**：`pages/map/index.js`

#### 线路规划为直线 (2026-08-08)
- **问题**：从青岛到拉萨只显示一条直线，不跟随实际道路
- **修复**：集成腾讯地图 Direction API 获取真实驾车路线，解码 polyline 绘制实际路径；沿途营地搜索改为基于真实路线折线的多段距离计算
- **影响文件**：`pages/route/index.js`, `utils/config.js`, `project.config.json`

#### 头像点击无反应 (2026-08-08)
- **问题**：我的页面点击头像没有任何响应
- **修复**：添加 `bindtap="tapAvatar"` 事件，跳转至设置页
- **影响文件**：`pages/mine/index.wxml`, `pages/mine/index.js`

#### 设施字段缺失 (2026-08-07)
- **问题**：清华大学问询接待处缺少价格、接电、买菜信息
- **修复**：扩展 `sheshi` 代码映射 (30/35/45/50)，解析 `zhuche_info` 等字段提取备注
- **影响文件**：`collect_national.py`, `migrate_facilities.py`

#### 城市名固定显示"当前位置" (2026-08-07)
- **问题**：地图页城市名始终显示"当前位置"
- **修复**：实现离线逆向地理编码，内置 170+ 城市坐标表，最近邻匹配
- **影响文件**：`utils/util.js`, `app.js`, `pages/map/index.js`

#### 路线规划营地数量过少 (2026-08-07)
- **问题**：北京天安门到崂山仅显示 1 个营地
- **修复**：增大搜索走廊宽度 (15-60km)，API 限制提升至 10000
- **影响文件**：`pages/route/index.js`

#### 评论使用虚拟数据 (2026-08-07)
- **问题**：评论存储在 localStorage，不是真实数据
- **修复**：创建 `camp_comments` 和 `comment_likes` 表，实现 Supabase CRUD
- **影响文件**：`add_comments_table.sql`, `utils/api.js`, `pages/detail/index.js`

#### 点赞可无限点击 (2026-08-07)
- **问题**：点赞按钮可以一直点击增加
- **修复**：添加 `comment_likes` 表 (UNIQUE 约束)，本地记录已点赞 ID
- **影响文件**：`add_comments_table.sql`, `pages/detail/index.js`

### 6.2 新增功能

| 功能 | 说明 | 日期 |
|------|------|------|
| 应用设置页 | 通知开关、地图设置、缓存管理、退出登录 | 08-08 |
| 我的收藏页 | 收藏营地列表、删除、跳转详情 | 08-08 |
| 我的提交页 | 提交记录、审核状态、统计栏 | 08-08 |
| 营地收藏功能 | 详情页添加收藏按钮 | 08-08 |
| 意见反馈页 | 4 类反馈、本地存储 | 08-07 |
| 使用教程页 | 6 步图文引导 | 08-07 |
| 线路收藏页 | 收藏路线、恢复路线 | 08-07 |
| 真实驾车路线 | 腾讯地图 Direction API | 08-08 |
| 离线城市检测 | 170+ 城市坐标最近邻匹配 | 08-07 |
| 价格信息展示 | 解析 `zhuche_info` 显示收费备注 | 08-07 |

### 6.3 数据迁移

| 迁移项 | 数量 | 说明 |
|--------|------|------|
| 全国营地采集 | 57,502 | 337 个地级行政区 |
| 数据库导入 | 25,618 | 去重后入库 |
| 设施字段补充 | 25,613 | 25,618 个营地中仅 5 个因 SSL 失败 |
| 价格信息 | 6,030 | 有收费备注的营地 |
| 房车友好 | 18,777 | 可停房车的营地 |

---

## 七、积分系统

| 行为 | 积分 |
|------|------|
| 新用户注册 | +10 |
| 每日签到 | +10 |
| 查看营地详情 | -1 |
| 营地打卡 | +5 |
| 营地录入审核通过 | +100 |

---

## 八、未来规划

- [ ] 营地搜索功能（按名称/地址搜索）
- [ ] 途经点支持（线路规划添加多个中间点）
- [ ] 营地图片上传
- [ ] 用户昵称/头像自定义
- [ ] 积分排行榜
- [ ] 营地评分系统
- [ ] 离线地图缓存
- [ ] 营地推荐算法
