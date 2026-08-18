# @deepseek-ai/dsh-pool-dsh

[English](README.md) | 中文

池化沙箱在 DSH 上的宿主形态。它把纯库 [`@deepseek-ai/dsh-pool`](../pool/README.md) 的 `PoolManager` 装进一个 Cordis 服务（`ctx.pool`），并提供文件系统与子进程两条 seam 的 Provider（`ctx.fs` / `ctx.subprocess`），把每个调用方路由进各自的池化用户目录。本包正是纯库有意缺省的那层 DSH 组装——它证明了池与两条 seam Provider 确实能在 Cordis 上下文中组合起来。

## 配置

池宿主是服务插件（`ctx.pool`）；两条 seam Provider 以程序化方式与之组合（生产时拆成姊妹包，镜像 `dsh-e2b` / `dsh-fs-e2b` / `dsh-subprocess-e2b` 三件套）。服务配置：

```yaml
- id: pool
  name: '@deepseek-ai/dsh-pool-dsh'
  config:
    pool:
      poolCapacity: 100
      targetWarmCount: 20
      idleTimeoutMs: 600000
    storageRoot: /data/workbuddy/users
    engineId: brain-replica-01
```

```ts
// Programmatic composition (the POC's assembly, exercised by the tests):
await ctx.plugin(PoolRuntime, { pool, storageRoot, engineId })
await ctx.plugin(PoolFileSystem, { cwd })
await ctx.plugin(PoolSubprocess)
```

`pool` 在 POC 的内存账本与假 Pod 基座上宿主 `PoolManager`；`poolCapacity`/`targetWarmCount`/`idleTimeoutMs` 是管理器的可调项。`storageRoot` 是 CFS 的本地替身——每个用户的文件落在 `storageRoot/<userId>/` 下，用户之间天然隔离（决策 D11）。`engineId` 为孤儿收尸标记本大脑副本，缺省为随机 id。

`PoolFileSystem` 与 `PoolSubprocess` **取代**本地后端注册为 `ctx.fs`/`ctx.subprocess`（同时加载会冲突）。组合了 tenant 服务（`@deepseek-ai/dsh-tenant`）时，它们的基准目录跟随 `ctx.tenant.currentUserId()`——相对路径与子进程工作目录解析到 `storageRoot/<currentUserId>/` 下，两个用户落在两个不同目录（设计 V2）；未组合 tenant 时回退到配置的 `cwd`。沙箱绑定本身由引擎循环经 `ctx.pool.acquire()` 获取（异步、先于工具调用——设计 3.3.3）。

`PoolTenantProbe`（`ctx.poolTenantProbe`）是一个宿主侧服务，一次调用驱动整条身份链供浏览器回显：当前用户 → `pool.acquire` → 在该用户目录写盖章文件 → 读回。

## 模型体验

无：本包不注册任何模型可见上下文，文件系统与 bash 工具负责各自的效果渲染。

#### KV Cache 影响

无直接失效；本包不贡献请求 token。

## 已知限制与待办

- **Pod 基座是假的**——`FakePodFactory` 记录生命周期调用并注入时延；真实 K8s `PodFactory`（预热 Deployment + CFS subPath 挂载 + 沙箱内 agent）替换它。
- **账本是内存的**——PostgreSQL `PoolLedger`（`UPDATE … WHERE state='WARM'` 行级原子认领）替换 `MemoryLedger`，以得到跨副本正确性。
- **`spawnTerminal` 未实现**——POC 直接抛错；终端分配不在其验证的池化执行生命周期内。
- **按目录路由实现的按用户隔离不是内核边界**——`storageRoot/<userId>` 划分镜像了 CFS 布局；对不可信代码的内核级隔离仍归 shell 沙箱负责。
