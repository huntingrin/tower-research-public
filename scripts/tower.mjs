// tower-research CLI.
// Run with: ego-browser nodejs < scripts/tower.mjs
//
// Reads ~/.tower-research/cmd.json and executes one action:
//   resolve | search | fetch | run | verify | setup | reset
//
// Writes results to ~/.tower-research/out/ and prints a JSON summary.
// Read-only: never posts, replies, edits, or deletes.

const fs = await import("node:fs/promises");
const os = await import("node:os");
const path = await import("node:path");

const RUNTIME = path.join(os.homedir(), ".tower-research");
const CMD_PATH = path.join(RUNTIME, "cmd.json");
const CONFIG_PATH = path.join(RUNTIME, "config.json");
const STATE_PATH = path.join(RUNTIME, "state.json");
const OUT = path.join(RUNTIME, "out");
const CACHE = path.join(RUNTIME, "cache");

// Project defaults can live in the skill repo (defaults.json) or in the
// runtime directory. The public repo ships defaults.example.json, not a real
// project. All paths are candidates only; no personal identifiers live here.
const DEFAULTS_CANDIDATES = [
  path.join(os.homedir(), ".agents", "skills", "tower-research", "defaults.json"),
  path.join(os.homedir(), ".claude", "skills", "tower-research", "defaults.json"),
  path.join(os.homedir(), ".config", "opencode", "skills", "tower-research", "defaults.json"),
  path.join(RUNTIME, "defaults.json"),
];

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function writeText(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, data);
}

async function readDefaults() {
  for (const file of DEFAULTS_CANDIDATES) {
    const data = await readJson(file);
    if (data) return { ...data, _path: file };
  }
  return {};
}

function defaultProjectUrl(defaults) {
  return defaults.project?.url || defaults.defaultProject?.url || null;
}

const cmd = await readJson(CMD_PATH);
if (!cmd) {
  console.error(JSON.stringify({ ok: false, stage: "NO_CMD", path: CMD_PATH }, null, 2));
  process.exit(1);
}

const bootConfig = (await readJson(CONFIG_PATH, {})) || {};
const bootDefaults = await readDefaults();
const action = cmd.action || "run";
const spaceName = cmd.spaceName || bootConfig.spaceName || bootDefaults.spaceName || "tower-research";

function summarize(data) {
  const out = {
    ok: data.ok,
    stage: data.stage,
    action: data.action,
    at: data.at,
  };
  if (data.project) out.project = data.project;
  if (data.search) {
    out.search = {
      keywords: data.search.keywords,
      perKeyword: data.search.perKeyword,
      totalText: data.search.totalText,
      countTexts: data.search.countTexts,
      rawHitCount: data.search.rawHitCount,
      topicCount: data.search.topicCount,
      messageTopicCount: data.search.messageTopicCount,
      documentTopicCount: data.search.documentTopicCount,
      levels: data.search.levels,
    };
  }
  if (data.threads) {
    out.threads = data.threads.map((t) => ({
      id: t.id,
      title: t.title,
      level: t.relevance?.level,
      commentCount: t.commentCount,
      createdAt: t.createdAt,
      lastActivityAt: t.lastActivityAt,
    }));
  }
  if (data.failures) out.failures = data.failures.length;
  if (data.contextPack) out.contextPack = data.contextPack;
  if (data.results) out.results = data.results;
  if (data.reason) out.reason = data.reason;
  if (data.next) out.next = data.next;
  if (data.candidates) out.candidates = data.candidates;
  if (data.options) out.options = data.options;
  return out;
}

async function save(stage, name, payload) {
  const data = { ok: stage === "OK" || stage === "NEED_LOGIN", stage, action, at: new Date().toISOString(), ...payload };
  const file = path.join(OUT, `${name}.json`);
  await writeJson(file, data);
  console.log(JSON.stringify({ ...summarize(data), out: file }, null, 2));
  return data;
}

