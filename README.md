# LinkDesk Marketplace（官方插件市场目录）

LinkDesk 官方插件市场的**目录清单仓库**。根目录 `marketplace.json` 描述全部可上架插件；软件「插件市场」从本文件读取商店内容（URL 见软件内置源）。

## 结构

- `marketplace.json` — 顶层 `{ version?, updatedAt?, plugins[] }`；`plugins[]` 每项为一条可安装插件（`id` / `name` / `version` / `downloadUrl` / `description` / `author` / `icon` 等）。
- 插件包本体（`.linkdesk-plugin`）托管在对应版本附件，`downloadUrl` 指向真实下载直链。

## v2 目录骨架（Marketplace-Store · 2026-11-20 起）

> 旧市场插件读本仓只认 `version/updatedAt/plugins`——下面这些新文件/新键**全部可选**，旧消费者静默忽略、不炸（双向兼容，06-数据设计 §二·3）。字段形状的唯一真源 = SDK 包内 `marketplace.schema.json`（$defs：authorBlock / vendor 等）。

- `authors/<authorId>.json` — **作者块**：作者域门面声明（authorId 聚合键 / 多仓归属 repos / 主页板块声明 homepage.sections / publicKey）。同 authorId 跨仓聚合，⛔ 无中心注册。当前 `geek.json` 是 R4-0.3 指定的**演示最小件**，真实作者块落位时整档替换或删除。
- `collections/` — 合集声明（可从主文件根级 `collections[]` 拆出，两读兼容）；现空（.gitkeep 占位）。
- `vendors.json` — **厂商注册表**：「官方 ✓」判定链唯一来源（条目 authorId 命中 ⇒ 官方，未命中 ⇒ 社区）；只有官方运营者可写，申请走 PR（模板 `.github/PULL_REQUEST_TEMPLATE/vendor-application.md`，受理与审查规程 = [`AGENTS.md` §5](AGENTS.md)）。
- `marketplace.json` 根级 `sources[]` — 已审核第三方源清单（收录 = 背书不复制条目；申请 PR 只许动自己那行，见上方模板）。当前空数组占位。
- ⚠️ publish 收录链对根级新键**原样带过**（SDK upsertCatalogEntry R4-0.2 起）——收录发布不会抹掉 `sources` 等。

## 作者上架（大白话——第一次上架照这篇走）

想让你写的插件出现在 LinkDesk 内置「官方商店」，分两步：**先发布到你自己的 GitHub 仓库，再让官方商店收录一条指向它的记录**。两步都做完，所有用户开箱即见。

**第 1 步：写插件 + 一键发布（只需要你自己的仓库）**

1. 用官方脚手架建工程：`npm create linkdesk-plugin`（起个名，如 `hello-linkdesk`）。
2. 写界面（`src/`）和 `plugin.json`（插件身份 / 入口 / 贡献点）。改完跑 `npm run validate` 和 `npm run build`，得到插件包 `xxx.linkdesk-plugin`。
3. 在 GitHub 建一个**公开仓库**，把工程 `git push` 上去。
4. 在工程目录跑 `npm run publish`。它自动做三件事：打一个 GitHub Release（包挂成附件）、往**你仓库根目录的 marketplace.json** 写一条条目、打印出下载直链。
5. 到这一步你的插件已发布——装了「作者源」的人（在软件里把你的仓库加为市场源）已经能看到。

**第 2 步：让所有用户默认可见（收录进官方目录）**

- 官方商店是**精选索引，不会自动收录**。第三方作者走**源收录**：照 `.github/PULL_REQUEST_TEMPLATE/vendor-application.md` 填表提 PR，在根级 `sources[]` 加一行指向你的仓库——**收录是信任背书，不复制条目**：你照常在自己仓库发新版，官方那份**永不过期**。CI 自动校验（自己那行 / URL 可达 / 目录格式 / id 不撞），维护者人工审查后合并，用户在软件「探索插件」刷新即可看到，点「安装」= 真下载真安装。
- 想带「官方 ✓」徽标：同一张 PR 表单的表单 B 填 `vendors.json` 一行（三档认证 domain / github-org / manual；受理与审查规程 = [`AGENTS.md` §5](AGENTS.md)）。
- 官方首发条目（`plugins[]` 复制条目那份）由运营者维护，作者不用关心。
- **现成范例**：官方首发插件 https://github.com/Encaron/hello-linkdesk —— 它自己仓库的 `marketplace.json` 和官方目录条目两条同构，照着看即可；带图标的范例见 https://github.com/Encaron/first-run-setup 。
- 📌 **详情页「仓库」那一行想指对地方，就写 `repository`。** 插件详情页资源组的「仓库 / 问题」默认从你的 `downloadUrl` / `readmeUrl` **反推 GitHub 仓库主页**——托管在 GitHub 的插件**不用写**。只有当你的插件包不在 GitHub（CDN、Gitee、自有官网）时才需要显式写 `"repository": "https://你的主页"`——**必须是完整 URL**（`owner/repo` 这种简写不认）。两边都推不出时，那一行**不显示**——不给一个点开指错路的链接。
- ⚠️ **`icon` 要写成能直接打开的东西。** 你 `plugin.json` 里的 `icon` 是相对插件包的路径（如 `resources/icon.svg`），那套解析只对**已安装**的插件有效。目录条目里的 `icon` 若不声明 `iconSource`，会被当成插件内部路径解析——**在商店里（还没装）就是一张裂图**。想让商店显示你的图标：`"icon": "<图标直链>"` + `"iconSource": "url"`（或 `"iconSource": "codicon"` 配 codicon 名）。不填就留空，商店会用默认图标。

> 备注：`plugins: []` = 官方商店暂未收录插件（软件显示「暂无插件」，属正常空态）。当前收录清单以 `marketplace.json` 的 `plugins[]` 实时为准（不在此列名单——名单会过期）。
