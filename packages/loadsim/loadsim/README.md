# dsh-loadsim

English | [中文](README.zh.md)

The **load simulator** for the shared sandbox pool POC: a deterministic discrete-event simulation of many office workers (send a task, sometimes close the page, return later) driving the pool manager and residency registry through the same calls the engine makes, then turning the measurements into the design's M1-M5 acceptance report.

It is a **pure library**: a seeded PRNG makes every run replayable, and all durations are virtual milliseconds so a scenario runs instantly. Cold-start latency is a modeled input (CFS mount + pod ready), not a real cluster measurement.

## API

```ts
import { LoadDriver, generateReport, runPocDemo } from '@deepseek-ai/dsh-loadsim'
```

| Export | Role |
|---|---|
| `LoadDriver` | Runs one `LoadPlan` scenario and returns the `SimResult` measurement record. |
| `generateReport` | Turns a `SimResult` into the M1-M5 `AcceptanceReport` plus a summary. |
| `runPocDemo` | A worked, scaled-down scenario and its report. |
| `BehaviorModel` | Samples task durations, page-close decisions, and return intervals. |
| `MetricsCollector` | Cold-start latencies, warm/cold mix, completion (including after disconnect), exhaustion, concurrency samples. |

## The M1-M5 mapping

- **M1** capacity: peak concurrent bound sandboxes, pool exhaustion, linear extrapolation to the 2500C budget (D5口径).
- **M2** cold start: p95 modeled cold-start latency versus the 10s threshold.
- **M3** close page: every sent task completes (closing the page never kills a task), with the after-disconnect breakdown.
- **M4** density: peak resident sessions on one brain.
- **M5** spec: task-duration calibration across the 0.25C / 0.5C / 1C sandbox sizes.

## POC status

The engine and report are verified by unit tests (determinism, capacity invariant, exhaustion, M3). A real M1/M2 run needs a real cluster and CFS; the simulator provides the measurement apparatus and a calibration harness for it. See the [POC verification report](../../../design-docs/workbuddy-pool-poc-verification.md).