async function saveAction(name, payload) {
  const data = { ok: true, stage: "OK", action, at: new Date().toISOString(), ...payload };
  const file = path.join(OUT, `${name}.json`);
  await writeJson(file, data);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

// Local-only commands. They must not open a browser or touch a TaskSpace.
if (action === "setup") {
  const config = bootConfig;
  const defaults = bootDefaults;
  const projectUrl = cmd.projectUrl || config.projectUrl || defaultProjectUrl(defaults) || null;
  if (!projectUrl) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          stage: "NO_DEFAULT",
          action,
          reason:
            "setup: no project URL. Put defaults.json next to the skill, or pass cmd.projectUrl, or set ~/.tower-research/config.json.",
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  const nextConfig = {
    spaceName: cmd.spaceName || config.spaceName || defaults.spaceName || "tower-research",
    projectUrl,
  };
  await writeJson(CONFIG_PATH, nextConfig);
  await saveAction("setup", {
    configPath: CONFIG_PATH,
    defaultsPath: defaults._path || null,
    config: nextConfig,
    note: "This file is local to the current machine. Do not commit or share it.",
  });
  process.exit(0);
}

if (action === "reset") {
  await fs.rm(STATE_PATH, { force: true });
  await fs.rm(CACHE, { recursive: true, force: true });
  await fs.mkdir(CACHE, { recursive: true });
  await saveAction("reset", {
    cleared: [STATE_PATH, CACHE],
    kept: [CONFIG_PATH, OUT],
    note: "Login lives in ego-lite, not in this directory. Re-run doctor after switching accounts.",
  });
  process.exit(0);
}

if (typeof globalThis.taskSpace !== "function") {
  await save("NO_EGO", action, {
    reason: "ego-browser runtime globals are missing. Run with: ego-browser nodejs < scripts/tower.mjs",
  });
  process.exit(0);
}

let task;
try {
  task = await globalThis.taskSpace(spaceName);
} catch (error) {
  const message = String(error && error.message ? error.message : error);
  const conflict = message.includes("EGO_TASK_SPACE_NAME_IN_USE");
  await save(conflict ? "SPACE_CONFLICT" : "BROKEN", action, {
    reason: message,
    suggestion: conflict ? `${spaceName}-2` : null,
  });
  process.exit(0);
}

const pages = await task.pages();
const page = pages[0] || (await task.newPage());

function isLoginPage(html, finalUrl) {
  if (/\/signin|\/login|\/sign_in|\/sso/i.test(finalUrl || "")) return true;
  const hasPassword = /type=["']password["']/.test(html);
  const hasShell = /page-message|page-topics|data-project-guid|message-subject/.test(html);
  return hasPassword && !hasShell;
}

async function fetchHtml(url, { retries = 3 } = {}) {
  let lastError = null;
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await page.fetch(url, { timeout: 30000 });
      if (res.ok) {
        if (isLoginPage(res.body, res.url)) {
          const err = new Error("NEED_LOGIN");
          err.code = "NEED_LOGIN";
          err.finalUrl = res.url;
          throw err;
        }
        return { html: res.body, url: res.url, status: res.status };
      }
      if ([429, 500, 502, 503, 504].includes(res.status) && i < retries) {
        await sleep(800 * (i + 1));
        continue;
      }
      throw new Error(`HTTP ${res.status} for ${url}`);
    } catch (error) {
      if (error && error.code === "NEED_LOGIN") throw error;
      lastError = error;
      if (i < retries) await sleep(800 * (i + 1));
    }
  }
  throw lastError || new Error(`fetch failed: ${url}`);
}

