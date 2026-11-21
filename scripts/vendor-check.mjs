#!/usr/bin/env node
/**
 * vendor-check — 官方目录仓收录申请校验（R4-5.1 / I19·K9·#22）。
 *
 * 收录正典 = 09-API设计 §一·补（sources[]）/ §一·补2（vendors[] 三档认证）：
 *   - sources[] 收录 = 信任背书不复制条目；PR 只许加自己那一行；
 *   - vendors[] 三档认证：domain（官网 /.well-known/linkdesk-vendor.txt 内容＝vendorId，自动）/
 *     github-org / manual（人工核对）。
 *
 * CI（.github/workflows/vendor-check.yml）与本脚本同款；本地复跑取证：
 *
 *   node scripts/vendor-check.mjs pr --base-ref origin/main          # git 基准 vs 工作区
 *   node scripts/vendor-check.mjs pr --base-file <p> --head-file <p> # 纯文件对比（离线可用）
 *   node scripts/vendor-check.mjs weekly                             # 每周复验（domain 自证＋源可达＋schema 漂移）
 *   node scripts/vendor-check.mjs validate-file <p>                  # 单文件 schema 自查
 *
 * 🔴 拉取语义与市场插件同款（⛔ 不另造第二套判定）：
 *   源 URL 归一（github 仓主页 → raw HEAD marketplace.json；raw 直链原样）→ 拉取 →
 *   404 ⇒ 同目录 plugin.json 合成 1 条（K5 回落）→ 都缺 = missing-manifest。
 *   归一/回落正则照 `marketplace` 插件 `src/services/marketCatalog/sourceUrl.ts` 抄录，改动需同笔对齐。
 *
 * 退出码：0 = 无 error（warning 不拦）；1 = 有 error。weekly 失败由 workflow 开 issue 提醒运营者。
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_FILE = "marketplace.json";
const VENDORS_FILE = "vendors.json";
const SCHEMA_FILE = "schemas/marketplace.schema.json";
const FETCH_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// 小型 JSON Schema 校验器——只覆盖本仓 schema 实际用到的关键词
// （type/const/enum/required/properties/additionalProperties/items/minItems/
//  minLength/pattern/$ref/oneOf/anyOf，关键词清单见 schemas/ 拷贝同源说明）。
// 深度正典校验在作者侧 `@linkdesk/marketplace-kit validate`；本仓这份是收录门。
// ---------------------------------------------------------------------------

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) throw new Error(`不支持的 $ref 形态：${ref}`);
  let node = root;
  for (const seg of ref.slice(2).split("/")) node = node[seg];
  if (node === undefined) throw new Error(`$ref 解析失败：${ref}`);
  return node;
}

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function typeOk(value, type) {
  switch (type) {
    case "object": return typeOf(value) === "object";
    case "array": return typeOf(value) === "array";
    case "string": return typeof value === "string";
    case "number": return typeof value === "number";
    case "integer": return Number.isInteger(value);
    case "boolean": return typeof value === "boolean";
    case "null": return value === null;
    default: return true; // 未知类型不拦（新字段由 additionalProperties 管住）
  }
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeOf(a) !== typeOf(b)) return false;
  if (Array.isArray(a)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeOf(a) === "object") {
    const ka = Object.keys(a); const kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

/** value 是否满足 schema（errors 收集；path 为 JSON Pointer 风格路径） */
function validateAgainstSchema(value, schema, root, path, errors) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    validateAgainstSchema(value, resolveRef(root, schema.$ref), root, path, errors);
    return;
  }
  if (schema.oneOf) {
    const hit = schema.oneOf.filter((s) => {
      const branch = [];
      validateAgainstSchema(value, s, root, path, branch);
      return branch.length === 0;
    });
    if (hit.length !== 1) {
      const hint = [];
      validateAgainstSchema(value, schema.oneOf[0], root, path, hint);
      errors.push(`${path}: oneOf 无一命中（${schema.oneOf.length} 个分支）——首分支报错：${hint[0] ?? "（无）"}`);
    }
    return;
  }
  if (schema.anyOf) {
    const hit = schema.anyOf.some((s) => {
      const branch = [];
      validateAgainstSchema(value, s, root, path, branch);
      return branch.length === 0;
    });
    if (!hit) errors.push(`${path}: anyOf 无一命中`);
    return;
  }
  if ("const" in schema && !deepEqual(value, schema.const)) {
    errors.push(`${path}: 应为 ${JSON.stringify(schema.const)}，实际 ${JSON.stringify(value)}`);
    return;
  }
  if (schema.enum && !schema.enum.some((v) => deepEqual(value, v))) {
    errors.push(`${path}: ${JSON.stringify(value)} 不在封闭名单 ${JSON.stringify(schema.enum)} 内`);
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    // "type": {const...} 这类对象形态 = 写法的别名，由 const/enum 判；这里只判字符串/数组形态
    const real = types.filter((t) => typeof t === "string");
    if (real.length && !real.some((t) => typeOk(value, t))) {
      errors.push(`${path}: 类型应为 ${real.join("|")}，实际 ${typeOf(value)}`);
      return;
    }
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push(`${path}: 长度 ${value.length} < minLength ${schema.minLength}`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      errors.push(`${path}: "${value}" 不匹配 pattern ${schema.pattern}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: ${value.length} 项 < minItems ${schema.minItems}`);
    }
    if (schema.items) {
      value.forEach((item, i) => validateAgainstSchema(item, schema.items, root, `${path}/${i}`, errors));
    }
    return;
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: 缺必填字段 "${key}"`);
    }
    const props = schema.properties ?? {};
    for (const [key, sub] of Object.entries(props)) {
      if (key in value) validateAgainstSchema(value[key], sub, root, `${path}/${key}`, errors);
    }
    const additional = schema.additionalProperties;
    if (additional === false) {
      for (const key of Object.keys(value)) {
        if (!(key in props)) errors.push(`${path}: 多余字段 "${key}"（additionalProperties: false）`);
      }
    } else if (additional && typeof additional === "object") {
      for (const [key, sub] of Object.entries(value)) {
        if (!(key in props)) validateAgainstSchema(sub, additional, root, `${path}/${key}`, errors);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 源 URL 归一/回落——照 marketplace 插件 sourceUrl.ts 抄录（🔴 改动需同笔对齐）
// ---------------------------------------------------------------------------

/** GitHub 仓库主页 URL（https://github.com/owner/repo）→ raw marketplace.json 直链（HEAD 免猜分支） */
function repoUrlToRawUrl(repoUrl) {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/?#]+)/.exec(repoUrl.trim());
  if (!m) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/HEAD/marketplace.json`;
}

