# Tower 适配层

本文固化 Tower 的 URL、ID、搜索参数和 DOM 选择器。所有内容来自实际页面验证，优先于 agent 的临场猜测。

---

## 1. URL 与 ID

| 对象 | 形式 | 说明 |
|---|---|---|
| 团队数字 ID | `<TEAM_ID>` | 出现在项目 URL 里 |
| 团队 GUID | `<TEAM_GUID>` | 搜索必须用 GUID |
| 项目数字 ID | `<PROJECT_ID>` | 出现在项目 URL 里 |
| 项目 GUID | `<PROJECT_GUID>` | 帖子 URL 用这个 |
| 搜索 target_gid | `gid://tower2/Project/<TARGET_ID>` | 内部项目 ID，不等于 URL 里的 `<PROJECT_ID>` |

### 关键坑

- `/teams/<TEAM_ID>/search` 会 404；必须用团队 GUID。
- 搜索的 `target_gid` 不能直接用 `<PROJECT_ID>`，要从搜索页的项目下拉框拿。
- 项目页有 `data-project-guid`，帖子 URL 用它。
- 项目页导航里有 `/teams/<team_guid>/projects`，可从那里拿团队 GUID。
- 只用项目名定位时，需要 `teamGuid`（团队页 URL）或 `projectUrl`；数字 `teamId` 不能直接打开团队页（`/teams/<TEAM_ID>/` 会 404）。

### 项目页

```text
/teams/<team_id>/projects/<project_id>/
```

页面内：

- 项目名：`.page-title .title`、`h1`
- 项目 GUID：`[data-project-guid]`
- 项目 URL：`[data-url="/teams/<team_id>/projects/<project_id>"]`

### 帖子页

```text
/projects/<project_guid>/messages/<message_id>
```

---

## 2. 搜索

```text
GET /teams/<team_guid>/search/
  ?keyword=<q>
  &target_gid=<gid>
  &exclude_trash=true
  &page=<N>
```

- 每页 20 条
- `page` 从 1 开始
- 站内总数在 `.result-count` 的父元素文本里
- 结果容器：`ul.results`，带 `data-page`
- 结果项：`ul.results > li[data-category]`

### 结果字段

| 字段 | 选择器 |
|---|---|
| 分类 | `li[data-category]`，如 `Message` / `Document` / `Todo` / `Attachment` |
| 标签名 | `.result-title a.tag[data-text]` |
| 标题 | `.result-title a:not(.tag)` |
| 父帖链接 | `.result-title a.message-rest` / `a.document-rest` / `a.todo-rest` |
| 摘要 | `.main > p:not(.result-title):not(.result-ancestor)` |
| 项目 | `.result-ancestor a` |
| 时间 | `.result-time[data-readable-time]` |
| 作者 | `.author` |

### 标签命中

`Message` 分类里有一类是标签命中：

- 标题链接是标签本身（`a.tag`）
- 真正的帖子在 `a.message-rest`
- 不能把标签名当帖子标题

### 评论命中

- `href` 可能带 `#<comment_id>`
- 必须回溯到父帖 `message_id`
- 同一父帖的多条评论只算一个帖子，但保留命中次数

### 分页

- 站内总数不可信：分页会重叠，实际抓取数可能小于/大于总数
- 停止条件：当前页 0 条，或连续 2 页没有新条目
- 每页之间 sleep 300–800ms

---

## 3. 标签页

```text
/teams/<team_guid>/search?category=3&project_guid=<project_guid>&tag=%23<tag>
```

- 结果项同样在 `ul.results > li`
- `a.message-rest` 才是帖子
- 标签页结果数可能比全文搜索少，作为补充，不替代全文搜索

---

## 4. 讨论列表

```text
/teams/<team_id>/projects/<project_id>/topics
/teams/<team_id>/projects/<project_id>/topics?finish=true
```

- 进行中 / 已结束两个列表
- 每个列表可能只有几十篇
- `tr-project-topic-list` 带 `finish-page` 和 `scroll-load-url`
- **历史消息不一定出现在列表里**：必须用全文搜索补
- 列表项：`.messages .message`
  - 标题：`.message-title`
  - 作者：`.name`
  - 时间：`.time[data-readable-time]`
  - 链接：`a.message-link`

---

## 5. 帖子解析

页面根：`.message`

| 字段 | 选择器 |
|---|---|
| 标题 | `.message-subject` |
| 标签 | `.message-subject a.tag[data-text]` |
| 作者 | `.info .author` |
| 创建时间 | `.info .create-time[data-readable-time]` |
| 正文 | `.message-content` |
| 回复容器 | `.comment`（排除 `.comment-form`） |
| 回复作者 | `.comment .info .author` |
| 回复时间 | `.comment .info .create-time[data-readable-time]` |
| 回复正文 | `.comment .comment-content` |
| 附件 | `.attachment-file .attachment-info .name a` |
| 动态 | `.event` |
| 动态时间 | `.event-created-at[data-created-at]` |

### 回复数校验

- 页面 HTML 里的 `.comment` 数量 = 回复数 + 1 个评论表单
- 如果页面提供 `data-comments-count`，和实际数量比对
- 不一致时检查“加载更多”/分页

### 大帖

- 超过 100 条回复：不要全量塞上下文
- 抽取：命中词前后窗口 + 首条/末条 + 动态记录
- 报告里标注“只读了相关段落”

---

## 6. 附件

- 附件链接通常在 `attachments.tower.im`，需要登录态
- 默认只记录文件名、大小、链接，不下载
- 需要下载时，用同一会话的 `page.fetch`，不要用匿名 fetch
- 大附件（几十 MB）先问用户

---

## 7. 登录页判定

- URL 含 `/signin`、`/login`、`/sign_in`、`/sso`
- `input[type="password"]`
- 二维码 / 短信验证 / “登录”标题
- 页面没有项目标题

登录后必须重新 `goto(projectUrl)`，不要假设会回到原页面。

---

## 8. 权限

- 搜索只返回当前账号有权限的内容
- 无权限项目可能 404 或跳登录
- 不要尝试绕过权限
- 回收站默认 `exclude_trash=true`；需要看回收站时先问用户

---

## 9. 项目标识示例

`resolve` 会从当前登录会话的项目页和搜索页解析出：

```json
{
  "teamId": "<TEAM_ID>",
  "teamGuid": "<TEAM_GUID>",
  "projectId": "<PROJECT_ID>",
  "projectGuid": "<PROJECT_GUID>",
  "targetGid": "gid://tower2/Project/<TARGET_ID>",
  "projectName": "<PROJECT_NAME>"
}
```

这些是 Tower 工作区标识，不是个人登录信息。登录态始终在各人的 ego-lite 里。换项目时用 `config.projectUrl` 或 `cmd.projectUrl` 覆盖。

回归测试请使用自己的测试项目，不要在公开仓库写真实项目名、GUID 或客户数据。
