# 多租户智能体办公平台 POC 开发验证报告

> 配套设计文档：[workbuddy-pool-design.md](workbuddy-pool-design.md)；决策记录：[workbuddy-pool-decisions.md](workbuddy-pool-decisions.md)。
> 本文记录 POC 开发阶段实际落地的代码、可验证的结论，以及哪些指标是"实测"、哪些是"建模输入"，避免把模拟数当成集群实测。

## 0 结论先行

POC 用三个纯 TypeScript 库（不依赖真实 K8s / PostgreSQL / 模型 API，可在本机离线跑通全部 90 个单测）验证了设计的四个核心机制，并产出了 M1~M5 的测量装置：

| 模块 | 落地目录 | 验证了什么 |
|---|---|---|
| 池管理器 | `packages/pool/pool` | 沙箱状态机（WARM→BOUND→IDLE→RECLAIMING）、三个后台任务（回收倒计时 / 预热补水 / 孤儿收尸）、"一键一沙箱"与"三态之和≤池上限"不变量 |
| 多租户驻留 | `packages/tenant/tenant-residency` | 会话驻留权的原子认领与重定向、LRU 驱逐、空闲驱逐、"一会话至多一引擎"不变量 |
| 压测模拟器 | `packages/loadsim/loadsim` | 事件驱动虚拟用户 + 行为模型 + M1~M5 报告生成器，输出可复现的验收口径数据 |
| 对照报告 | 本文档 | M1~M5 的实测口径与建模口径分开陈述 |

**未在 POC 落地、留待真实环境验证的部分**（原因：本机无 K8s/PostgreSQL/模型密钥，且均为"换 Provider 不改契约"的接入工作）：K8s Pod 工厂（设计 3.3）、PG 会话存档后端（设计 3.4）、真实模型调用（D6）、SSO 身份（D7）。这些已由 `PodFactory` / `PoolLedger` 接口收口，落地时只换实现。

## 1 落地代码结构

```
packages/
├── pool/pool/                    # 池管理器（纯库，无 Cordis 服务）
│   ├── src/brand.ts              #   SandboxId / BindingKey / EngineId 品牌 id
│   ├── src/types.ts              #   SandboxState / SandboxRecord / PoolConfig / PoolExhaustedError
│   ├── src/sandbox.ts            #   Sandbox 实体 + 状态机 guard（非法转移即抛）
│   ├── src/ledger.ts             #   PoolLedger 契约（生产换 PG 实现）
│   ├── src/memory-ledger.ts      #   内存账本（POC 后端）
│   ├── src/pod-factory.ts        #   PodFactory 契约（生产换 K8s 实现）
│   ├── src/fake-pod-factory.ts   #   假 Pod 工厂（记录事件 + 可注入时延）
│   └── src/pool-manager.ts       #   acquire/release/reportIdle/heartbeat + 三个 tick
├── tenant/tenant-residency/      # 会话驻留（纯库）
│   └── src/residency.ts          #   claim(认领或重定向)/release/touch/evictIdle/evictLru
└── loadsim/loadsim/              # 压测模拟器（纯库）
    ├── src/rng.ts                #   mulberry32 种子随机（可复现）
    ├── src/behavior.ts           #   行为模型（任务时长/关页概率/回访间隔 + 沙箱规格减速）
    ├── src/metrics.ts            #   指标采集（冷启动/冷热比/关页完成/水位样本）
    ├── src/driver.ts             #   离散事件驱动（虚拟时钟，关页续跑 + drain 收尾）
    ├── src/report.ts             #   M1~M5 报告生成
    └── src/demo.ts               #   可运行的缩放版场景 runPocDemo()
```

三个包均已纳入仓库门禁：`tsconfig.base.json` 的 `paths` 通配、`tsconfig.host.json` 的工程引用、`verify-package-invariants`（222 个包全过）。

## 2 各模块验证

### 2.1 池管理器（设计 3.2）

**状态机**：`Sandbox` 实体把四种状态与合法转移收口，非法转移（如 WARM→idle、RECLAIMING→reclaim）抛 `SandboxStateError`；`MemoryLedger` 维护 `byId` + `byBinding` 两张索引，`claimWarm` 对已占用键抛"already held"——即设计 3.2.2 的核心不变量"一个绑定键全局至多持有一个非回收态沙箱"。