/** 已是 raw.githubusercontent 的 marketplace.json 直链？ */
function isRawMarketplaceUrl(url) {
  return /^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/.*marketplace\.json$/.test(url.trim());
}

/** 用户/作者填的源 URL → 可 fetch 的 marketplace.json 直链（推不出 = null，⛔ 不猜主机） */
function normalizeSourceUrl(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;
  if (isRawMarketplaceUrl(raw)) return raw;
  return repoUrlToRawUrl(raw);
}

/** 目录仓同目录兄弟文件 URL（K5 回落用：…/<owner>/<repo>/<ref>/marketplace.json ⇒ 换文件名） */
function catalogSiblingUrl(rawUrl, fileName) {
  const m = /^(https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[^/]+)\/[^/]+$/.exec(rawUrl.trim());
  return m ? `${m[1]}/${fileName}` : null;
}

// ---------------------------------------------------------------------------
// 取数与报告
// ---------------------------------------------------------------------------

async function fetchText(url) {
  try {
    const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (res.ok) return { kind: "ok", status: res.status, text: await res.text() };
    return { kind: res.status === 404 ? "missing" : "network", status: res.status, text: "" };
  } catch (err) {
    // 网络异常（DNS 失败/超时/断网）不是崩溃——归入 network，报告里给干净错误
    return { kind: "network", status: 0, text: "", error: err?.cause?.message ?? err?.message ?? String(err) };
  }
}

