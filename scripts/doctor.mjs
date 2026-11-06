// ego-lite runtime doctor for tower-research.
// Run with: ego-browser nodejs < scripts/doctor.mjs
//
// Checks:
//   1. whether the ego-lite runtime is present
//   2. whether a TaskSpace can be created/resumed
//   3. whether Tower is reachable and logged in
//
// Writes ~/.tower-research/out/doctor.json and prints a JSON summary.
// Never enters credentials, never reads cookies, never finishes the TaskSpace.

const fs = await import("node:fs/promises");
const os = await import("node:os");
const path = await import("node:path");

const RUNTIME = path.join(os.homedir(), ".tower-research");
const OUT = path.join(RUNTIME, "out");
const CMD_PATH = path.join(RUNTIME, "cmd.json");
const CONFIG_PATH = path.join(RUNTIME, "config.json");
const STATE_PATH = path.join(RUNTIME, "state.json");

// Project defaults: defaults.json can ship with the skill or live in the runtime
// directory. Common install locations are checked so a symlinked install works.
const DEFAULTS_CANDIDATES = [
  path.join(os.homedir(), ".agents", "skills", "tower-research", "defaults.json"),
  path.join(os.homedir(), ".claude", "skills", "tower-research", "defaults.json"),
  path.join(os.homedir(), ".config", "opencode", "skills", "tower-research", "defaults.json"),
  path.join(RUNTIME, "defaults.json"),
];

await fs.mkdir(OUT, { recursive: true });

const now = new Date().toISOString();
const TOWER_URL = "https://tower.im/";

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
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

function result(stage, extra = {}) {
  return {
    // NEED_LOGIN and NO_ACCESS are user-action states, not broken runtimes.
    ok: stage === "READY" || stage === "NEED_LOGIN" || stage === "NO_ACCESS",
    stage,
    checkedAt: now,
    ...extra,
  };
}

