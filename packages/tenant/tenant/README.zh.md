# dsh-tenant

[English](README.md) | 中文

共享资源池 POC 的**宿主侧多租户身份插件**。它持有"当前用户"上下文（浏览器切换的一组模拟身份，设计 D7），以及 API 边界用于给会话盖章归属 `userId`、并列表按用户隔离的归属辅助方法。

它本身只做归属：给每个新会话的"户口本"盖上当前用户 id，`session.list` 只返回该用户的会话。隔离在列表边界执行，而非靠字段存在与否——该字段是元数据，不是权限证明。

## API

```ts
import TenantService from '@deepseek-ai/dsh-tenant'
```

| 导出 | 职责 |
|---|---|
| `TenantService` | Cordis 服务（`ctx.tenant`）：`listUsers`、`currentUserId`、`selectUser`、`userIdOf`、`belongsTo`。 |
| `UserId` | 品牌化归属用户标识（来自 `dsh-tenant/types`）。 |

会话"户口本"经 `@deepseek-ai/dsh-session` 的 `CreateSessionOptions.meta` 携带 `userId`；API 网关（`@deepseek-ai/dsh-host-apiproxy`）读 `ctx.get('tenant')` 来盖章与过滤。未组合 tenant 服务时，网关保持单用户。

## 已知局限与延后工作

- **模拟身份而非 SSO**：当前用户是配置里声明的一组进程级身份。生产用 SSO 注入的请求头替换这组身份；下游 `currentUserId()` / `listForUser()` 接口设计上可免改切换。
- **进程级当前用户**：POC 的当前用户是一个进程事实，非按请求状态，因此单个网关进程同一时刻服务一个用户（浏览器通过调用 tenant 边界切换来换人）。生产多租户网关把身份改为按请求解析。