function extractIds(url) {
  const teamId = (url.match(/\/teams\/(\d+)\//) || [])[1] || null;
  const projectId = (url.match(/\/projects\/(\d+)\//) || [])[1] || null;
  return { teamId, projectId };
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[\s\u3000]+/g, "")
    .replace(/[·・]/g, "");
}

async function parseProjectPage(html, url) {
  return page.evaluate(
    ({ html, url }) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "");
      const projectGuid = doc.querySelector("[data-project-guid]")?.getAttribute("data-project-guid") || null;
      const teamHref = [...doc.querySelectorAll('a[href^="/teams/"]')]
        .map((a) => a.getAttribute("href") || "")
        .find((h) => /\/projects\/?$/.test(h));
      const teamGuid = (teamHref || "").match(/\/teams\/([0-9a-f]{32})\/projects/)?.[1] || null;
      const name =
        txt(doc.querySelector("h1")) ||
        txt(doc.querySelector(".project-name")) ||
        (doc.title || "").replace(/\s*-\s*Tower.*$/, "").trim() ||
        txt(doc.querySelector(".page-title .title"));
      return { url, projectGuid, teamGuid, name, title: doc.title || "" };
    },
    { html, url },
  );
}

async function parseProjectSelector(html, entity) {
  return page.evaluate(
    ({ html }) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "");
      return [...doc.querySelectorAll("select option")].map((o) => ({
        value: o.value,
        text: txt(o),
        searchKey: o.getAttribute("data-search-key") || "",
      }));
    },
    { html, entity },
  );
}

async function resolveProject() {
  const config = (await readJson(CONFIG_PATH, {})) || {};
  const defaults = await readDefaults();
  let projectUrl =
    cmd.projectUrl ||
    config.projectUrl ||
    config.probeUrl ||
    defaultProjectUrl(defaults) ||
    null;
  let projectName = cmd.projectName || cmd.projectHint || defaults.project?.name || defaults.defaultProject?.name || null;
  let teamGuid = cmd.teamGuid || config.teamGuid || defaults.project?.teamGuid || null;
  let teamId = cmd.teamId || config.teamId || defaults.project?.teamId || null;

  if (!projectUrl) {
    throw new Error(
      "resolve: no project URL. Set defaults.json (team default), ~/.tower-research/config.json (personal override), or cmd.projectUrl.",
    );
  }

  const pageRes = await fetchHtml(projectUrl);
  const info = await parseProjectPage(pageRes.html, pageRes.url);
  const ids = extractIds(pageRes.url || projectUrl);
  teamGuid = teamGuid || info.teamGuid;
  teamId = teamId || ids.teamId;
  projectName = info.name || projectName;

  if (!info.projectGuid) throw new Error("resolve: data-project-guid not found; page may be a login page or permission page");
  if (!teamGuid) throw new Error("resolve: team GUID not found");

  let targetGid = cmd.targetGid || null;
  if (!targetGid) {
    const searchRes = await fetchHtml(
      `https://tower.im/teams/${teamGuid}/search/?keyword=${encodeURIComponent(cmd.entity || "test")}`,
    );
    const options = await parseProjectSelector(searchRes.html, cmd.entity || "test");
    const target = normalize(projectName);
    const matches = options.filter((o) => o.value && o.value.startsWith("gid://tower2/Project/"));
    const exact = matches.find((o) => normalize(o.text) === target);
    const loose = exact || matches.find((o) => normalize(o.text).includes(target) || target.includes(normalize(o.text)));
    if (!loose) {
      const err = new Error("resolve: target_gid not found in project selector");
      err.options = matches.slice(0, 40);
      throw err;
    }
    targetGid = loose.value;
  }

  const resolved = {
    teamId,
    teamGuid,
    projectId: ids.projectId || cmd.projectId || null,
    projectGuid: info.projectGuid,
    targetGid,
    projectName,
    projectUrl: `https://tower.im/teams/${teamId || teamGuid}/projects/${ids.projectId || cmd.projectId || ""}/`,
  };

  const state = (await readJson(STATE_PATH, {})) || {};
  await writeJson(STATE_PATH, {
    egoInstalled: state.egoInstalled ?? true,
    historyImported: state.historyImported ?? null,
    lastLoginOkAt: state.lastLoginOkAt || null,
    lastCheckedAt: state.lastCheckedAt || null,
    spaceName,
    lastProbeUrl: resolved.projectUrl,
    lastResolvedAt: new Date().toISOString(),
  });

  return resolved;
}