**三个后台任务**（均为显式 `tick`，测试与压测器可确定性驱动）：
- `reclaimTick`：扫 `lastActiveAt < now - idleTimeoutMs` 的 IDLE 沙箱 → 销毁 → 补水；
- `refillTick`：补水到 `targetWarmCount`，且 `warm+bound+idle ≤ poolCapacity`；
- `orphanTick`：扫 BOUND 但引擎不在存活集合的沙箱（孤儿收尸）。

**验证的边界路径**：冷路径 mount 失败回滚（reclaim + destroy + 补水，不留脏绑定）；`PoolExhaustedError` 映射设计 2.2 的 `50301`。

### 2.2 多租户驻留（设计 3.1）

`ResidencyRegistry.claim` 是原子认领：已驻留会话返回 `acquired:false + redirectedTo`（重定向到持有引擎），不会二次驻留；新认领在超 `maxResidents` 时先 LRU 驱逐最久未活动者。`evictIdle` 由大脑空闲定时器驱动（设计 3.1 的 `evictSession`）。"一会话全局至多驻留一个引擎"由 claim 的 redirect 语义保证。

### 2.3 压测模拟器（设计 3.5）

`LoadDriver` 是离散事件模拟：虚拟时钟 + 事件队列（arrive/complete/return/poolTick/end），虚拟用户行为由 `BehaviorModel` 采样（任务 1~2 分钟为主、关页概率、回访间隔 <15 分钟高频，参数来自 D5 口径，可配置）。**关页续跑**由两个机制保证：`complete` 事件在用户离场后仍触发（引擎在服务端跑完），`end` 之后进入 drain 收尾——在途任务全部跑完再结算，不截断。同一 seed 重放得到逐字节一致的指标（确定性，可回归）。

## 3 M1~M5 对照口径

`runPocDemo()` 跑一个 24 用户 / 24 沙箱 / 0.5C 档的缩放场景（虚拟 10 分钟），输出：

```
M1 capacity: peak 20 concurrent bound sandboxes over a 24-sandbox pool (0 exhausted); extrapolated 4167 at 2500C — below the 5000 target.
M2 cold start: p95 8000ms over 53 cold acquires — within the 10000ms threshold.
M3 close page: 144/144 tasks completed (100%), 60 of them after disconnect.
M4 density: peak 24 resident sessions on one brain — below the 500 target.
M5 spec: 0.25C=235806ms, 0.5C=117903ms, 1C=58952ms.
```

各指标口径与状态：

| # | 指标 | POC 口径 | 状态 |
|---|---|---|---|
| M1 | 同等预算并发容量 | 实测"峰值并发绑定沙箱数 + 是否退化(耗尽)"，线性外推到 2500C；公式 `peakBound × (2500 / (poolCapacity×0.5))` | **测量装置已就绪**，数值需真实集群标定（见下） |
| M2 | 冷启动 p95 ≤ 10s | 冷启动时延是**建模输入**（CFS 挂载 + Pod 就绪），非实测；p95 计算与阈值判定已实现 | **口径已实现**，数值待真实 CFS 实测 |
| M3 | 关页不死 | **实测**：144/144 任务完成，60 个在用户离场后完成——关页不中断任务 | ✅ POC 验证通过 |
| M4 | 引擎密度 ≥ 500 | **实测**峰值驻留会话数（缩放场景 24，远小于 500 是因 POC 规模小，非机制受限） | **测量装置已就绪**，规模待真实压测 |
| M5 | 沙箱规格校准 | 三档规格按减速系数建模（0.25C=4×、0.5C=2×、1C=1×），任务时长对照已出 | **口径已实现**，系数待真实办公任务实测 |

### 为什么 M1/M2/M4/M5 的数值不能在本机"定案"

