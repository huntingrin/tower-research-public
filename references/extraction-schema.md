# 抽取 Schema

每篇帖子输出一个 JSON 对象。字段名固定，方便跨帖比较和报告生成。

---

## 1. Thread

```json
{
  "id": "<MESSAGE_ID>",
  "url": "https://tower.im/projects/<PROJECT_GUID>/messages/<MESSAGE_ID>",
  "project": {
    "id": "<PROJECT_ID>",
    "guid": "<PROJECT_GUID>",
    "name": "<PROJECT_NAME>"
  },
  "title": "<ENTITY> <TOPIC>",
  "author": "<AUTHOR>",
  "authorUrl": "https://tower.im/members/...",
  "createdAt": "2026-01-01T10:00:00+08:00",
  "lastActivityAt": "2026-01-15T17:00:00+08:00",
  "status": "ongoing",
  "tags": ["<ENTITY>"],
  "participants": ["<PERSON_A>", "<PERSON_B>", "<PERSON_C>"],
  "commentCount": 26,
  "attachments": [
    {
      "name": "<ATTACHMENT_NAME>.pdf",
      "downloadUrl": "https://attachments.tower.im/..."
    }
  ],
  "relevance": {
    "level": "direct",
    "matchedTerms": ["<ENTITY>"],
    "hitCount": 47,
    "locations": ["title", "body", "comment#3", "comment#16"]
  },
  "body": {
    "text": "...",
    "html": "..."
  },
  "comments": [
    {
      "index": 1,
      "author": "<PERSON_A>",
      "createdAt": "2023-02-23T11:25:04+08:00",
      "text": "...",
      "html": "...",
      "attachments": []
    }
  ],
  "events": [
    {
      "type": "event-edit",
      "actor": "<PERSON_A>",
      "action": "编辑了讨论",
      "at": "2023-02-23T10:05:00+08:00"
    }
  ],
  "facts": [],
  "decisions": [],
  "commitments": [],
  "openQuestions": [],
  "numbers": [],
  "risks": []
}
```

---

## 2. 分析字段

### facts

```json
{
  "claim": "客户 5 月 20 日开发布会，传播节点暂定 5 月 27 日",
  "evidence": "comment#1, 2024-05-14",
  "speaker": "黄芳",
  "confidence": "high"
}
```

### decisions

```json
{
  "decision": "5 万以下资源先付款，不等价资源不置换",
  "madeBy": "<PERSON_A>",
  "at": "2024-05-14",
  "evidence": "comment#3"
}
```

### commitments

```json
{
  "who": "黄芳",
  "what": "约见客户方负责人",
  "due": "2025-11",
  "status": "unknown",
  "evidence": "comment#6"
}
```

### openQuestions

```json
{
  "question": "8次方复盘项目的预算出口在直客还是代理？",
  "askedBy": "王立娴",
  "at": "2025-10-29",
  "evidence": "comment#7"
}
```

### numbers

```json
{
  "label": "方案总价",
  "value": "63万",
  "context": "三亿世代图文 + 赛博食录视频 + 超级消费者，专访/活动配送",
  "evidence": "comment#16"
}
```

### risks

```json
{
  "risk": "客户内容传播预算被销量压力挤占",
  "level": "high",
  "evidence": "comment#22, 2023-06-08"
}
```

---

## 3. 相关性判定

- `direct`：标题/标签命中，或正文/评论 ≥2 次实质提及
- `sub-brand`：只命中子品牌
- `peripheral`：仅 1 次顺带提及
- `false-positive`：同名不同实体、纯竞品提及

`locations` 记录命中位置：`title`、`tag`、`body`、`comment#N`。

---

## 4. 证据格式

统一：

```text
comment#<序号>, <日期>
```

或：

```text
body, <日期>
```

报告里的链接：

```text
<帖子URL>#<comment_id>
```

如果拿不到 comment_id，用 `comment#N` + 帖子 URL。

---

## 5. 解析失败

```json
{
  "id": "...",
  "url": "...",
  "error": "PARSE_FAIL",
  "httpStatus": 200,
  "reason": "missing .message",
  "samplePath": "~/.tower-research/cache/<hash>.html"
}
```

失败项必须进报告附录，不能静默丢。
