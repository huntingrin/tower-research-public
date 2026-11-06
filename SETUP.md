# 首次使用

这个 skill 不内置任何 Tower 项目。首次使用时，用你自己的 Tower 项目 URL 配置一次；之后每个使用者仍然用自己的 ego-lite 会话访问 Tower。

## 1. 前置

- macOS 或 Windows
- 已安装 ego-lite 和 `ego-browser` CLI
- 已在 ego-lite 里登录 Tower，并且有目标项目的访问权限

如果还没有 ego-lite，先按 ego-browser skill 的安装文档安装，再回来继续。不要用 Chrome、Playwright 或其他浏览器替代。

## 2. 设置项目 URL

二选一。

### 2a. 写本机 config

```bash
mkdir -p ~/.tower-research
cat > ~/.tower-research/config.json <<'JSON'
{
  "spaceName": "tower-research",
  "projectUrl": "https://tower.im/teams/<TEAM_ID>/projects/<PROJECT_ID>/"
}
JSON
```

### 2b. 使用 defaults.json

```bash
mkdir -p ~/.tower-research
cp defaults.example.json ~/.tower-research/defaults.json
# 编辑 ~/.tower-research/defaults.json，填入自己的项目名和 URL
```

只需要项目 URL，不需要手工填 team GUID 或 target_gid；脚本会从当前登录会话的页面里解析。

## 3. 安装 skill

在本仓库根目录执行：

```bash
# OpenCode
ln -s "$PWD" ~/.config/opencode/skills/tower-research

# Claude Code
ln -s "$PWD" ~/.claude/skills/tower-research
```

脚本会按以下顺序寻找项目默认值：

1. `cmd.projectUrl`（本次任务）
2. `~/.tower-research/config.json` 的 `projectUrl`
3. 标准安装目录里的 `defaults.json`（如果你放了）
4. `~/.tower-research/defaults.json`
5. 没有则报错，要求提供项目 URL

## 4. 第一次体检

```bash
ego-browser nodejs < scripts/doctor.mjs
```

看 `stage`：

| stage | 含义 | 下一步 |
|---|---|---|
| `READY` | ego-lite 可用，已登录，项目有权限 | 直接开始检索 |
| `NEED_LOGIN` | ego-lite 可用，但 Tower 未登录 | 见下面的登录 handoff |
| `NO_ACCESS` | 已登录，但当前账号没有该项目权限 | 在 Tower 里申请加入团队/项目，再重跑 |
| `NO_EGO` | 没有 ego-browser 运行时 | 安装 ego-lite，重开终端，再重跑 |
| `SPACE_CONFLICT` | TaskSpace 名称被占用 | 换 `spaceName`，或让用户确认 |
| `BROKEN` | 浏览器运行时异常 | 重开 ego-lite，再重跑 |

`doctor` 不会替用户登录，也不会读取 Cookie。

## 5. 登录 handoff

如果 `stage=NEED_LOGIN`：

1. 在 ego-lite 打开项目页；
2. 让用户本人完成登录（账号密码、扫码、SSO 都可以）；
3. 用户回复“好了”后，重新运行 `doctor`；
4. 仍然未登录就再 handoff 一次，第二次失败则停止，让用户检查账号/权限/网络。

不要替用户输入密码、扫码、处理短信验证码或点 SSO 授权。

## 6. 换项目

用本机配置覆盖：

```json
{ "projectUrl": "https://tower.im/teams/<TEAM_ID>/projects/<PROJECT_ID>/" }
```

或者运行一次 `setup`：

```json
{ "action": "setup", "projectUrl": "https://tower.im/teams/<TEAM_ID>/projects/<PROJECT_ID>/" }
```

也可以只在单次 `cmd.json` 里传 `projectUrl`。优先级：

```text
cmd.projectUrl > config.projectUrl > defaults.json > 报错
```

## 7. 切换账号或重置

```json
{ "action": "reset" }
```

`reset` 会删除 `state.json` 和 `cache/`，保留 `config.json` 和 `out/`。登录态在 ego-lite 里，不在这个目录；切换 Tower 账号后重新跑 `doctor` 即可。

## 8. 本机数据

```text
~/.tower-research/
  defaults.json   # 可选：本机项目默认值
  cmd.json        # 本次任务
  config.json     # 本机覆盖，不进仓库
  state.json      # 环境状态 + lastProbeUrl，不存项目 ID
  out/            # 报告/结构化结果，敏感
  cache/          # 页面 HTML，敏感
```

不要把整个 `~/.tower-research` 打包发给别人。`cache/` 和 `out/` 可能包含 Tower 页面内容、客户名和内部链接；对外分享报告前先脱敏。

## 9. 常见问题

| 现象 | 处理 |
|---|---|
| `NO_EGO` | 没在 ego-browser 运行时里跑；用 `ego-browser nodejs < scripts/doctor.mjs` |
| `NEED_LOGIN` | 在 ego-lite 打开项目页，用户本人登录 |
| `NO_ACCESS` | 当前账号没有项目权限；在 Tower 申请加入团队/项目 |
| 没有项目默认值 | 用 `setup` 或 `config.projectUrl` 设置 |
| TaskSpace 名称冲突 | 换 `spaceName`，或让用户确认 |
| 搜索结果为空 | 确认关键词、项目、账号权限；换别名再试 |