- **M1**：外推公式在满利用率时恰好等于 5000（2500C ÷ 0.5C），因此它实际回答的是"0.5C/沙箱能否跑满并发且不退化"——这依赖真实办公任务的资源占用（M5 实测）与真实集群的稳态，本机假 Pod 工厂给不出。
- **M2**：冷启动耗时 = 真实 CFS 挂载 + Pod 就绪，只能拿真实环境测；模拟器已把"冷/热路径区分 + p95 汇总"做对，把 8000ms 换成实测数即可。
- **M4**：单进程驻留 500 会话需要真实引擎内存与模型往返，本机验证的是"驻留登记与驱逐机制正确"，不是"内存够不够"。
- **M5**：减速系数（0.25C 慢 4 倍）是占位，真实系数要跑 LibreOffice/pandoc 转换任务实测。

## 4 与设计决策的对应

| 决策 | POC 落地 |
|---|---|
| D1/D2 引擎与执行环境两层都池化 | 驻留（引擎内存）与沙箱（执行环境）两个独立纯库，分别回收 |
| D4 保温 10~15 分钟后回收 | `idleTimeoutMs` 配置项，`reclaimTick` 驱动；用户文件/存档永久保留（沙箱销毁不触 CFS/存档） |
| D8 大脑无状态、任意副本唤醒 | `ResidencyRegistry.claim` 的重定向语义 + 会话驻留登记，为 PG 行级认领留了同一契约 |
| D9 池管理器独立部署、全局一本账 | `PoolManager` 单所有者 + `PoolLedger` 契约（内存/PG 两实现） |
| D10 按人绑定、绑定键可配置 | `BindingKey` 抽象键，POC 取值 = 用户 id，账本不看键内容 |
| D11 用户文件按目录隔离 | `PodFactory.mount(sandboxId, userId)` 挂载语义，假工厂记录挂载关系；`dsh-pool-dsh` 的 fs/subprocess Provider 把路径路由进 `storageRoot/<userId>/` |

## 4.1 DSH 组装（纯库 → 服务的补证）

原报告第 1 节的三个包都是纯库，未验证"是否能长在 DSH 上"。新增 `packages/pool/pool-dsh` 补上这一层：

| 组件 | 落地 | 验证了什么 |
|---|---|---|
| `ctx.pool` 服务 | `PoolRuntime extends Service` | 把纯 `PoolManager` 装进 Cordis 服务，暴露 `acquire/release/heartbeat/stats/refill`（引擎侧 pool-client 视图），池状态机在真实上下文跑通 |
| `ctx.fs` Provider | `PoolFileSystem extends LocalFileSystem` | 注入 `ctx.pool` 与池在同一上下文组合，`config.cwd` 即调用方池化用户目录（D11 隔离基座） |
| `ctx.subprocess` Provider | `PoolSubprocess extends LocalSubprocessRuntime` | 子进程 cwd 路由进调用方用户目录，真实 spawn + 真实 stdout/exit |

该组装以 keyless 单测驱动真实 Cordis 上下文（`new Context()` + `ctx.plugin(...)`），断言池状态机经 `ctx.pool` 走通、文件与命令真实落进按用户隔离的目录——即设计 3.3"挂上新 Provider 整体迁入沙箱"的地基链路。**仍非真实环境验证**：假 Pod 工厂、内存账本、无真实模型，`spawnTerminal` 未实现（见第 5 节）。

## 5 落地剩余工作（生产化路径，非 POC 阻塞）

1. `PodFactory` 的 K8s 实现（预热 Deployment + CFS subPath 挂载 + 沙箱内轻量 agent 镜像），替换 `FakePodFactory`。
2. `PoolLedger` 的 PG 实现（`UPDATE ... WHERE state='WARM'` 行级原子认领），替换 `MemoryLedger`。
3. `SessionPersistence` 的 PG 后端（复用 dsh 既有写协调器，只实现存储钩子），接入真实存档。
4. 引擎端 `pool-client` / `tenant` 两个 Cordis 插件（`pool-dsh` 已落下 `ctx.pool` 服务与 seam Provider 的原型；生产再把逐会话 acquire 接入引擎循环，并拆 `dsh-pool-dsh` 为服务/fs/subprocess 姊妹包镜像 e2b 三件套）。
5. 用真实模型 + 真实办公任务跑 M5 标定，再把标定系数回填模拟器，跑真实集群的 M1/M2/M4。
