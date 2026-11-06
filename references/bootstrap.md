# Bootstrap：ego-lite 检测、安装、历史同步

## 目标

在任何 Tower 检索开始前，把环境从“不知道有没有浏览器”推进到：

```text
ego-lite 可用 + Tower 已登录
```

过程中只做三件事：

1. 检测
2. 引导安装 / 首次启动 / 历史同步
3. 登录 handoff

---

## 1. 状态机

```text
UNKNOWN
  ├─ 检测失败（没有 ego-browser） → NO_EGO
  ├─ 检测失败（运行时异常） → BROKEN
  └─ 检测通过 → CLI_READY
        ├─ 历史未询问 → HISTORY_PROMPT
        └─ 已询问 → READY
              ├─ Tower 未登录 → NEED_LOGIN → WAITING_USER → READY
              └─ Tower 已登录 → READY
```

只有 `READY` 允许进入 Phase 0。

任何一步用户拒绝安装/使用 ego-lite → `STOP`。

---

## 2. 检测

### 2.1 命令层

```bash
command -v ego-browser
```

- 没有输出：`NO_EGO`
- 有输出：继续

```bash
ego-browser skill
```

- 报 unknown command / 报错：`BROKEN`，提示重装或升级
- 正常打印 usage guide：继续

### 2.2 运行时层

```bash
ego-browser nodejs -e 'const s = await listTaskSpaces(); console.log(JSON.stringify({ ok: true, spaces: s.length }))'
```

- 返回 `{ok:true,...}`：运行时可用
- 报连接失败：让用户打开 ego-lite，或重开应用

### 2.3 Tower 登录层

`scripts/doctor.mjs` 默认打开本机 `config.projectUrl` 或 `defaults.json` 里的项目页；都没有才打开 `https://tower.im/`。检查：

- 是否跳到 `/signin`、`/login`、SSO 域名
- 页面是否有密码输入框 / 二维码 / 短信验证
- 页面标题是否包含“登录”
- 项目页是否有 `data-project-guid`，还是 404/权限页

结果写入：

```json
{
  "ok": true,
  "stage": "READY",
  "probe": { "url": "https://tower.im/teams/.../projects/.../", "source": "defaults" },
  "tower": { "login": true, "access": true, "url": "https://tower.im/...", "title": "..." }
}
```

`NO_ACCESS` 表示已登录但当前账号没有该项目权限，应让用户在 Tower 申请加入团队/项目，再重跑 doctor。

---

## 3. 没有 ego-lite：安装

### 3.1 话术

```text
这个 skill 的 Tower 检索全部在 ego-lite 里完成。
当前没有检测到 ego-lite，我可以帮你安装。
装好后还需要你从默认浏览器同步一次历史记录，这样项目定位会更准。
要现在开始吗？
```

### 3.2 执行

1. 用户同意后，读 ego-browser skill 的 `references/install.md`；
2. 按 macOS / Windows 对应文档执行；
3. 不要在本 skill 里复制安装命令；
4. 不要静默安装；
5. 安装完成后让用户重开终端；
6. 重新跑检测，直到 `CLI_READY`。

### 3.3 用户拒绝

```text
可以理解。但这个 skill 不支持用 Chrome 或其他浏览器操作 Tower。
如果你之后愿意装 ego-lite，我随时可以帮你装。
```

停止，不换浏览器。

---

## 4. 首次启动

ego-lite 装好后，第一次打开需要用户完成：

1. onboarding
2. 系统权限（macOS 的自动化 / 辅助功能等，按提示）
3. 选择是否从默认浏览器导入数据
4. 打开至少一个页面，确认浏览器正常

让用户完成后回复“好了”，再跑运行时检测。

---

## 5. 历史同步

### 5.1 为什么

- 让 ego-lite 继承用户日常浏览上下文
- 项目定位时可以参考用户最近访问过的 Tower 项目
- 减少“这个项目叫什么”的来回

### 5.2 边界

必须说清楚：

- **历史同步 ≠ 登录态同步**。浏览历史通常不含 Cookie，Tower 该登录还是要登录。
- 历史同步是推荐项，不是硬门槛。用户拒绝也可以继续。
- skill 不读取、不导出、不上传用户历史。
- 不让用户把历史文件发到聊天里。

### 5.3 引导

```text
接下来请在 ego-lite 里完成两件事：
1. 首次启动/权限确认；
2. 从默认浏览器导入浏览历史（设置 → 导入浏览数据，勾选“浏览历史”即可）。

说明一下：历史同步不等于登录态同步，Tower 该登录还是要登录。
同步完成后回我一句“好了”。
```

如果当前 ego-lite 版本没有“历史同步”入口，就以实际提供的“导入浏览数据”为准；不要写死菜单路径。

### 5.4 验证

只让用户确认，不读历史内容。

可选：让用户自己在 ego-lite 历史页搜索 `tower.im`，确认能看到记录。skill 不读取其他条目。

### 5.5 用户拒绝

记录：

```json
{ "historyImported": "declined" }
```

继续，不阻塞。

用户确认已导入后，把 `~/.tower-research/state.json` 里的 `historyImported` 改成 `true`；拒绝则改成 `declined`。

---

## 6. 状态文件

`~/.tower-research/state.json`：

```json
{
  "egoInstalled": true,
  "historyImported": true,
  "lastLoginOkAt": "2026-11-06T10:00:00+08:00",
  "lastCheckedAt": "2026-11-06T10:00:00+08:00",
  "spaceName": "tower-research",
  "lastProbeUrl": "https://tower.im/teams/.../projects/.../"
}
```

只存环境状态、时间和最后探测 URL。不存 team/project GUID、Cookie、密码、token、历史条目。项目默认值放本机 `config.json` 或 `defaults.json`；公开仓库不内置项目。

---

## 7. 常见问题

| 现象 | 处理 |
|---|---|
| `ego-browser: command not found` | 安装 ego-lite |
| `ego-browser skill` 报 unknown command | 升级 ego-browser |
| `nodejs` 连不上浏览器 | 打开 ego-lite；检查是否被系统拦截 |
| TaskSpace 名称被占用 | 换 `spaceName`，或让用户确认 |
| 历史导入失败 | 记录，继续；不阻塞 |
| 用户坚持用 Chrome | 拒绝，停止 |
