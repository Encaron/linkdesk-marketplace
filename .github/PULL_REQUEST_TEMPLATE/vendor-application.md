<!-- 收录申请（vendor application）——官方目录仓专用模板。经 URI 参数 ?template=vendor-application.md 选用；普通运营 PR 不用本表。 -->

## 收录申请（LinkDesk 插件市场）

> **收录 = 信任背书，不复制条目**：官方目录只加一行指向你仓库的源记录，你照常在自己的仓库发新版，官方那份**永不过期**。
> **⛔ 只加自己那一行**：本 PR 只允许改动 `marketplace.json` 的 `sources[]`（加一行）＋（可选）`vendors.json`（加一行）；`plugins[]`、`authors/`、`collections/` 等官方 curation 一律不动——动了 CI 会拦（收录条目另走运营者流程）。
> 提交后打上 **`vendor-application`** 标签，CI 自动跑校验并把结果贴成评论。

### 表单 A · 源收录（必填）——`marketplace.json` 根级 `sources[]` 加一行

```json
{ "url": "https://github.com/<你的用户名>/<你的仓库>", "authorId": "<你的 GitHub 用户名>", "addedAt": "YYYY-MM-DD" }
```

| 字段 | 说明 |
|---|---|
| `url` | 你的**插件仓库**主页，或 raw `marketplace.json` 直链。仓库根要有 `marketplace.json`（`npm run publish` 会自动写）；没有的话要有 `plugin.json`（按单插件仓自动合成一条） |
| `authorId` | 你的作者身份（推荐 = GitHub 用户名——作者域聚合键，头像/名字全源一张脸） |
| `addedAt` | 申请日期（ISO 8601，如 `2026-11-21`） |

**插件清单**（CI 会从你的源拉取校验；这里列出来方便人工审查）：

| 插件 id | 名称 | 类别 | 权限面摘要（声明了什么 contributes / 配置项） |
|---|---|---|---|
| | | | |

### 表单 B · 「官方 ✓」认证（可选——要徽标才填）——`vendors.json` 加一行

| 字段 | 说明 |
|---|---|
| `vendorId` | 与 `authorId` **一致**（认证只对已收录源生效，双表单需成对） |
| `name` | 展示名 |
| `domains` | 官网域名列表；`domain` 认证要求 `https://<域名>/.well-known/linkdesk-vendor.txt` 内容 = `vendorId`（每周自动复验） |
| `githubOrgs` | GitHub 组织名（`github-org` 认证，人工核对谁能发） |
| `verifiedBy` | `domain`（自动自证）／`github-org`（人工）／`manual`（人工，最高信任） |
| `verifiedAt` | 认证日期 |

```json
{ "vendorId": "<= authorId", "name": "", "domains": [], "githubOrgs": [], "verifiedBy": "domain", "verifiedAt": "YYYY-MM-DD" }
```

### 自查清单（CI 会逐条机械核，提交前也请自查）

- [ ] 只改了 `marketplace.json` 的 `sources[]`（加自己一行）和（可选）`vendors.json` 自己那行
- [ ] `plugins[]` / `authors/` / `collections/` 零改动
- [ ] 源仓库根有可拉取的 `marketplace.json`（或 `plugin.json` 单插件回落）
- [ ] 源里插件 id 与官方目录 / 其他已收录源不撞车
- [ ] （填了表单 B）`vendorId` = `authorId`；`domain` 认证的 well-known 文件已就位
- [ ] 已打 `vendor-application` 标签

### 接下来会发生什么

1. **CI 自动校验**五腿——自己那行（scope）／URL 可达／目录 schema 合法／插件 id 不撞／vendors 认证行——结果贴成 PR 评论；
2. 维护者 AI 出**审查四要素报告**（是谁／想干什么／做什么类型／安不安全——声明面核查，规程见 [`AGENTS.md` §5](../../AGENTS.md)）；
3. **合并由运营者人工批准**（AI 审查不自行合并）；
4. 合并后用户下次刷新商店即可看到你的插件；`domain` 认证每周自动复验，失败会开 issue 提醒运营者。
