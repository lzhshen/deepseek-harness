# @deepseek-ai/dsh-pool-dsh

English | [中文](README.zh.md)

The pooled sandbox, hosted on DSH. It wraps the pure [`@deepseek-ai/dsh-pool`](../pool/README.md) `PoolManager` in a Cordis service (`ctx.pool`) and provides filesystem and subprocess seam providers (`ctx.fs` / `ctx.subprocess`) that route each caller into its own pooled user directory. This package is the DSH assembly the pure library deliberately omitted — it proves the pool and its seam providers actually compose on a Cordis context.

## Configuration

The pool owner is a service plugin (`ctx.pool`); the two seam providers compose with it programmatically (or in production as sibling packages, mirroring the `dsh-e2b` / `dsh-fs-e2b` / `dsh-subprocess-e2b` triad). The service config:

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

`pool` hosts the `PoolManager` over the POC's in-memory ledger and fake Pod substrate; `poolCapacity`/`targetWarmCount`/`idleTimeoutMs` are the manager's tunables. `storageRoot` is the local stand-in for the CFS — each user's files live under `storageRoot/<userId>/` so users stay isolated (design D11). `engineId` names this brain replica for the orphan sweep; it defaults to a random id.

`PoolFileSystem` and `PoolSubprocess` register as `ctx.fs`/`ctx.subprocess` **in place of** the local backends (loading both would collide). When the tenant service (`@deepseek-ai/dsh-tenant`) is composed, their base directory follows `ctx.tenant.currentUserId()` — relative paths and child working directories resolve under `storageRoot/<currentUserId>/`, so two users land in two distinct directories (design V2). Without the tenant service they keep the configured `cwd`. The sandbox binding itself is acquired by the engine loop through `ctx.pool.acquire()` (async, before tool calls — design 3.3.3).

`PoolTenantProbe` (`ctx.poolTenantProbe`) is a host-side service that drives the whole identity chain in one call for a browser echo: current user → `pool.acquire` → write a stamp file under the user's directory → read it back.

## Model Experience

None, as this package registers no model-visible context; the filesystem and bash tools own any rendered effects.

#### KV Cache effect

No direct invalidation; this package does not contribute request tokens.

## Known Limitations and Deferred Work

- **The Pod substrate is fake** — `FakePodFactory` records lifecycle calls and injects latency; a K8s `PodFactory` (prewarmed Deployment + CFS subPath mount + in-sandbox agent) replaces it.
- **The ledger is in-memory** — a PostgreSQL `PoolLedger` (`UPDATE … WHERE state='WARM'` row-level atomic claim) replaces `MemoryLedger` for cross-replica correctness.
- **`spawnTerminal` is unimplemented** — the POC throws; terminal allocation is outside the pooled-execution life cycle it verifies.
- **Per-user isolation is by directory routing, not a kernel boundary** — the `storageRoot/<userId>` split mirrors the CFS layout; kernel-grade isolation of untrusted code stays the shell sandbox's job.