function readJsonFile(path) {
  try {
    return { ok: true, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (err) {
    return { ok: false, error: `${path}: ${err.message}` };
  }
}

function gitShow(ref, file) {
  try {
    return { ok: true, value: JSON.parse(execFileSync("git", ["show", `${ref}:${file}`], { cwd: REPO_ROOT, encoding: "utf8" })) };
  } catch (err) {
    return { ok: false, error: `${ref}:${file} 不可读（${String(err.stderr ?? err.message).trim().split("\n")[0]}）` };
  }
}

function gitChangedFiles(baseRef) {
  try {
    const out = execFileSync("git", ["diff", "--name-only", baseRef, "--"], { cwd: REPO_ROOT, encoding: "utf8" });
    return out.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch {
    return null; // 非 git 环境（如纯文件对比模式）→ scope 退化为文件内容对比
  }
}

class Report {
  constructor() { this.sections = []; this.current = null; }
  section(id, title) { this.current = { id, title, items: [] }; this.sections.push(this.current); }
  /** severity: error | warning | info | ok */
  add(severity, message) { this.current?.items.push({ severity, message }); }
  get errors() { return this.sections.flatMap((s) => s.items).filter((i) => i.severity === "error"); }
  get warnings() { return this.sections.flatMap((s) => s.items).filter((i) => i.severity === "warning"); }
  verdict() {
    const e = this.errors.length; const w = this.warnings.length;
    return e > 0
      ? `❌ 未通过（${e} 错误 · ${w} 警告）`
      : `✅ 通过（0 错误 · ${w} 警告${w ? "——警告请人工过目" : ""}）`;
  }
  markdown() {
    const icon = { error: "❌", warning: "⚠️", info: "ℹ️", ok: "✅" };
    const lines = [
      "<!-- vendor-check report -->",
      "## 收录申请校验报告（vendor-check）",
      "",
      `**结论：${this.verdict()}**`,
      "",
    ];
    for (const s of this.sections) {
      lines.push(`### ${s.id} ${s.title}`);
      if (s.items.length === 0) lines.push("- ✅ （无问题）");
      for (const item of s.items) lines.push(`- ${icon[item.severity]} ${item.message}`);
      lines.push("");
    }
    lines.push("---", "脚本 = `scripts/vendor-check.mjs`（本地同款可跑）· schema = `schemas/marketplace.schema.json`（SDK/kit 字节同源拷贝）。", "本报告由 vendor-check 自动生成；**合并需运营者人工批准（AI 审查四要素见 `AGENTS.md` §5）**。");
    return lines.join("\n") + "\n";
  }
  json() {
    return { verdict: this.verdict(), errors: this.errors.length, warnings: this.warnings.length, sections: this.sections };
  }
}

let _schemaCache;
function loadSchema() {
  if (_schemaCache) return _schemaCache;
  const parsed = readJsonFile(join(REPO_ROOT, SCHEMA_FILE));
  if (!parsed.ok) throw new Error(`schema 不可读：${parsed.error}`);
  _schemaCache = parsed.value;
  return _schemaCache;
}

// ---------------------------------------------------------------------------
// 校验腿（PR 模式与 weekly 模式共用）
// ---------------------------------------------------------------------------

/** 拉取一个源（marketplace.json → schema 校验 → 收集 id；404 走 K5 plugin.json 合成）。
 *  failSeverity：申请行失败 = error（拦）；既有行失败 = warning（第三方网络抖动不拦新申请）。 */
async function checkOneSource(row, report, label, failSeverity = "error") {
  const raw = normalizeSourceUrl(row.url);
  if (!raw) {
    report.add(failSeverity, `${label}: URL 形态不被支持（只认 github.com 仓库主页或 raw.githubusercontent.com 的 marketplace.json 直链——商店拉取同款，其余主机不猜）`);
    return null;
  }
  const res = await fetchText(raw);
  if (res.kind === "ok") {
    let parsed;
    try { parsed = JSON.parse(res.text); } catch (err) {
      report.add(failSeverity, `${label}: ${raw} 返回的不是合法 JSON（${err.message}）`);
      return null;
    }
    const errors = [];
    const schema = loadSchema();
    validateAgainstSchema(parsed, schema, schema, "$", errors);
    if (errors.length) {
      report.add(failSeverity, `${label}: ${raw} 不过 marketplace.schema.json（${errors.length} 处）：${errors.slice(0, 6).join("；")}${errors.length > 6 ? " …" : ""}`);
      return null;
    }
    const ids = (parsed.plugins ?? []).map((p) => p?.id).filter(Boolean);
    report.add("ok", `${label}: 目录可达且 schema 合法（${ids.length} 条插件）`);
    return ids;
  }
  if (res.kind === "missing") {
    // K5 回落：仓库根无有效目录 ⇒ 同目录 plugin.json 合成 1 条（与商店同款）
    const manifestUrl = catalogSiblingUrl(raw, "plugin.json");
    if (!manifestUrl) {
      report.add(failSeverity, `${label}: ${raw} 404 且推不出同目录 plugin.json（非 raw 直链形态）——missing-manifest`);
      return null;
    }
    const manifest = await fetchText(manifestUrl);
    if (manifest.kind === "ok") {
      let m;
      try { m = JSON.parse(manifest.text); } catch {
        report.add(failSeverity, `${label}: plugin.json 存在但不是合法 JSON——K5 回落失败`);
        return null;
      }
      const id = typeof m?.pluginId === "string" && m.pluginId ? m.pluginId : typeof m?.id === "string" ? m.id : "";
      if (!id || typeof m?.name !== "string" || !m.name || typeof m?.version !== "string" || !m.version) {
        report.add(failSeverity, `${label}: plugin.json 缺 pluginId/name/version——不是可合成的插件清单（K5 回落失败）`);
        return null;
      }
      report.add("ok", `${label}: 无 marketplace.json——走 K5 回落（plugin.json 合成 1 条：${id}）`);
      return [id];
    }
    if (manifest.kind === "missing") {
      report.add(failSeverity, `${label}: missing-manifest——仓库根既无有效 marketplace.json 也无 plugin.json（私有仓/未发布同理，商店也会拉不到）`);
      return null;
    }
    report.add(failSeverity, `${label}: plugin.json 拉取失败 HTTP ${manifest.status}${manifest.error ? `（${manifest.error}）` : ""}——网络或限流，重跑 CI`);
    return null;
  }
  report.add(failSeverity, `${label}: ${raw} 拉取失败 HTTP ${res.status}${res.error ? `（${res.error}）` : ""}（非 404——网络/限流/私有仓？）`);
  return null;
}

/** domain 自证：官网 /.well-known/linkdesk-vendor.txt 内容（trim 后）＝vendorId。 */
async function checkDomainProof(row, report) {
  if (row.verifiedBy !== "domain") {
    report.add("info", `vendors "${row.vendorId}": 认证方式 ${row.verifiedBy} = 人工核对（github-org/manual），CI 不判——运营者合并前自行核对`);
    return;
  }
  const domains = row.domains ?? [];
  if (!domains.length) {
    report.add("error", `vendors "${row.vendorId}": verifiedBy=domain 但没填 domains——无法自证`);
    return;
  }
  for (const domain of domains) {
    const url = `https://${domain}/.well-known/linkdesk-vendor.txt`;
    const res = await fetchText(url);
    if (res.kind !== "ok") {
      report.add("error", `vendors "${row.vendorId}": ${url} 不可达（${res.kind === "missing" ? "HTTP 404" : `HTTP ${res.status}${res.error ? ` ${res.error}` : ""}`}）——域名自证失败`);
      continue;
    }
    if (res.text.trim() !== row.vendorId) {
      report.add("error", `vendors "${row.vendorId}": ${url} 内容 ≠ vendorId（实际 "${res.text.trim().slice(0, 60)}"）——域名自证失败`);
      continue;
    }
    report.add("ok", `vendors "${row.vendorId}": ${url} 自证通过`);
  }
}

/** head vendors.json 全行过 $defs.vendor。 */
function validateVendorRows(rows, schema, report, file) {
  for (const [i, row] of (rows ?? []).entries()) {
    const errors = [];
    validateAgainstSchema(row, schema.$defs.vendor, schema, `$/${i}`, errors);
    for (const err of errors) report.add("error", `${file} 第 ${i + 1} 行（vendorId=${row?.vendorId ?? "?"}）：${err}`);
  }
}

// ---------------------------------------------------------------------------
// 模式一：pr——收录申请 PR 校验（scope／URL／schema／id／vendors 五腿）
// ---------------------------------------------------------------------------

async function runPr({ baseRef, baseFile, headFile, reportFile, asJson }) {
  const report = new Report();
  const schema = loadSchema();

  const baseCatalog = baseFile ? readJsonFile(baseFile) : (baseRef ? gitShow(baseRef, CATALOG_FILE) : gitShow("HEAD", CATALOG_FILE));
  const headCatalog = readJsonFile(headFile ?? join(REPO_ROOT, CATALOG_FILE));
  const baseVendors = baseFile ? readJsonFile(baseFile.replace(/marketplace\.json$/, VENDORS_FILE)) : (baseRef ? gitShow(baseRef, VENDORS_FILE) : gitShow("HEAD", VENDORS_FILE));
  const headVendors = readJsonFile(headFile?.replace(/marketplace\.json$/, VENDORS_FILE) ?? join(REPO_ROOT, VENDORS_FILE));
  if (headFile && !headVendors.ok) headVendors.value = []; // 纯离线对比允许只给 marketplace.json

  // ① scope——作者只许加自己那一行；plugins[]/authors/collections 等官方 curation 逐字节不动
  report.section("①", "自己那行（scope——⛔ 不许碰官方 curation）");
  if (baseRef && !baseFile) {
    const changed = gitChangedFiles(baseRef);
    if (changed) {
      const outside = changed.filter((f) => f !== CATALOG_FILE && f !== VENDORS_FILE);
      if (outside.length) report.add("error", `改动文件超出申请面：${outside.join("、")}——收录 PR 只许动 ${CATALOG_FILE} 的 sources[] 与（可选）${VENDORS_FILE} 自己那行`);
    }
  }
  if (!baseCatalog.ok || !headCatalog.ok || !baseVendors.ok || !headVendors.ok) {
    for (const r of [baseCatalog, headCatalog, baseVendors, headVendors]) if (!r.ok) report.add("error", r.error);
    finish(report, reportFile, asJson);
    return;
  }
  const base = baseCatalog.value; const head = headCatalog.value;
  const baseV = Array.isArray(baseVendors.value) ? baseVendors.value : [];
  const headV = Array.isArray(headVendors.value) ? headVendors.value : [];

  // marketplace.json 除 sources 外全部深等（plugins[] 第三方条目零改动 = 硬断言的 CI 面）
  const stripSources = (c) => { const copy = { ...c }; delete copy.sources; return copy; };
  if (!deepEqual(stripSources(base), stripSources(head))) {
    report.add("error", `${CATALOG_FILE} 的 plugins[]/根级键（version/updatedAt/collections/categoryRail…）发生了 sources 以外的改动——收录申请 PR ⛔ 不许碰官方 curation（收录条目走运营者单独流程）`);
  }
  // sources 只许增行：改行/删行都拦（撤销收录 = 运营者动作）
  const keyOf = (row) => String(row?.url ?? "");
  const baseSources = Array.isArray(base.sources) ? base.sources : [];
  const headSources = Array.isArray(head.sources) ? head.sources : [];
  const baseKeys = new Set(baseSources.map(keyOf));
  const addedRows = headSources.filter((row) => !baseKeys.has(keyOf(row)));
  for (const row of baseSources) {
    const twin = headSources.find((r) => keyOf(r) === keyOf(row));
    if (!twin) report.add("error", `sources 行被删（${row.url}）——撤销收录是运营者动作，申请 PR ⛔ 删别人的行`);
    else if (!deepEqual(twin, row)) report.add("error", `sources 行被改（${row.url}）——申请 PR ⛔ 改别人的行`);
  }
  if (!addedRows.length) report.add("error", `未发现新增 sources[] 行——收录申请 PR 必须自带一行（照 .github/PULL_REQUEST_TEMPLATE/vendor-application.md 填表）`);
  const addedAuthors = addedRows.map((r) => r?.authorId).filter(Boolean);

  // vendors.json：允许增行/改自己那行（vendorId ＝ 本次申请 authorId）；删行 ⛔
  const keyV = (row) => String(row?.vendorId ?? "");
  const baseVKeys = new Set(baseV.map(keyV));
  const addedVRows = headV.filter((row) => !baseVKeys.has(keyV(row)));
  for (const row of baseV) {
    const twin = headV.find((r) => keyV(r) === keyV(row));
    if (!twin) report.add("error", `vendors 行被删（${row.vendorId}）——撤销认证是运营者动作`);
    else if (!deepEqual(twin, row) && !addedAuthors.includes(keyV(row))) {
      report.add("error", `vendors 行被改（${row.vendorId}）——只许改自己那行（vendorId ＝ 本次申请的 authorId）`);
    }
  }

  // head 全文 schema 自查（catalog 根＋vendors 行）
  const catalogErrors = [];
  validateAgainstSchema(head, schema, schema, "$", catalogErrors);
  for (const err of catalogErrors) report.add("error", `${CATALOG_FILE} schema：${err}`);
  validateVendorRows(headV, schema, report, VENDORS_FILE);

  // ② URL 可达＋③ schema 合法（申请源真拉取——与商店同款语义）
  report.section("②", "URL 可达 ＋ ③ 目录 schema 合法（拉取申请源）");
  const officialIds = (base.plugins ?? []).map((p) => p?.id).filter(Boolean);
  const addedIds = [];
  for (const row of addedRows) {
    const ids = await checkOneSource(row, report, `sources "${row.url}"（authorId=${row.authorId ?? "?"}）`);
    if (ids) addedIds.push(...ids);
  }

  // ④ id 不撞——申请源插件 id 对官方/既有源撞车
  report.section("④", "pluginId 不撞（对官方撞 = 警告·收录复制历史路径；对既有源/PR 内撞 = 错误）");
  if (addedIds.length) {
    const dupOfficial = addedIds.filter((id) => officialIds.includes(id));
    if (dupOfficial.length) report.add("warning", `与官方 plugins[] 撞车（semver 高者胜，官方在前）：${dupOfficial.join("、")}——收录复制历史路径的影子，运营者确认是否真要背书`);
  }
  const existingRows = baseSources; // 既有源（含官方已背书清单）——逐个拉取收集 id；失败降级 warning（不拦新申请）
  const existingIds = [];
  for (const row of existingRows) {
    const ids = await checkOneSource(row, report, `既有 sources "${row.url}"（撞车面收集）`, "warning");
    if (ids) existingIds.push(...ids);
  }
  if (addedIds.length && existingIds.length) {
    const dupExisting = [...new Set(addedIds.filter((id) => existingIds.includes(id)))];
    if (dupExisting.length) report.add("error", `与既有收录源撞车：${dupExisting.join("、")}——一个插件 id 只该有一个背书源`);
  }
  const dupWithin = addedIds.filter((id, i) => addedIds.indexOf(id) !== i);
  if (dupWithin.length) report.add("error", `本次申请源内部撞车：${[...new Set(dupWithin)].join("、")}`);

  // ⑤ vendors 认证行——vendorId 不撞＋身份成对＋domain 自证
  report.section("⑤", "vendors 认证行（vendorId 不撞·身份成对·domain 自证）");
  if (headV.length) {
    const vendorIds = headV.map(keyV);
    const dupVendor = vendorIds.filter((id, i) => vendorIds.indexOf(id) !== i);
    for (const id of new Set(dupVendor)) report.add("error", `vendorId "${id}" 撞车——vendors.json 不许重名注册`);
    for (const row of addedVRows) {
      if (!addedAuthors.includes(keyV(row))) {
        report.add("error", `vendors "${row.vendorId}" 没有同身份的 sources 行（authorId=${row.vendorId}）——认证只对已收录源生效，双表单需成对`);
      }
      await checkDomainProof(row, report);
    }
    if (!addedVRows.length && !dupVendor.length) report.add("ok", `vendors.json 无新增行（纯 sources 收录申请——合法，只是不带「官方 ✓」徽标）`);
  } else {
    report.add("ok", `vendors.json 为空——纯 sources 收录申请（合法，不带「官方 ✓」徽标）`);
  }

  finish(report, reportFile, asJson);
}

// ---------------------------------------------------------------------------
// 模式二：weekly——每周复验（domain 自证重跑＋sources 全行可达＋schema 拷贝漂移）
// ---------------------------------------------------------------------------

async function runWeekly({ reportFile, asJson }) {
  const report = new Report();
  const schema = loadSchema();

  report.section("①", "vendors.json 全行 schema＋domain 自证重跑");
  const vendors = readJsonFile(join(REPO_ROOT, VENDORS_FILE));
  if (!vendors.ok) report.add("error", vendors.error);
  else {
    const rows = Array.isArray(vendors.value) ? vendors.value : [];
    if (!Array.isArray(vendors.value)) report.add("error", `${VENDORS_FILE} 根应为数组`);
    validateVendorRows(rows, schema, report, VENDORS_FILE);
    for (const row of rows) await checkDomainProof(row, report);
  }

  report.section("②", "sources[] 全行可达复验");
  const catalog = readJsonFile(join(REPO_ROOT, CATALOG_FILE));
  if (!catalog.ok) report.add("error", catalog.error);
  else {
    const rows = Array.isArray(catalog.value.sources) ? catalog.value.sources : [];
    for (const row of rows) await checkOneSource(row, report, `sources "${row.url}"`);
    report.add("info", `当前收录 ${rows.length} 行·官方条目 ${(catalog.value.plugins ?? []).length} 条（读数 ${new Date().toISOString().slice(0, 10)}）`);
  }

  report.section("③", "schema 拷贝漂移（对 npm 最新版 marketplace-kit）");
  try {
    const remote = await fetchText("https://unpkg.com/@linkdesk/marketplace-kit/schemas/marketplace.schema.json");
    if (remote.kind !== "ok") report.add("warning", `npm 最新 schema 拉取失败 HTTP ${remote.status}——跳过漂移检查（下次复验再试）`);
    else {
      const local = readFileSync(join(REPO_ROOT, SCHEMA_FILE), "utf8");
      if (local !== remote.text) report.add("warning", `schemas/marketplace.schema.json 与 npm 最新版不一致——SDK/kit schema 已演进，同笔刷新本仓拷贝（SDK↔kit↔本仓 字节同源纪律）`);
      else report.add("ok", "schema 拷贝与 npm 最新版字节一致");
    }
  } catch (err) {
    report.add("warning", `npm 最新 schema 拉取异常（${err.message}）——跳过漂移检查`);
  }

  finish(report, reportFile, asJson);
}

// ---------------------------------------------------------------------------
// 模式三：validate-file——单文件 schema 自查（运营者改完 JSON 先自查一遍）
// ---------------------------------------------------------------------------

function runValidateFile(target, asJson) {
  const report = new Report();
  const schema = loadSchema();
  report.section("①", `schema 校验（${target}）`);
  const parsed = readJsonFile(target);
  if (!parsed.ok) report.add("error", parsed.error);
  else {
    const errors = [];
    validateAgainstSchema(parsed.value, schema, schema, "$", errors);
    for (const err of errors) report.add("error", err);
    if (!errors.length) report.add("ok", `通过（根级键 ${Object.keys(parsed.value).join("、")}）`);
  }
  finish(report, undefined, asJson);
}

function finish(report, reportFile, asJson) {
  if (reportFile) writeFileSync(reportFile, report.markdown());
  if (asJson) console.log(JSON.stringify(report.json(), null, 2));
  else console.log(report.markdown());
  process.exitCode = report.errors.length > 0 ? 1 : 0;
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base-ref") args.baseRef = argv[++i];
    else if (a === "--base-file") args.baseFile = argv[++i];
    else if (a === "--head-file") args.headFile = argv[++i];
    else if (a === "--report-file") args.reportFile = argv[++i];
    else if (a === "--json") args.asJson = true;
    else args._.push(a);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const mode = args._[0];
if (mode === "pr") {
  await runPr(args);
} else if (mode === "weekly") {
  await runWeekly(args);
} else if (mode === "validate-file") {
  if (!args._[1]) { console.error("用法：node scripts/vendor-check.mjs validate-file <文件路径>"); process.exitCode = 2; }
  else runValidateFile(args._[1], args.asJson);
} else {
  console.error("用法：vendor-check pr [--base-ref <git-ref> | --base-file <p>] [--head-file <p>] [--report-file <p>] [--json]\n" +
    "      vendor-check weekly [--report-file <p>] [--json]\n" +
    "      vendor-check validate-file <p> [--json]");
  process.exitCode = 2;
}
