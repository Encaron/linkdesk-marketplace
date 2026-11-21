# 官方目录仓（linkdesk-marketplace）——LinkDesk 插件市场数据仓

> **本文件是给在这个仓里干活的 AI 看的**（Claude Code / Codex / Cursor / …）。人看 `README.md`。
> 本仓不是插件仓（没有 plugin.json）——它是**官方默认市场源**：商店启动即拉取的 `marketplace.json` 就住在这里，raw 直链 = `https://raw.githubusercontent.com/Encaron/linkdesk-marketplace/HEAD/marketplace.json`。

## 1. 仓内结构（目录 v2 两读）

```
linkdesk-marketplace/
├── marketplace.json        # 主文件：plugins[] 条目 ＋ 根级 sources[]/collections[]/categoryRail
├── authors/<authorId>.json # 作者块（同 authorId 跨仓聚合；身份正典 = GitHub 用户名）
├── collections/<id>.json   # 合集拆分写法（与主文件根级 collections[] 两读并存）
└── vendors.json            # 厂商注册表（「官方 ✓」徽标的判定输入）
```

## 2. 声明清单（作者/运营能写什么）

- **条目**：`id/name/version/downloadUrl/versions[]` 必填，`description/author/authorId/icon/marketIcon/screenshots/category/categories/pricing/...` 选填——字段表与校验 = `@linkdesk/marketplace-kit` 的 schema（作者文档「市场目录与作者主页」章同源）。
- **分类**：主分类 7 桶封闭名单（development/documents/hardware/network/productivity/themes/entertainment）＋ 各桶小分类封闭名单——官方收录条目**必须**带分类；名单扩充由运营改值表（纯数据）。
- **collections**：根级 `collections[]` 写**对象**（inline）或**字符串 id**（引用 `collections/<id>.json`）；同 id 两处声明 = inline 胜＋声明警告，别双写。
- **authors**：作者块以作者自己仓为准（去中心化聚合）；本仓的 `authors/` 只放官方运营的示范/官方块。

## 3. 聚合与消费规则（谁读这份数据、怎么合并）

- 商店合并序：**官方（本仓）→ 本仓 `sources[]` 收录的源 → 用户手添源**；同插件 id 按 semver 高者胜。
- 收录 = **信任背书，不复制条目**：`sources[]` 每行 `{url, authorId, addedAt}`，作者发新版零维护。
- 作者域：条目/作者块声明同一 `authorId` 即聚合；`vendors.json` 命中 = 「官方 ✓」徽标。
- 合集/首页板块是目录数据：改了本仓 JSON，用户下次拉取即生效，⛔ 不需要任何发版。

## 4. 改动纪律

- **第三方行逐字节不动**：收录管道写条目时，已有第三方条目零改动是硬断言（收录前必核）。
- 主文件根级键（sources/collections/categoryRail）由运营维护；发布工具（SDK publish）只 upsert 作者自己仓的条目，**不拥有本仓根级键**。
- ⛔ 运营位内容（首页 hero/官方合集）不是 AI 可自拟的——按运营指令落笔。

## 5. 收录申请与认证审查（规程——本节即正文，R4-5.2 / K11）

> 正典 = 09-API设计 §一·补（sources[] 收录＝背书不复制）＋ §一·补2（vendors[] 三档认证＋端到端申请流）。
> 机械腿 = `scripts/vendor-check.mjs`（本地可跑）＋ `.github/workflows/vendor-check.yml`（CI 同款）＋ PR 模板 `.github/PULL_REQUEST_TEMPLATE/vendor-application.md`（双表单：sources 行必填＋vendors 行可选）。
> 申请 PR 一律打 **`vendor-application`** 标签——通知面 = GitHub 原生（owner 邮件＋站内）＋ AI 主动查（下条命令）。

### 5.1 待审清单（用户说「查认证申请」即出清单）

```bash
gh pr list --repo Encaron/linkdesk-marketplace --label vendor-application
gh pr view <N> --repo Encaron/linkdesk-marketplace --json author,title,body,labels
```

### 5.2 CI 校验五腿（PR 自动跑并贴评论；本地复跑同款）

