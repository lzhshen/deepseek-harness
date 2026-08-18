# Agent Note: 池化沙箱接入租户身份链

Status: implemented

[English](2026-08-18-pooled-sandbox-tenant-identity-chain.md) | 中文

## Problem

V0 已盖章会话归属、按用户隔离列表，V1 让浏览器可切换当前用户，但池化沙箱（`ctx.fs` / `ctx.subprocess` / `ctx.pool`）仍按固定的配置目录路由，而非当前操作用户。V2 验收（"切换用户、发任务、看到该用户沙箱/文件是自己的"）需要文件系统与子进程两条 seam 跟随租户身份。

## Decision

`PoolFileSystem` 与 `PoolSubprocess` 变为租户感知，并新增 `PoolTenantProbe` 服务与 `tenant.stamp` RPC 端到端证明这条链。

- 组合了 tenant 服务时，`PoolFileSystem.resolve` 与 `PoolSubprocess.spawn` 把相对路径与子进程工作目录路由到 `storageRoot/<currentUserId>/` 下，用户读自 `ctx.get('tenant').currentUserId()`。绝对调用方路径原样放行；未组合 tenant 服务时两者回退到配置的 `cwd`（租户前单用户的形态）。
- `PoolTenantProbe`（`ctx.poolTenantProbe`）一次调用驱动整条链：当前用户 → `pool.acquire(userId)` → 在 `storageRoot/<userId>/` 下写盖章文件 → 读回。它直接写在存储根上（不走 `ctx.fs`），故可在沙箱围栏 `ctx.fs` 旁组合。
- API 网关新增 `tenant.stamp`，委托给 `poolTenantProbe`；client 的 `@deepseek-ai/dsh-client-ui-tenant` 切换新增"绑定我的沙箱"动作，回显该用户的沙箱 id、冷/热标志、文件路径与读回内容。

## Alternatives considered

- **经 agent-preset realm 而非 tenant 服务路由分阶段目录。**否决：池是 host-plane 单例（一键一沙箱），当前用户是进程事实，故 tenant 服务是列表与池共同读的唯一权威。
- **让探针经 `ctx.fs` 写。**否决：web profile 里的 `ctx.fs` 是 `dsh-fs-sandbox` 而非池化 provider，探针因此无法走池路径；直接写在 `storageRoot/<userId>/` 上，使探针无论组合哪个 `ctx.fs` 都正确。
- **独立 `pool.*` RPC 域。**对 POC 否决：该动作以当前用户身份行事，属租户范畴，故 `tenant.stamp` 走既有 tenant 域并共享 carrier。

## Consequences

- 身份链现在是浏览器可全程体验的一条路径：切用户 → `pool.acquire` → 在 `storageRoot/<userId>/` 下读写 → 回显；文件系统与子进程两条 seam 按同一用户路由。
- Provider 保持向后兼容：未组合 tenant 服务的组合保留固定目录行为，此前单用户 pool-dsh 组装仍有效。
- 探针写真实文件、绑真实（假 Pod）沙箱；按用户隔离仍是目录路由而非内核边界（决策 D11 与既有局限）。

## Verification

`pool-dsh` 的 `pool-tenant-v2.spec.ts` 组合 tenant 服务、池与两个租户感知 provider，断言切用户把文件系统与子进程工作重定向到新用户目录、探针回显每用户不同沙箱；apiproxy 的 tenant 规格断言 `tenant.stamp` 往返与缺探针失败。
