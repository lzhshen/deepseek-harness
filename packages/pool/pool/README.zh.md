# dsh-pool

[English](README.md) | 中文

多租户办公平台 POC 的**共享沙箱池管理器**：沙箱账本（哪个绑定键持有哪个沙箱）的唯一所有者、WARM→BOUND→IDLE→RECLAIMING 状态机，以及三个后台任务（空闲回收倒计时、预热池补水、孤儿收尸）。

它是**纯库**，不是 Cordis 服务：不注册 `ctx`，不持有全局状态。引擎端 pool-client 插件包装 `PoolManager`；独立部署的池服务把它与持久化账本、K8s `PodFactory` 组合。POC 用内存账本与假 Pod 工厂，使整个生命周期无需集群即可测试。

## API

```ts
import { PoolManager, MemoryLedger, FakePodFactory, BindingKey, EngineId } from '@deepseek-ai/dsh-pool'
```

| 导出 | 职责 |
|---|---|
| `PoolManager` | acquire/release/reportIdle/heartbeat 接口 + `refillTick`/`reclaimTick`/`orphanTick` 调度器。 |
| `MemoryLedger` | 内存 `PoolLedger`，强制"一键一沙箱"与受守状态转移。 |
| `FakePodFactory` | 进程内 `PodFactory`，确定性 id + 事件记录。 |
| `Sandbox` | 不可变沙箱实体与受守状态转移。 |
| `PoolExhaustedError` | 无预热沙箱时 `acquire` 抛出；映射 `50301` 响应。 |
| `BindingKey` / `EngineId` / `SandboxId` | 品牌跨边界 id（`BindingKey` 在 POC 中取值 = 用户 id，按 D10 可配置）。 |

## 核心不变量

- 一个绑定键至多对应一个 BOUND/IDLE 沙箱（账本违反即抛）。
- WARM + BOUND + IDLE 不超过 `poolCapacity`（`refillTick` 强制）。
- 回收即销毁重建；脏 Pod 不复用（设计默认）。

## POC 状态

状态机与调度器由单测验证。生产路径把 `MemoryLedger` 换成 PostgreSQL 账本（行级原子认领）、把 `FakePodFactory` 换成挂载用户 CFS subPath 的 K8s Pod 工厂——两者保持同一契约。见 [POC 验证报告](../../../design-docs/workbuddy-pool-poc-verification.md)。
