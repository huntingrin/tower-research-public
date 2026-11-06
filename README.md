# tower-research

Tower（tower.im）检索与研究 skill 的开发仓库。

目标：给任何 agent 一句话，例如“去某个 Tower 项目把某客户的所有记录找出来分析”，就能完成：

1. 环境检查（ego-lite / 历史同步 / 登录 handoff）
2. 项目定位
3. 多关键词全量检索
4. 逐帖读取正文与全部回复
5. 结构化、跨帖分析
6. 输出带引用的报告

---

## 项目默认值

本公开仓库**不内置任何团队项目**。首次使用时，用自己的 Tower 项目 URL 覆盖：

```json
{ "projectUrl": "https://tower.im/teams/<TEAM_ID>/projects/<PROJECT_ID>/" }
```

或者把 `defaults.example.json` 复制到 `~/.tower-research/defaults.json`，填入自己的项目：

```bash
mkdir -p ~/.tower-research
cp defaults.example.json ~/.tower-research/defaults.json
```

读取优先级：

```text
cmd.projectUrl > config.projectUrl > defaults.json > 报错
```

项目 ID 是 Tower 工作区标识，不是个人登录信息；登录态始终在各人的 ego-lite 里。

---

## 当前状态

v1 已完成并可跑通：

- `scripts/doctor.mjs`：ego-lite 检测、TaskSpace 检查、Tower 登录态与项目权限检查
- `scripts/tower.mjs`：`resolve` / `search` / `fetch` / `run` / `verify` / `setup` / `reset`
- `references/`：环境、handoff、Tower 适配、检索、抽取、分析、输出、排障
- `templates/`：报告模板、登录 handoff 话术
- `evals/`：评测用例

已在真实 Tower 项目上验证：多关键词检索、逐帖抓取、回复数校验均通过。公开仓库不包含内部项目名、GUID 或客户数据。

---

## 安装到 agent

把整个目录放到对应 agent 的 skills 目录，或用软链接：

```bash
# 在 skill 仓库根目录执行
# OpenCode
ln -s "$PWD" ~/.config/opencode/skills/tower-research

# Claude Code
ln -s "$PWD" ~/.claude/skills/tower-research
```

其他 agent：把 `SKILL.md` 放到它的 skill/instruction 入口，或直接引用本目录。

## 快速开始

前置：macOS / Windows，已安装 ego-lite 与 ego-browser CLI，并已在 ego-lite 登录 Tower。

```bash
# 1. 设置自己的项目（二选一）
# 1a. 写本机 config
cat > ~/.tower-research/config.json <<'JSON'
{ "projectUrl": "https://tower.im/teams/<TEAM_ID>/projects/<PROJECT_ID>/" }
JSON

# 1b. 或复制 defaults.example.json 后编辑
cp defaults.example.json ~/.tower-research/defaults.json

# 2. 体检
ego-browser nodejs < scripts/doctor.mjs

# 3. 写请求
cat > ~/.tower-research/cmd.json <<'JSON'
{
  "action": "run",
  "spaceName": "tower-research",
  "entity": "<ENTITY>",
  "directAliases": ["<DIRECT_ALIAS>"],
  "aliases": ["<ALIAS_1>", "<ALIAS_2>"],
  "subBrands": ["<SUB_BRAND>"],
  "maxPagesPerKeyword": 10,
  "maxThreads": 60,
  "depth": "exhaustive"
}
JSON

# 4. 执行
ego-browser nodejs < scripts/tower.mjs

# 5. 读取
cat ~/.tower-research/out/run.json
cat ~/.tower-research/out/context-pack.md
cat ~/.tower-research/out/threads.json
```

换项目时，加 `projectUrl`，或运行一次 `setup`：

```json
{ "action": "setup", "projectUrl": "https://tower.im/teams/<TEAM_ID>/projects/<PROJECT_ID>/" }
```

---

## 动作

| action | 作用 | 主要输出 |
|---|---|---|
| `resolve` | 项目定位，拿 team/project/GUID/targetGid | `out/resolve.json` |
| `search` | 多关键词检索、合并、分级 | `out/search.json` |
| `fetch` | 按 topic 列表抓正文/回复/附件 | `out/fetch.json` |
| `run` | resolve + search + fetch + context pack | `out/run.json`、`out/context-pack.md`、`out/threads.json` |
| `verify` | 抽样重抓，比对标题/回复数 | `out/verify.json` |
| `setup` | 写入本机 `config.json`，设置项目 URL | `out/setup.json` |
| `reset` | 清 `state.json` 和 `cache/`，保留 `config.json`/`out/` | `out/reset.json` |

---

## 运行时目录

```text
~/.tower-research/
  defaults.json   # 可选：本机项目默认值
  cmd.json        # 本次任务
  config.json     # 本机覆盖（projectUrl / spaceName），不进仓库
  state.json      # 只存环境状态和 lastProbeUrl，不存项目 ID
  out/
  cache/
```

`state.json` 不存 team/project GUID，也不存 Cookie/密码。登录态在 ego-lite。`cache/` 会保存页面 HTML，`out/` 会保存报告，两者都按本机敏感数据对待。

---

## 已知限制

- 只覆盖文字；附件正文、图片内文字未 OCR
- 只覆盖当前账号有权限、Tower 搜索索引到的内容
- 搜索结果会分页重叠，站内总数不等于去重后数量
- 历史消息不一定出现在“进行中/已结束”列表，必须依赖全文搜索
- `run` 默认只抓 `Message`（讨论）；文档/任务只出现在 `search` 结果里
- 大帖（几百回复）只抽相关窗口，完整阅读需另开
- 只按项目 URL 定位，不支持只给项目名；需要先打开项目页复制 URL

---

## 开发

```bash
node --check scripts/doctor.mjs
node --check scripts/tower.mjs
```

测试用例见 `evals/cases.md`。