async function parseSearchPage(html) {
  return page.evaluate((html) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "");
    const countText = txt(doc.querySelector(".result-count")?.parentElement) || txt(doc.querySelector(".result-count"));
    const rows = [...doc.querySelectorAll("ul.results > li")].map((li) => {
      const main = li.querySelector(".main");
      const tagA = main?.querySelector(".result-title a.tag");
      const restA = main?.querySelector(
        ".result-title a.message-rest, .result-title a.document-rest, .result-title a.todo-rest",
      );
      const anyA = main?.querySelector(".result-title a:not(.tag)");
      const ancestor = main?.querySelector(".result-ancestor a");
      return {
        category: li.getAttribute("data-category") || "",
        tag: tagA?.getAttribute("data-text") || txt(tagA) || null,
        title: txt(anyA),
        href: anyA?.getAttribute("href") || null,
        parentHref: restA?.getAttribute("href") || null,
        snippet: txt(main?.querySelector("p:not(.result-title):not(.result-ancestor)")),
        ancestor: txt(ancestor),
        ancestorHref: ancestor?.getAttribute("href") || null,
        time: main?.querySelector(".result-time")?.getAttribute("data-readable-time") || null,
        author: txt(main?.querySelector(".author")),
      };
    });
    return { countText, rows };
  }, html);
}

function messageIdFromHref(href) {
  return (String(href || "").match(/\/messages\/([0-9a-f]{32})/) || [])[1] || null;
}

function levelFor(topic, cmd) {
  const directTerms = [cmd.entity, ...(cmd.directAliases || [])].filter(Boolean).map(normalize);
  const subSource = cmd.subBrands && cmd.subBrands.length ? cmd.subBrands : cmd.aliases || [];
  const subTerms = subSource.filter(Boolean).map(normalize).filter((t) => !directTerms.includes(t));
  const title = normalize(topic.title);
  const tags = (topic.tags || []).map(normalize);
  if (directTerms.some((t) => t && (title.includes(t) || tags.some((g) => g.includes(t))))) return "direct";
  if (subTerms.some((t) => t && (title.includes(t) || tags.some((g) => g.includes(t))))) return "sub-brand";
  return "peripheral";
}

