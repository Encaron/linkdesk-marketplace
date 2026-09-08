# LinkDesk Marketplace（官方插件市场目录）

LinkDesk 官方插件市场的**目录清单仓库**。根目录 `marketplace.json` 描述全部可上架插件；软件「插件市场」从本文件读取商店内容（URL 见软件内置源）。

## 结构

- `marketplace.json` — 顶层 `{ version?, updatedAt?, plugins[] }`；`plugins[]` 每项为一条可安装插件（`id` / `name` / `version` / `downloadUrl` / `description` / `author` / `icon` 等）。
- 插件包本体（`.linkdesk-plugin`）托管在对应版本附件，`downloadUrl` 指向真实下载直链。

## 作者上架

用 LinkDesk 发布工具（`linkdesk-plugin-sdk publish` 或市场插件「发布」按钮）发布后，会自动向本仓库/或作者自有仓库的 Release 上传插件并更新目录。

> 空 `plugins: []` = 官方商店暂未上架任何插件（软件内显示「暂无插件」）。
> 作者用 SDK `publish` 会把条目写进**作者自有仓库**的 `marketplace.json`；要让插件出现在内置「官方」商店，需在**本目录仓库** `plugins[]` 加一条指向该 Release 直链的记录（精选索引——手动维护）。
> 已收录：`hello-linkdesk`（官方市场首发插件）。
