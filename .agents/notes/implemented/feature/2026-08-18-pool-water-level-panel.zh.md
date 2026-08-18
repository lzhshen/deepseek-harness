# Agent Note: 基于 tenant.poolStats 的只读池水位面板

Status: implemented

[English](2026-08-18-pool-water-level-panel.md) | 中文

## Problem

V2 已把池化沙箱接入身份链，但池的 bind/reclaim 状态机没有用户可见的面。V3 验收（"看到沙箱 bind/reclaim 随用户切换、离开、回访变化"）需要一个由池的真实 `PoolStats` 支撑的只读水位面板。

## Decision

`tenant.poolStats` RPC 喂给 `@deepseek-ai/dsh-client-ui-tenant` 的第二个 `shell.overlay` 条目，`PoolRuntime` 暴露 `reclaim()` tick，使状态转换无需真实墙钟即可驱动。

- `PoolRuntime.reclaim()` 委托 `PoolManager.reclaimTick()`，销毁保温已到期的 IDLE 沙箱并补水；生产池在定时器上运行它，POC 为面板状态转换而显式暴露。
- API 网关新增 `tenant.poolStats`（只读水位：warm/bound/idle/reclaiming/capacity/reclaimTotal）、`tenant.release`（把当前用户绑定释放进保温倒计时）、`tenant.reclaim`（一次回收 tick）。三者都在 `ctx.pool` 缺失时答 `internal`。
- client 插件新增只读 `PoolPanel`，作为第二个加性 `shell.overlay` 条目：按间隔轮询 `poolStats`，呈现水位与累计回收计数。无动作按钮——面板是纯观察者；已有的"绑定我的沙箱"及 release/reclaim 动词驱动它所显示的状态。

## Alternatives considered

- **独立 `pool.*` RPC 域 + 单独插件包做面板。**对 POC 否决：池动作以当前用户身份行事，属租户范畴；一个 client 插件已拥有 overlay 条目，故 `tenant.*` + `@deepseek-ai/dsh-client-ui-tenant` 里的第二个 overlay 条目把面收敛在一处。
- **POC 里仅靠后台定时器驱动回收。**否决：定时器让面板的 bind → idle → reclaim 转换不确定、且 keyless 测试不可见；显式 `reclaim()` tick 保持状态机确定、可演示。
- **带 bind/release 按钮的可写面板。**否决：面板按设计只读（设计 V3）；改状态的动作已在 switcher 条目中，故面板保持纯观察。

## Consequences

- 池状态机可从浏览器观察：bind（stamp）让 warm→bound，离开（release）让 bound→idle，回收 tick 让 idle→reclaiming→已回收，全部反映在轮询的水位上。
- 面板加性且只读；它不编辑框架骨架、与 switcher 并排组合（设计 D12）。
- `tenant.*` 作为单一租户范畴 RPC 面持续增长，carrier、schema、rpcId 铸造与超时行为保持一致。

## Verification

`pool-dsh` 的 `pool-waterlevel-v3.spec.ts` 驱动完整 bound → idle → reclaim 转换与一次保温命中重绑，断言 `PoolStats` 反映每一阶段；`ui-tenant` 的 `PoolPanel` 规格断言轮询动词呈现水位；apiproxy 的 tenant 规格覆盖 `tenant.poolStats` 往返。