async function searchAll(resolved) {
  const keywords = [...new Set(
    (cmd.keywords || [cmd.entity, ...(cmd.aliases || [])])
      .filter(Boolean)
      .map((k) => String(k).trim())
      .filter(Boolean),
  )];
  if (!keywords.length) throw new Error("search: no keywords");

  const maxPages = Number(cmd.maxPagesPerKeyword || 10);
  const rawHits = [];
  const perKeyword = [];
  const countTexts = [];

  for (const keyword of keywords) {
    let previousNew = 0;
    let keywordCount = 0;
    let keywordCountText = null;
    for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
      const url = `https://tower.im/teams/${resolved.teamGuid}/search/?keyword=${encodeURIComponent(keyword)}&target_gid=${encodeURIComponent(resolved.targetGid)}&exclude_trash=true&page=${pageNo}`;
      const res = await fetchHtml(url);
      const parsed = await parseSearchPage(res.html);
      if (!keywordCountText && parsed.countText) keywordCountText = parsed.countText;
      if (!parsed.rows.length) break;

      let newRows = 0;
      for (const row of parsed.rows) {
        const key = [row.category, row.parentHref || row.href, row.time, row.title, row.tag, keyword].join("|");
        if (rawHits.some((h) => h.key === key)) continue;
        rawHits.push({ ...row, keyword, key });
        newRows += 1;
        keywordCount += 1;
      }
      if (newRows === 0) {
        previousNew += 1;
        if (previousNew >= 2) break;
      } else {
        previousNew = 0;
      }
      await sleep(350);
    }
    perKeyword.push({ keyword, hits: keywordCount, countText: keywordCountText });
    if (keywordCountText) countTexts.push({ keyword, countText: keywordCountText });
  }

  const topics = new Map();
  for (const hit of rawHits) {
    const mid = hit.category === "Message" ? messageIdFromHref(hit.parentHref) : null;
    const docKey = (hit.href || hit.parentHref || "").split("#")[0];
    const key = mid || [hit.category, docKey, hit.title].join("|");
    if (!topics.has(key)) {
      topics.set(key, {
        id: mid,
        key,
        category: hit.category,
        title: hit.tag && hit.title ? `${hit.tag} ${hit.title}` : hit.title || hit.tag || "",
        url: mid
          ? `https://tower.im/projects/${resolved.projectGuid}/messages/${mid}`
          : hit.href
            ? new URL(hit.href, "https://tower.im").href
            : null,
        hitCount: 0,
        keywords: new Set(),
        tags: new Set(),
        authors: new Set(),
        samples: [],
        first: hit.time,
        last: hit.time,
      });
    }
    const topic = topics.get(key);
    topic.hitCount += 1;
    topic.keywords.add(hit.keyword);
    if (hit.tag) topic.tags.add(hit.tag);
    if (hit.author) topic.authors.add(hit.author);
    if (hit.time) {
      if (!topic.first || hit.time < topic.first) topic.first = hit.time;
      if (!topic.last || hit.time > topic.last) topic.last = hit.time;
    }
    if (hit.snippet && topic.samples.length < 5) topic.samples.push(hit.snippet.slice(0, 300));
    if (!topic.title && (hit.title || hit.tag)) topic.title = hit.title || hit.tag;
  }

  const list = [...topics.values()].map((t) => {
    const item = {
      ...t,
      keywords: [...t.keywords],
      tags: [...t.tags],
      authors: [...t.authors],
    };
    item.level = t.category === "Message" ? levelFor(item, cmd) : "peripheral";
    return item;
  });

  list.sort((a, b) => String(a.first || "").localeCompare(String(b.first || "")));

  const levels = list.reduce((acc, t) => {
    acc[t.level] = (acc[t.level] || 0) + 1;
    return acc;
  }, {});

  const messageTopicCount = list.filter((t) => t.category === "Message").length;
  const documentTopicCount = list.filter((t) => t.category === "Document").length;
  return {
    keywords,
    perKeyword,
    countTexts,
    totalText: countTexts.length === 1 ? countTexts[0].countText : null,
    rawHitCount: rawHits.length,
    uniqueHitCount: rawHits.length,
    topicCount: list.length,
    messageTopicCount,
    documentTopicCount,
    levels,
    topics: list,
  };
}

