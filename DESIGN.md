# 营图 - 设计文档

> 最后更新: 2026-08-13
> 当前版本: v1.0.2

## 一、项目概述

营图是一款面向房车、帐篷露营爱好者的营地发现工具。整合全国各地营地信息，提供精确的地图定位、设施查询、线路规划与用户评价服务。

**核心数据**：全国 337 个地级行政区，25,618 个营地，包含停车、水电、设施、价格等完整信息。

---

## 二、技术架构

### 2.1 前端
- **框架**：微信小程序原生开发
- **地图**：微信内置 map 组件（腾讯地图）
- **路线规划**：腾讯地图 WebService Direction API（驾车路线）
- **POI 搜索**：腾讯地图 Place API（地图首页 + 线路规划补充营地）
- **样式系统**：CSS 变量 + 全局 app.wxss 设计令牌
- **注意**：`cover-view` 组件不支持 CSS 变量和 `box-shadow`，map 内样式需使用硬编码颜色

### 2.2 后端
- **数据库**：Supabase (PostgreSQL)
  - Schema: `map`
  - 主表: `camping_spots`（营地数据，1000+ 条）
  - 评论表: `camp_comments` + `comment_likes`
  - 营地纠错表: `camp_corrections`
  - 营地相册表: `camp_photos`
  - 用户积分: `user_points`
  - RPC: `daily_checkin`, `deduct_point`, `increment_like`
- **API**：Supabase REST API (PostgREST)
- **对象存储**：阿里云 OSS (`camp-map.oss-cn-beijing.aliyuncs.com`)，用于用户头像、营地纠错照片、评论图片等图片上传
- **数据采集**：Python 脚本 `collect_national.py` 采集安营 API 数据

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
- 不收集用户手机号、微信号等联系方式

### 2.6 腾讯地图 API 配置
- **API Key**: 在 `utils/config.js` 中配置 `MAP_KEY`
- **需开通的服务**:
  - WebService API - 地点搜索 (Place API): 用于地图首页和线路规划的 POI 搜索
  - WebService API - 路径规划 (Direction API): 用于线路规划的驾车路线
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
- 🔵 蓝色图钉 (`rv.png`, 2.9K): 房车友好营地
- 所有标记使用透明背景 PNG，`anchor: { x: 0.5, y: 1 }` 定位
- 不使用 callout（避免白框问题）

### 3.5 资源大小约束
- 微信小程序单个图片/音频资源不超过 200K
- 所有图片资源均为 PNG 格式，最大 2.9K
- 项目总大小约 780K（不含 .git）

---

## 四、页面结构

### 4.1 页面清单 (15 个页面)

| 页面 | 路径 | 类型 | 功能 |
|------|------|------|------|
| 地图首页 | `pages/map/` | TabBar | 全屏地图、营地标记、POI搜索、筛选、底部卡片 |
| 线路规划 | `pages/route/` | TabBar | 起终点选择、途经点、驾车路线、沿途营地 |
| 我的 | `pages/mine/` | TabBar | 用户信息、签到、功能入口 |
| 营地详情 | `pages/detail/` | Navigate | 设施、价格、评价、收藏、打卡、营地相册、纠错 |
| 营地录入 | `pages/submit/` | Navigate | 用户提交新营地 |
| 积分明细 | `pages/points/` | Navigate | 积分历史、签到周历 |
| 城市选择 | `pages/city-picker/` | Navigate | 按省份选择城市 |
| 意见反馈 | `pages/feedback/` | Navigate | 反馈类型、内容描述 |
| 使用教程 | `pages/tutorial/` | Navigate | 6 步功能引导 |
| 线路收藏 | `pages/route-fav/` | Navigate | 收藏的路线列表 |
| 关于我们 | `pages/about/` | Navigate | 项目介绍、数据来源、免责声明 |
| **应用设置** | `pages/settings/` | Navigate | 通知、地图缩放、缓存、退出 |
| **我的收藏** | `pages/favorites/` | Navigate | 收藏的营地列表 |
| **我的提交** | `pages/submissions/` | Navigate | 提交的营地及审核状态 |
| **隐私协议** | `pages/privacy/` | Navigate | 隐私政策全文展示 |

### 4.2 导航流程

```
[TabBar]
├── 地图首页 ──→ 营地详情 ──→ (导航/分享/收藏/打卡/评论/纠错/相册)
│    ├──→ 城市选择
│    └──→ 营地录入
├── 线路规划 ──→ 沿途营地列表 ──→ 营地详情
│    ├──→ 线路收藏
│    └──→ 途经点 (最多5个)
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

### 5.2 评论数据 (camp_comments)

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

---

## 六、积分系统

| 行为 | 积分 |
|------|------|
| 新用户注册 | +10 |
| 每日签到 | +10 |
| 查看营地详情 | -1 |
| 营地打卡 | +5 |
| 营地录入审核通过 | +100 |

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

### 7.3 数据库变更汇总

| 变更 | 说明 |
|------|------|
| camp_comments.avatar 列 | VARCHAR(10) → TEXT |
| camp_comments.photo_urls 列 | 新增 TEXT 列，存储评论图片 URL |
| camp_corrections 表 | 新增营地纠错表 |
| comment_likes 删除策略 | RLS DELETE 策略 + GRANT DELETE |
| 序列权限 | camp_comments_id_seq GRANT USAGE |
| camp_photos 表 | 新增营地照片表 |

### 7.4 版本历史

| 版本 | 日期 | 主要内容 |
|------|------|----------|
| v1.0.0 | 2026-08-09 | 初始上线版本 |
| v1.0.2 | 2026-08-13 | 品牌更名"营图"，修复路线规划和设置页问题 |

---

## 八、未来规划

- [ ] 营地搜索功能（按名称/地址搜索）
- [x] ~~途经点支持（线路规划添加多个中间点）~~
- [x] ~~营地图片上传~~
- [x] ~~用户昵称/头像自定义~~
- [x] ~~地图 POI 搜索补充营地~~
- [ ] 积分排行榜
- [ ] 营地评分系统
- [ ] 离线地图缓存
- [ ] 营地推荐算法
- [ ] 用户社区/动态功能
