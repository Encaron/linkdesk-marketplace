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

## 5. 收录申请与认证审查（规程指针）

收录 PR（作者把自己的源加进 `sources[]`）的**受理与审查规程**（资格、三种认证方式 domain/github-org/manual、PR 模板、CI 校验、AI 审查四要素与代批边界）住在**收录规程文档与 CI 校验**里——本仓 AI 在处理 `vendor-application` 类 PR 时按该规程执行；本节只立指针，规程正文随收录机制落地同笔到位。