async function parseThread(html, id, resolved) {
  return page.evaluate(
    ({ html, id, projectGuid, projectName }) => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, " ").trim() : "");
      const abs = (href) => {
        if (!href) return null;
        try {
          return new URL(href, "https://tower.im").href;
        } catch {
          return href;
        }
      };
      const parseAttachments = (root) => {
        if (!root) return [];
        return [...root.querySelectorAll(".attachment-file")]
          .map((el) => {
            const name =
              txt(el.querySelector(".attachment-info .name a")) || txt(el.querySelector(".attachment-info .name"));
            const hrefs = [...el.querySelectorAll("a[href]")]
              .map((a) => a.getAttribute("href"))
              .filter(Boolean);
            const dl = hrefs.find((h) => /download=true/.test(h));
            return { name, downloadUrl: abs(dl), guid: el.getAttribute("data-guid") };
          })
          .filter((a) => a.name);
      };

      const msg = doc.querySelector(".message");
      if (!msg) {
        return { id, error: "PARSE_FAIL", reason: "missing .message", title: doc.title || "" };
      }
      const info = msg.querySelector(".info");
      const content = msg.querySelector(".message-content");
      const comments = [...doc.querySelectorAll(".comment")]
        .filter((c) => !c.classList.contains("comment-form") && c.querySelector(".comment-content"))
        .map((c, i) => {
          const cInfo = c.querySelector(".info");
          const timeEl = cInfo?.querySelector(".create-time");
          return {
            index: i + 1,
            domId: c.id || null,
            author: txt(cInfo?.querySelector(".author")),
            createdAt:
              timeEl?.querySelector("[data-readable-time]")?.getAttribute("data-readable-time") ||
              (timeEl?.getAttribute("title") || "").replace(/^创建于\s*/, "") ||
              null,
            text: txt(c.querySelector(".comment-content")),
            html: c.querySelector(".comment-content")?.innerHTML || "",
            attachments: parseAttachments(c),
          };
        })
        .filter((c) => c.text || c.attachments.length);

      const events = [...doc.querySelectorAll(".event")].map((e) => ({
        type: [...e.classList].find((x) => x.startsWith("event-") && x !== "event-common") || "",
        actor: txt(e.querySelector(".event-actor")),
        action: txt(e.querySelector(".event-action")),
        at: e.querySelector(".event-created-at")?.getAttribute("data-created-at") || null,
      }));

      return {
        id,
        url: `https://tower.im/projects/${projectGuid}/messages/${id}`,
        project: { guid: projectGuid, name: projectName },
        title: txt(msg.querySelector(".message-subject")),
        author: txt(info?.querySelector(".author")),
        authorUrl: abs(info?.querySelector(".author")?.getAttribute("href")),
        createdAt: info?.querySelector(".create-time")?.getAttribute("data-readable-time") || null,
        lastActivityAt:
          comments.length > 0
            ? comments[comments.length - 1].createdAt
            : info?.querySelector(".create-time")?.getAttribute("data-readable-time") || null,
        tags: [...msg.querySelectorAll(".message-subject a.tag")].map((a) => a.getAttribute("data-text") || txt(a)),
        bodyText: txt(content),
        bodyHtml: content?.innerHTML || "",
        attachments: parseAttachments(msg),
        comments,
        events,
        commentCount: comments.length,
      };
    },
    { html, id, projectGuid: resolved.projectGuid, projectName: resolved.projectName },
  );
}

async function fetchThreads(resolved, topics) {
  const threads = [];
  const failures = [];
  for (const topic of topics) {
    if (!topic.id) {
      failures.push({ id: topic.key, url: topic.url, error: "NO_MESSAGE_ID" });
      continue;
    }
    const url = `https://tower.im/projects/${resolved.projectGuid}/messages/${topic.id}`;
    try {
      const res = await fetchHtml(url);
      await writeText(path.join(CACHE, `${topic.id}.html`), res.html);
      const thread = await parseThread(res.html, topic.id, resolved);
      if (thread.error) {
        failures.push({ id: topic.id, url, error: thread.error, reason: thread.reason });
      } else {
        threads.push({
          ...thread,
          relevance: {
            level: topic.level,
            matchedTerms: topic.keywords,
            hitCount: topic.hitCount,
            samples: topic.samples,
          },
        });
      }
    } catch (error) {
      if (error && error.code === "NEED_LOGIN") throw error;
      failures.push({ id: topic.id, url, error: "FETCH_FAIL", reason: String(error && error.message ? error.message : error) });
    }
    await sleep(400);
  }
  return { threads, failures };
}