| 腿 | 判什么 | 正典 |
|---|---|---|
| ① scope | 只许动 `marketplace.json` 的 `sources[]`（增自己行）＋ `vendors.json`（自己行）；`plugins[]`/`authors`/`collections`/根级键深等不动 | 第三方条目逐字节不动（§4）；收录 = 背书不复制 |
| ② URL 可达 | github 仓主页 → raw HEAD `marketplace.json`；404 → 同目录 `plugin.json` 合成 1 条（K5 回落）；都缺 = missing-manifest | 与商店拉取同款（`sourceUrl.ts` 语义抄录） |
| ③ schema 合法 | 拉到的目录过 `schemas/marketplace.schema.json`（SDK/kit 字节同源拷贝） | kit validate 同源 |
| ④ id 不撞 | 对既有收录源 / PR 内撞 = **错误**；对官方 `plugins[]` 撞 = **警告**（收录复制历史路径的影子，运营者判） | 09 §一·补「id 不撞」 |
| ⑤ vendors 行 | vendorId 不撞＋与 sources 行 `authorId` 成对＋domain 自证（well-known 内容＝vendorId）；github-org/manual = 标注待人工 | 09 §一·补2 三档认证 |

```bash
# 本地复跑（复核 CI 评论 / 取证——GitHub 侧 PR/CI 未就绪前以本地跑为准）
node scripts/vendor-check.mjs pr --base-ref origin/main
node scripts/vendor-check.mjs pr --base-file <基准marketplace.json> --head-file <改动后>  # 离线对比
node scripts/vendor-check.mjs validate-file marketplace.json                             # 改完自查
```

> 本机直连 raw.githubusercontent 不稳（ECONNRESET）时带代理跑：`NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://127.0.0.1:7890 node scripts/vendor-check.mjs …`（Node ≥24；GitHub runner 直连无需代理）。

### 5.3 AI 审查报告（四要素——用户指定；声明面核查，⛔ 不跑第三方代码）

每份待审 PR 出一段四要素报告（CI 评论之外的判读，给用户看）：

1. **是谁**：PR 作者 GitHub 账号；domain 自证结果（CI ②⑤ 腿读数）／org 归属（人工核对谁能发）。
2. **想干什么**：vendorId 与认证方式（domain / github-org / manual）；sources 行指向哪个仓。
3. **做什么类型**：插件清单＋类别＋权限面摘要——从 PR 表单与拉取到的目录**声明**读。
4. **安不安全**：声明面核查——CI 五腿全绿？声明里有无 `core: true` 冒充壳件、无危险 contributes、包结构合法。深度审计（行为面）v1 只抽查，列为后续增强（09 §一·补2 原话）。

```bash
gh pr diff <N> --repo Encaron/linkdesk-marketplace
curl -s https://raw.githubusercontent.com/<owner>/<repo>/HEAD/marketplace.json   # 直读申请源声明面
```

### 5.4 代批边界（🔴 硬闸——09 §一·补2 #4 原话）

- **⛔ AI 不得自行合并。** 四要素报告交用户 → **用户明示「通过」** → AI 执行：

```bash
gh pr merge <N> --repo Encaron/linkdesk-marketplace
```

- 用户未表态 = 挂起不动；用户说「不通过」→ AI 留评论说明理由，不合并。

### 5.5 周期复验与撤销

- Actions schedule 每周跑 `vendor-check.mjs weekly`：vendors 全行 domain 自证重跑＋sources 全行可达复验＋schema 拷贝对 npm 最新版漂移警告；失败自动开 issue（`vendor-weekly-check` 标签，幂等追加）——**人决定撤否，⛔ 不自动降级**（防抖动）。
- 撤销收录/认证 = 删 `sources[]`/`vendors.json` 对应行（运营动作）；已装插件照常可用——收录只是背书。
- schema 拷贝刷新纪律：SDK schema 改 ⇒ cp 进 kit＋两包同批 publish ⇒ **本仓 `schemas/` 拷贝同笔刷新**（`cmp` 三处一致；weekly ③ 腿自动报警）。
