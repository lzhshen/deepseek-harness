# dsh-loadsim

[English](README.md) | 中文

共享沙箱池 POC 的**压测模拟器**：确定性离散事件模拟，模拟大量办公用户（发任务、有时关页、之后回访）以引擎同款调用驱动池管理器与驻留注册表，再把测量数据转成设计的 M1~M5 验收报告。

它是**纯库**：种子随机使每次运行可复现，所有时长均为虚拟毫秒，场景瞬时跑完。冷启动时延是建模输入（CFS 挂载 + Pod 就绪），非真实集群测量。

## API

```ts
import { LoadDriver, generateReport, runPocDemo } from '@deepseek-ai/dsh-loadsim'
```

| 导出 | 职责 |
|---|---|
| `LoadDriver` | 运行一个 `LoadPlan` 场景，返回 `SimResult` 测量记录。 |
| `generateReport` | 把 `SimResult` 转成 M1~M5 `AcceptanceReport` 与摘要。 |
| `runPocDemo` | 一个可运行的缩放版场景及其报告。 |
| `BehaviorModel` | 采样任务时长、关页决策、回访间隔。 |
| `MetricsCollector` | 冷启动时延、冷热比、完成（含关页后完成）、耗尽、水位样本。 |

## M1~M5 对应

- **M1** 容量：峰值并发绑定沙箱数、池耗尽、线性外推到 2500C（D5 口径）。
- **M2** 冷启动：建模冷启动时延 p95 对比 10s 阈值。
- **M3** 关页：每个已发任务都完成（关页不杀任务），附关页后完成细分。
- **M4** 密度：单大脑峰值驻留会话数。
- **M5** 规格：0.25C / 0.5C / 1C 三档的任务时长标定。

## POC 状态

引擎与报告由单测验证（确定性、容量不变量、耗尽、M3）。真实 M1/M2 需要真实集群与 CFS；模拟器提供测量装置与标定框架。见 [POC 验证报告](../../../design-docs/workbuddy-pool-poc-verification.md)。