function clip(text, max) {
  const s = String(text || "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n\n...[截断 ${s.length - max} 字]`;
}

function buildContextPack(resolved, search, threads, failures) {
  const lines = [];
  lines.push(`# ${cmd.entity || "Tower"} 检索上下文包`);
  lines.push("");
  lines.push(`- 项目：${resolved.projectName}`);
  lines.push(`- 项目 URL：${resolved.projectUrl}`);
  lines.push(`- 检索时间：${new Date().toISOString()}`);
  lines.push(`- 关键词：${search.keywords.join(" / ")}`);
  lines.push(`- 站内计数：${search.countTexts?.map((c) => `${c.keyword} ${c.countText}`).join("；") || search.totalText || "未知"}`);
  lines.push(`- 抓取命中：${search.rawHitCount}`);
  lines.push(`- 归并条目：${search.topicCount}（Message ${search.messageTopicCount ?? "?"} / Document ${search.documentTopicCount ?? "?"}）`);
  lines.push(`- 已打开：${threads.length}；失败：${failures.length}`);
  lines.push(`- 分级：direct ${search.levels.direct || 0} / sub-brand ${search.levels["sub-brand"] || 0} / peripheral ${search.levels.peripheral || 0}`);
  lines.push("");
  lines.push("> 本文件只做上下文整理，不代替最终报告。引用时请回到原帖核对。");
  lines.push("");

  const order = { direct: 0, "sub-brand": 1, peripheral: 2 };
  const sorted = [...threads].sort((a, b) => {
    const la = order[a.relevance.level] ?? 9;
    const lb = order[b.relevance.level] ?? 9;
    if (la !== lb) return la - lb;
    return String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
  });

  for (const thread of sorted) {
    lines.push("---");
    lines.push("");
    lines.push(`## [${thread.relevance.level}] ${thread.title}`);
    lines.push("");
    lines.push(`- URL：${thread.url}`);
    lines.push(`- 作者：${thread.author || "未知"}`);
    lines.push(`- 创建：${thread.createdAt || "未知"}`);
    lines.push(`- 最后活动：${thread.lastActivityAt || "未知"}`);
    lines.push(`- 回复：${thread.commentCount}`);
    lines.push(`- 标签：${(thread.tags || []).join(" / ") || "无"}`);
    lines.push(`- 命中：${thread.relevance.hitCount} 次；${(thread.relevance.matchedTerms || []).join(" / ")}`);
    lines.push("");
    lines.push("### 正文");
    lines.push("");
    lines.push(clip(thread.bodyText, thread.relevance.level === "peripheral" ? 1200 : 6000));
    lines.push("");

    if (thread.comments.length) {
      lines.push("### 回复");
      lines.push("");
      const direct = thread.relevance.level === "direct";
      const all = direct && thread.comments.length <= 40;
      const terms = [...(thread.relevance.matchedTerms || []), cmd.entity].filter(Boolean);
      for (const comment of thread.comments) {
        const isRelevant = all || terms.some((t) => String(comment.text || "").includes(t));
        if (!isRelevant) continue;
        lines.push(`#### #${comment.index} ${comment.author} · ${comment.createdAt || "未知"}`);
        lines.push("");
        lines.push(clip(comment.text, all ? 3000 : 1600));
        lines.push("");
        if (comment.attachments?.length) {
          lines.push(`附件：${comment.attachments.map((a) => a.name).join(" | ")}`);
          lines.push("");
        }
      }
      if (!all) {
        lines.push("> 非直接相关或大帖：只列了命中词相关回复，完整内容请看原帖。");
        lines.push("");
      }
    }

    if (thread.attachments?.length) {
      lines.push("### 附件");
      lines.push("");
      for (const a of thread.attachments) lines.push(`- ${a.name}`);
      lines.push("");
    }
  }

  if (failures.length) {
    lines.push("---");
    lines.push("");
    lines.push("## 抓取失败");
    lines.push("");
    for (const f of failures) lines.push(`- ${f.url || f.id}：${f.error} ${f.reason || ""}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  if (action === "resolve") {
    const resolved = await resolveProject();
    await save("OK", "resolve", { project: resolved });
    return;
  }

  if (action === "search") {
    const resolved = cmd.projectGuid && cmd.targetGid ? cmd : await resolveProject();
    const search = await searchAll(resolved);
    await save("OK", "search", { project: resolved, search });
    return;
  }

  if (action === "fetch") {
    const resolved = cmd.projectGuid ? cmd : await resolveProject();
    const topics = cmd.topics || [];
    const { threads, failures } = await fetchThreads(resolved, topics);
    await save("OK", "fetch", { project: resolved, threads, failures });
    return;
  }

  if (action === "verify") {
    const input = await readJson(path.join(OUT, "threads.json"));
    const threads = input?.threads || input?.data?.threads || [];
    const resolved = input?.project || (await resolveProject());
    const sample = threads.slice(0, Number(cmd.sampleSize || 3));
    const results = [];
    for (const old of sample) {
      const res = await fetchHtml(old.url);
      const fresh = await parseThread(res.html, old.id, resolved);
      results.push({
        id: old.id,
        titleMatch: old.title === fresh.title,
        commentMatch: old.commentCount === fresh.commentCount,
        oldTitle: old.title,
        newTitle: fresh.title,
        oldComments: old.commentCount,
        newComments: fresh.commentCount,
      });
      await sleep(400);
    }
    await save("OK", "verify", { results });
    return;
  }

  // default: run
  const resolved = await resolveProject();
  const search = await searchAll(resolved);
  const maxThreads = Number(cmd.maxThreads || 60);
  const order = { direct: 0, "sub-brand": 1, peripheral: 2 };
  const depth = cmd.depth || "exhaustive";
  const maxPeripheral = Number(cmd.maxPeripheral || 30);
  const eligible = [...search.topics]
    .filter((t) => t.category === "Message" && t.id)
    .filter((t) => {
      if (depth === "direct") return t.level === "direct";
      if (depth === "direct+sub") return t.level === "direct" || t.level === "sub-brand";
      return true;
    });
  const directAndSub = eligible.filter((t) => t.level === "direct" || t.level === "sub-brand");
  const peripheral = eligible.filter((t) => t.level === "peripheral").slice(0, maxPeripheral);
  const selected = [...directAndSub, ...peripheral]
    .sort((a, b) => {
      const la = order[a.level] ?? 9;
      const lb = order[b.level] ?? 9;
      if (la !== lb) return la - lb;
      return String(a.first || "").localeCompare(String(b.first || ""));
    })
    .slice(0, maxThreads);

  const { threads, failures } = await fetchThreads(resolved, selected);
  await writeJson(path.join(OUT, "threads.json"), { project: resolved, threads, failures });
  const pack = buildContextPack(resolved, search, threads, failures);
  await writeText(path.join(OUT, "context-pack.md"), pack);

  const summary = {
    project: resolved,
    search: {
      keywords: search.keywords,
      perKeyword: search.perKeyword,
      totalText: search.totalText,
      countTexts: search.countTexts,
      rawHitCount: search.rawHitCount,
      topicCount: search.topicCount,
      messageTopicCount: search.messageTopicCount,
      documentTopicCount: search.documentTopicCount,
      levels: search.levels,
    },
    threads: threads.map((t) => ({
      id: t.id,
      title: t.title,
      url: t.url,
      author: t.author,
      createdAt: t.createdAt,
      lastActivityAt: t.lastActivityAt,
      commentCount: t.commentCount,
      level: t.relevance.level,
      hitCount: t.relevance.hitCount,
    })),
    failures,
    contextPack: path.join(OUT, "context-pack.md"),
  };
  await save("OK", "run", summary);
}

try {
  await main();
} catch (error) {
  if (error && error.code === "NEED_LOGIN") {
    await save("NEED_LOGIN", action, {
      reason: "Tower requires login. Open the project page in ego-lite and hand off to the user.",
      finalUrl: error.finalUrl || null,
      next: "references/handoff.md",
    });
    process.exit(0);
  }
  await save("ERROR", action, {
    reason: String(error && error.message ? error.message : error),
    candidates: error?.candidates || null,
    options: error?.options || null,
    stack: error?.stack || null,
  });
}