async function main() {
  const state = (await readJson(STATE_PATH)) || {};
  const config = (await readJson(CONFIG_PATH)) || {};
  const cmd = (await readJson(CMD_PATH)) || {};
  const defaults = await readDefaults();
  const spaceName = cmd.spaceName || config.spaceName || state.spaceName || defaults.spaceName || "tower-research";
  const defaultUrl = defaultProjectUrl(defaults);
  const probeUrl =
    cmd.probeUrl ||
    config.projectUrl ||
    config.probeUrl ||
    defaultUrl ||
    state.lastProbeUrl ||
    state.probeUrl ||
    TOWER_URL;
  const probeSource = cmd.probeUrl
    ? "cmd"
    : config.projectUrl || config.probeUrl
      ? "config"
      : defaultUrl
        ? "defaults"
        : state.lastProbeUrl || state.probeUrl
          ? "state"
          : "root";
  const probeIsRoot = /^https:\/\/tower\.im\/?$/.test(probeUrl);

  if (typeof globalThis.taskSpace !== "function" || typeof globalThis.listTaskSpaces !== "function") {
    const data = result("NO_EGO", {
      reason: "ego-browser runtime globals are missing. Run this script with: ego-browser nodejs < scripts/doctor.mjs",
      runtime: { node: process.version },
    });
    await writeJson(path.join(OUT, "doctor.json"), data);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  let task;
  try {
    task = await globalThis.taskSpace(spaceName);
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    const conflict = message.includes("EGO_TASK_SPACE_NAME_IN_USE");
    const data = result(conflict ? "SPACE_CONFLICT" : "BROKEN", {
      reason: message,
      spaceName,
      suggestion: conflict ? `${spaceName}-2` : null,
      runtime: { node: process.version },
    });
    await writeJson(path.join(OUT, "doctor.json"), data);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  let page;
  try {
    const pages = await task.pages();
    page = pages[0] || (await task.newPage());
  } catch (error) {
    const data = result("BROKEN", {
      reason: `cannot open a page: ${String(error && error.message ? error.message : error)}`,
      space: { id: task.spaceId, name: spaceName },
      runtime: { node: process.version },
    });
    await writeJson(path.join(OUT, "doctor.json"), data);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  let tower;
  try {
    await page.goto(probeUrl, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    tower = await page.evaluate(({ rootOnly }) => {
      const text = (document.body && document.body.innerText ? document.body.innerText : "").slice(0, 4000);
      const href = location.href;
      const hasPassword = !!document.querySelector('input[type="password"]');
      const loginUrl = /\/signin|\/login|\/sign_in|\/sso/i.test(href);
      const hasMe = !!document.querySelector('a[href*="?me=1"]') || /我自己/.test(text);
      const hasProjectGuid = !!document.querySelector("[data-project-guid]");
      const hasProjectShell = hasProjectGuid || /page-topics|page-message/.test(document.body.innerHTML);
      const notFound = /404|页面不存在|找不到页面|没有权限|无权限|访问受限|项目不存在/.test(`${document.title} ${text}`);
      const loginLink = !!document.querySelector('a[href*="/signin"], a[href*="/login"]')
        || (/登录/.test(text) && /免费试用|注册/.test(text));
      const loginText = /登录|sign in|sign-in/i.test(document.title) || /扫码登录|短信登录|账号登录/.test(text);
      const inTeam = /^\/teams\//.test(location.pathname);
      let login = null;
      if (hasMe || hasProjectShell || inTeam) login = true;
      else if (loginUrl || hasPassword || loginLink || loginText) login = false;
      // Root marketing page can be shown to logged-in users too; do not assert "not logged in" there.
      if (login === false && rootOnly && !loginUrl && !hasPassword) login = null;
      // Only a concrete project page proves access. A login page or a 404 /
      // permission page must never be reported as READY.
      const access = rootOnly ? null : login === true && hasProjectShell && !notFound;
      return {
        url: href,
        title: document.title,
        hasPassword,
        loginUrl,
        loginText,
        hasMe,
        loginLink,
        hasProjectGuid,
        hasProjectShell,
        notFound,
        inTeam,
        login,
        access,
        loginCheck: login === null ? "skipped_root_only" : "checked",
        accessCheck: rootOnly ? "skipped_root_only" : "checked",
      };
    }, { rootOnly: probeIsRoot });
  } catch (error) {
    const data = result("BROKEN", {
      reason: `cannot reach Tower: ${String(error && error.message ? error.message : error)}`,
      space: { id: task.spaceId, name: spaceName },
      runtime: { node: process.version },
    });
    await writeJson(path.join(OUT, "doctor.json"), data);
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  const stage = tower.login === false ? "NEED_LOGIN" : tower.access === false ? "NO_ACCESS" : "READY";
  const nextState = {
    egoInstalled: true,
    historyImported: state.historyImported ?? null,
    lastLoginOkAt: stage === "READY" ? now : state.lastLoginOkAt || null,
    lastCheckedAt: now,
    spaceName,
    lastProbeUrl: stage === "READY" ? probeUrl : state.lastProbeUrl || null,
    lastResolvedAt: state.lastResolvedAt || null,
  };
  await writeJson(STATE_PATH, nextState);

  const data = result(stage, {
    probe: { url: probeUrl, source: probeSource, rootOnly: probeIsRoot },
    defaultsPath: defaults._path || null,
    runtime: { node: process.version, kind: "ego-browser" },
    space: { id: task.spaceId, name: spaceName },
    tower,
    state: {
      historyImported: nextState.historyImported ?? null,
      lastLoginOkAt: nextState.lastLoginOkAt,
    },
    next:
      stage === "NEED_LOGIN"
        ? "follow references/handoff.md"
        : stage === "NO_ACCESS"
          ? "request access to this project in Tower, then rerun doctor"
          : "continue",
  });
  await writeJson(path.join(OUT, "doctor.json"), data);
  console.log(JSON.stringify(data, null, 2));
}

try {
  await main();
} catch (error) {
  const data = result("BROKEN", {
    reason: String(error && error.stack ? error.stack : error),
  });
  await writeJson(path.join(OUT, "doctor.json"), data);
  console.log(JSON.stringify(data, null, 2));
}
