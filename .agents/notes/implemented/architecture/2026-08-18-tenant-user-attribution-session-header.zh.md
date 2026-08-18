# Agent Note: 通过 SessionHeader userId 承载租户用户归属

Status: implemented

[English](2026-08-18-tenant-user-attribution-session-header.md) | 中文

## Problem

共享资源池 POC 需要会话携带归属用户、且 `session.list` 按用户隔离（设计 V0）。会话存储原本没有归属字段，API 网关的 `session.list` 返回所有会话，Web 界面也没有"当前用户"概念。`identity` 包只生成按 home 的匿名 uuid，并非多用户归属。

## Decision

`userId` 是 **`SessionHeader` 上的存储元数据**，而非会话事件。tenant 插件（`@deepseek-ai/dsh-tenant`）持有当前用户上下文与归属辅助方法；API 网关负责盖章与过滤。

- `SessionHeader` 新增可选 `userId?: string`，经 `CreateSessionOptions.meta`、`validateSessionHeader`、`SessionStore.prepare` 透传。`SessionStore.fork` 继承它，`CreateAgentOptions.meta` 对称镜像。
- `@deepseek-ai/dsh-tenant` 是宿主侧 Cordis `Service`（`ctx.tenant`），提供 `listUsers` / `currentUserId` / `selectUser` / `userIdOf` / `belongsTo`。POC 当前用户是一组进程级模拟身份（设计 D7）；`UserId` 品牌位于 `@deepseek-ai/dsh-tenant/types` 子路径。
- `@deepseek-ai/dsh-host-apiproxy` 读 `ctx.get('tenant')`（可选）：`session.create` 把当前用户盖进 agent 的 `meta`，`listVisibleSessionSummaries` 把附加与会话与冷会话都过滤到 `header.userId === currentUserId()`。`SessionSummary`/`sessionSummarySchema`/`sessionListFields` 新增可选 `userId` wire 列。
- 未组合 tenant 服务时，网关保持单用户（不盖章、不过滤）——租户是可选的组合。

## Alternatives considered

- **用 `session/identity` 事件而非 header 字段。**否决：归属是创建时的属性，不是可重放的对话内容；header 字段与 `cwd`/`agentPreset` 对称，不需要 surface/日志通道，也不进入模型可见日志。fork 继承在 header 上显式表达，而非靠 seed 事件免费获得。
- **现在就读取 `X-User-Id` HTTP 头。**对 V0 否决：传输层尚不存在身份管道，接真头要牵动 connection/SSE/gateway 一长串。进程级 roster 保持与下游相同的接口（`currentUserId()`/`userIdOf`），使 SSO 头日后无缝替换而不用改归属调用点。
- **用 `SessionProjectionMap.userId` 投影单元。**否决：投影单元折叠事件，而 `userId` 在 header 上，投影单元看不到。值直接走 `SessionSummary.userId` wire 列。
- **升级 `SESSION_FORMAT_VERSION`。**否决：该字段可选且纯增量；不识别的旧 runtime 会忽略它而不会误读日志，故版本保持 `0`。

## Consequences

- 只有组合 tenant 服务时会话列表才按用户隔离；无归属会话（无 `userId`）对任何租户隔离列表都不可见。
- POC 按进程模拟身份；生产多租户网关必须把身份改为按请求解析，并把 roster 换成 SSO 头。
- 冷会话经 header 持久化与回载 `userId`，因此冷列表隔离与附加会话隔离口径一致（都按 `header.userId`/`meta.userId` 过滤）。
- 会话格式保持向前增量：现有无归属会话只是缺失该字段。

## Verification

`api-proxy-tenant.spec.ts` 组合 tenant 服务与两个会话，断言 `session.list` 只返回当前用户会话、并随 `selectUser` 切换；`fork.spec.ts` 断言盖章与 fork 继承；`tenant.spec.ts` 覆盖 roster/默认值/切换/归属。
