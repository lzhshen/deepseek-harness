# dsh-pool

English | [中文](README.zh.md)

The **shared sandbox pool manager** for the multi-tenant office platform POC: the single owner of the sandbox ledger (which binding key holds which sandbox), the WARM→BOUND→IDLE→RECLAIMING state machine, and the three background jobs (idle reclaim, warm-pool refill, orphan sweep).

It is a **pure library**, not a Cordis service: no `ctx`, holds no global state. The engine-side pool-client plugin wraps `PoolManager`, and the standalone pool service composes it with a persistent ledger and a K8s `PodFactory`. The POC runs the in-memory ledger and the fake Pod substrate so the whole lifecycle is testable without a cluster.

## API

```ts
import { PoolManager, MemoryLedger, FakePodFactory, BindingKey, EngineId } from '@deepseek-ai/dsh-pool'
```

| Export | Role |
|---|---|
| `PoolManager` | The acquire/release/reportIdle/heartbeat API plus `refillTick`/`reclaimTick`/`orphanTick` schedulers. |
| `MemoryLedger` | In-memory `PoolLedger` enforcing one-binding-key-one-sandbox and guarded transitions. |
| `FakePodFactory` | In-process `PodFactory` with deterministic ids and a recorded event log. |
| `Sandbox` | The immutable sandbox entity and its guarded state transitions. |
| `PoolExhaustedError` | Thrown by `acquire` when no warm sandbox is available; maps to the `50301` response. |
| `BindingKey` / `EngineId` / `SandboxId` | Branded cross-boundary ids (`BindingKey` = the user id in the POC, configurable by design D10). |

## Core invariants

- One binding key maps to at most one BOUND/IDLE sandbox (the ledger throws on violation).
- WARM + BOUND + IDLE never exceeds `poolCapacity` (`refillTick` enforces it).
- Reclaim means destroy-then-recreate; a dirty Pod is never rebound (design default).

## POC status

The state machine and schedulers are verified by unit tests. The production path swaps `MemoryLedger` for a PostgreSQL ledger (row-level atomic claims) and `FakePodFactory` for a K8s Pod factory that mounts the user's CFS subPath — both keep the same contracts. See the [POC verification report](../../../design-docs/workbuddy-pool-poc-verification.md).
