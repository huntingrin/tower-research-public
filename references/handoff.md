# 登录 Handoff 协议

## 原则

**skill 只负责打开页面，登录由用户本人完成。**

不替用户输入账号密码，不处理扫码、短信、SSO，不读取或保存凭证。

---

## 1. 允许 / 不允许

### 允许

- 在 ego-lite 打开 Tower 页面
- 把页面留在前台
- 告诉用户“登录完成后回我一句”
- 用户确认后重新加载页面，验证登录态
- 登录后跳回项目页

### 不允许

- 填用户名、密码
- 点“登录”“下一步”“授权”等提交按钮
- 处理二维码、短信验证码、SSO 账号选择
- 从默认浏览器读取 Cookie 注入 ego-lite
- 让用户在聊天里粘贴密码或 Cookie
- 在日志、报告、state.json 记录凭证

---

## 2. 检测登录页

优先级从高到低：

1. URL 包含 `/signin`、`/login`、`/sign_in`、`/sso`
2. 页面有 `input[type="password"]`
3. 页面有二维码登录 / 短信验证 / “登录”标题
4. 页面标题包含“登录”且没有项目标题

注意：Tower 可能先跳首页再弹登录框；以最终页面为准。

---

## 3. 流程

```text
1. page.goto(默认项目 URL；有 cmd/config 覆盖时用覆盖值)
2. 检测登录页
3. 如果已登录：
     - 验证项目标题 / data-project-guid
     - 继续
4. 如果未登录：
     - task.handOff()
     - 输出 handoff 话术
     - 结束本轮
5. 用户回复“好了”：
     - 恢复同一个 TaskSpace
     - 重新 page.goto(同一个项目 URL)
     - 再次检测
6. 仍然未登录：
     - 再 handoff 一次
     - 第二次仍失败：停止，让用户检查账号/权限/网络
```

---

## 4. 话术

```text
我已经在 ego-lite 里打开了「<PROJECT_NAME>」。
请你本人完成登录（账号密码、扫码或 SSO 都可以）。
登录完成后回我一句“好了”，我会继续检索；我不会读取或保存你的密码。
```

如果登录后还要加入团队/申请权限：

```text
登录成功了，但当前账号还没有这个项目的访问权限。
请你在 ego-lite 里完成加入团队/权限申请，好了告诉我。
```

---

## 5. 恢复

ego-browser 的 handoff 之后，TaskSpace 可能变成用户持有或需要接管。

### 情况 A：agent 创建的 TaskSpace

```js
const task = await taskSpace(spaceId);
const page = task.userPage() || task.page("p1");
```

### 情况 B：`takeOverTaskSpace`

```js
const task = await takeOverTaskSpace(spaceId);
const page = task.userPage();
```

### 情况 C：用户自己开的 space

```js
const task = await claimTaskSpace(id);
```

细节以 ego-browser 当前版本文档为准。恢复后必须重新 `goto(projectUrl)`，不要假设登录后会回到原页面。

---

## 6. 边界情况

| 情况 | 处理 |
|---|---|
| 登录后跳到首页 | 重新 goto 项目 URL |
| 登录后要求加入团队 | handoff，让用户处理 |
| 中途 session 过期 | 暂停抓取，handoff，恢复后从 checkpoint 继续 |
| SSO 新窗口/弹窗 | 让用户在原窗口完成，skill 不接管 |
| 用户说“你帮我登” | 拒绝，说明只负责打开页面 |
| 用户发来密码 | 不接收，让他自己在浏览器输入 |
| 二维码过期 | 让用户刷新页面重新扫码 |
| 验证码收不到 | 让用户检查手机/邮箱，skill 不重试 |

---

## 7. 安全

- 不在终端回显凭证
- 不把页面 HTML 里的 token 写进日志
- 不把 Cookie 写进 `cmd.json`、`state.json`、报告
- 报告里如果需要提到账号，只写显示名，不写邮箱/手机号
- 登录页截图不落盘；如必须截图，先裁剪并确认不含凭证
