# 排障

## 1. 环境

| 现象 | 原因 | 处理 |
|---|---|---|
| `ego-browser: command not found` | 未安装 | 按 bootstrap.md 安装 |
| `ego-browser skill` 报 unknown command | 版本旧 | 升级 ego-browser |
| `nodejs` 连不上浏览器 | ego-lite 没开 / 权限被拒 | 打开 ego-lite，检查系统权限 |
| TaskSpace 名称被占用 | 用户已有同名 space | 换 `spaceName`，或让用户确认 |
| `NO_EGO` | 没在 ego-browser 运行时里跑 | 用 `ego-browser nodejs < script` |
| 默认项目不对 | `defaults.json` 是本机默认 | `setup`，或 `config.projectUrl` / `cmd.projectUrl` 覆盖 |
| `state.json` 没有 team/project ID | 设计如此 | 每次 `resolve` 从项目 URL 和页面解析 |

---

## 2. 登录

| 现象 | 处理 |
|---|---|
| 跳到 `/signin` | handoff |
| 二维码登录 | handoff |
| 短信验证 | handoff |
| SSO 账号选择 | handoff |
| 登录后回首页 | 重新 goto 项目 URL |
| 登录后要求加入团队 | handoff，或返回 `NO_ACCESS`，让用户申请权限 |
| `NO_ACCESS` | 已登录但没有项目权限；在 Tower 申请加入团队/项目，再重跑 doctor |
| 中途 session 过期 | 暂停，handoff，从 checkpoint 继续 |

不要重试凭证，不要注入 Cookie。

---

## 3. 搜索

| 现象 | 原因 | 处理 |
|---|---|---|
| 0 条 | 关键词不对/项目不对/没权限 | 换别名、查项目、确认登录 |
| 总数和抓取数不一致 | 分页重叠 | 以去重后为准，报告里说明 |
| 同一页重复 | 分页 bug | 按结果 key 去重，继续下一页 |
| 结果全是标签 | 标签命中 | 用 `a.message-rest` 回溯父帖 |
| 搜索结果没有历史帖 | 列表不索引历史消息 | 用全文搜索，不要只扫列表 |
| 429 | 限流 | 退避 1s/2s/4s，最多 3 次 |
| 403 | 权限/风控 | 停止，告诉用户 |

---

## 4. 解析

| 现象 | 处理 |
|---|---|
| `.message` 不存在 | 保存 HTML，标 `PARSE_FAIL` |
| 回复数和页面不一致 | 检查加载更多/分页 |
| 标题为空 | 可能被删除/无权限，记录 |
| 附件名解析不到 | 保留链接，标 `UNKNOWN_NAME` |
| 时间解析不到 | 保留原始字符串，不猜 |

不要用正则硬猜结构；失败就记录。

---

## 5. 内容

| 现象 | 处理 |
|---|---|
| 同一 memo 重复发帖 | 标“与 #X 正文相同” |
| 同名不同实体 | 标 `false-positive` |
| 竞品提及 | 标 `peripheral` |
| 大帖几百回复 | 只抽相关窗口 + 首尾 + 动态 |
| 附件很大 | 默认不下载，先问用户 |
| 图片里有文字 | 默认不 OCR，报告里说明 |

---

## 6. 报告

| 现象 | 处理 |
|---|---|
| 结论太空 | 加数字、日期、证据 |
| 事实和判断混在一起 | 用“原文/判断”分开 |
| 没有覆盖证明 | 补命中/去重/打开/失败 |
| 误命中没标 | 附录单列 |
| 用户只想要一句话 | 先给 3 条结论，再问要不要全文 |
