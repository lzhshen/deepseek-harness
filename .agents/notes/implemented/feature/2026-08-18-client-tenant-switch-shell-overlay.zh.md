# Agent Note: 通过 tenant RPC 与 shell overlay 实现前端当前用户切换

Status: implemented

[English](2026-08-18-client-tenant-switch-shell-overlay.md) | 中文

## Problem

V0 已给会话盖章归属 `userId`、并按当前用户隔离 `session.list`，但页面无法切换用户，多用户验收判据（"两个用户只看到自己的会话"）缺用户可见的控件。切换需要一个浏览器可调用的宿主 RPC，以及一个不改框架骨架的 UI 面（设计 D12：骨架插件零改动）。

## Decision

`tenant.list` / `tenant.select` 是两个新的 apiproxy 一元方法，`@deepseek-ai/dsh-client-ui-tenant` 把切换渲染为 `shell.overlay` 的加性条目。

- 宿主网关（`dsh-host-apiproxy`）新增 `tenant` 域：`tenant.list` 返回模拟身份组与当前用户；`tenant.select` 切换并应答新当前用户。未组合宿主 tenant 服务时两者都答 `internal`。`tenant-unknown-user` 错误码报告身份组之外的选择。
- `@deepseek-ai/dsh-client-ui-tenant` 把 `tenant-switcher` 条目注册进框架声明的 `shell.overlay` 列表插槽（文档明确的加性帧级浮层座）。其 inject 面只带两个纯动词——`load`（tenant.list）与 `select`（tenant.select）——node 半为空。`select` 成功后调 `ctx.sessions.refresh()`；基线合并会移除对新用户不再可见的行，于是列表免整页刷新即重新投影。
- `ISessions` 增加 `refresh()`（具体类 `SessionRuntime` 已实现），暴露切换所需的全基线重拉。

## Alternatives considered

- **`select` 后 `window.location.reload()`。**否决：既然 `refresh()` + 基线移除合并已能重投影列表，整页刷新只会无谓丢弃内存对象层与重连状态。
- **在 ui-sidebar 里加专用 `sidebar.tenant` 插槽。**否决：那会改骨架插件（设计 D12 禁止）；`shell.overlay` 正是为这类浮动胶囊准备的现成加性帧级座。
- **为列表行加 `SessionProjectionMap.userId` 投影单元。**在 client 边缘再次否决：归属 id 已走 `SessionSummary.userId` wire 列（V0），client 无需折叠单元即可按它分组。
- **现在就做按请求认证身份。**对 V1 否决：POC 保留进程级模拟身份组；`load`/`select` 接口在换 SSO 后免改。

## Consequences

- 切换是纯加性呈现：不改 layout、sidebar、conversation 任何插件，框架保持一次性成型启动。
- 未组合宿主 tenant 服务时胶囊保持空态、两个 RPC 都答 `internal`；组合后切用户会重拉列表，只留下新用户的会话。
- `tenant.*` RPC 走普通一元 carrier（schema 表、请求路由、client 面），因此继承与其他域一致的 rpcId 铸造、zod 解析与超时行为。

## Verification

`api-proxy-tenant.spec.ts` 断言 RPC 往返、select 后重拉列表、以及 `tenant-unknown-user` 拒绝；`ui-tenant` 的组件与 apply 规格断言胶囊命名/选择用户、以及 overlay 条目的注册与销毁。
