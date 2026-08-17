# dsh-tenant-residency

[English](README.md) | 中文

多租户引擎的**会话驻留注册表**：哪个大脑副本在内存中持有哪个会话——冷会话可被任意副本唤醒，且一个会话绝不会同时驻留两个副本。

它是**纯库**：单进程注册表，原子认领（已驻留会话重定向到持有者而非二次驻留），超容量时驱逐最久未活动者，空闲驱逐由大脑空闲定时器驱动。生产后端把内存 map 换成 PostgreSQL 行级认领；POC 保留内存实现。

## API

```ts
import { ResidencyRegistry, SessionId } from '@deepseek-ai/dsh-tenant-residency'
```

| 导出 | 职责 |
|---|---|
| `ResidencyRegistry` | `claim`（认领或重定向）、`release`、`touch`、`find`、`evictIdle`、`evictLru`、`list`、`stats`。 |
| `SessionId` | 认领所依据的品牌会话标识。 |
| `ClaimOutcome` | 认领结果：`acquired` + `resident`，或 `redirectedTo`（被其他引擎持有），以及 LRU 驱逐出的 `evicted`。 |

## 核心不变量

一个会话至多驻留一个引擎（并发认领返回持有者而非插入副本）。引擎标识借用 `@deepseek-ai/dsh-pool`，使同一大脑副本值贯穿驻留注册表与孤儿收尸。

## POC 状态

认领/重定向/LRU/空闲驱逐由单测验证；压测模拟器驱动本注册表产出 M4 密度指标。见 [POC 验证报告](../../../design-docs/workbuddy-pool-poc-verification.md)。
