# LinkDesk Marketplace（官方插件市场目录）

LinkDesk 官方插件市场的**目录清单仓库**。根目录 `marketplace.json` 描述全部可上架插件；软件「插件市场」从本文件读取商店内容（URL 见软件内置源）。

## 结构

- `marketplace.json` — 顶层 `{ version?, updatedAt?, plugins[] }`；`plugins[]` 每项为一条可安装插件（`id` / `name` / `version` / `downloadUrl` / `description` / `author` / `icon` 等）。
- 插件包本体（`.linkdesk-plugin`）托管在对应版本附件，`downloadUrl` 指向真实下载直链。

## 作者上架（大白话——第一次上架照这篇走）

想让你写的插件出现在 LinkDesk 内置「官方商店」，分两步：**先发布到你自己的 GitHub 仓库，再让官方商店收录一条指向它的记录**。两步都做完，所有用户开箱即见。

**第 1 步：写插件 + 一键发布（只需要你自己的仓库）**

1. 用官方脚手架建工程：`npm create linkdesk-plugin`（起个名，如 `hello-linkdesk`）。
2. 写界面（`src/`）和 `plugin.json`（插件身份 / 入口 / 贡献点）。改完跑 `npm run validate` 和 `npm run build`，得到插件包 `xxx.linkdesk-plugin`。
3. 在 GitHub 建一个**公开仓库**，把工程 `git push` 上去。
4. 在工程目录跑 `npm run publish`。它自动做三件事：打一个 GitHub Release（包挂成附件）、往**你仓库根目录的 marketplace.json** 写一条条目、打印出下载直链。
5. 到这一步你的插件已发布——装了「作者源」的人（在软件里把你的仓库加为市场源）已经能看到。

**第 2 步：让所有用户默认可见（收录进官方商店 = 在本仓库加一条）**

- 官方商店是**精选索引，不会自动收录**。想让全部用户默认看到，就在**本仓库** `marketplace.json` 的 `plugins[]` 加一条记录：内容照抄你仓库 `marketplace.json` 里那条，`downloadUrl` 指向你 Release 的下载直链（提交本仓库让维护者合入）。
- 收录后，用户在软件「探索插件」刷新即可看到，点「安装」= 真下载真安装。
- **现成范例**：官方首发插件 https://github.com/Encaron/hello-linkdesk —— 它自己仓库的 `marketplace.json` 和本仓库 `plugins[]` 两条同构，照着抄即可。

> 备注：`plugins: []` = 官方商店暂未收录插件（软件显示「暂无插件」，属正常空态）。当前已收录：`hello-linkdesk`。
