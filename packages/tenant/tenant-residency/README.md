# dsh-tenant-residency

English | [中文](README.zh.md)

The **session residency registry** for the multi-tenant engine: which brain replica holds which session in memory, so a cold session can be resumed by any replica and a session never resides on two replicas at once.

It is a **pure library**: a single-process registry with atomic claims (an already-resident session redirects to its owner instead of double-residing), least-recently-active eviction when over capacity, and idle eviction driven by the brain's idle timer. The production backend replaces the in-memory map with a row-level claim on PostgreSQL; the POC keeps it in memory.

## API

```ts
import { ResidencyRegistry, SessionId } from '@deepseek-ai/dsh-tenant-residency'
```

| Export | Role |
|---|---|
| `ResidencyRegistry` | `claim` (acquire-or-redirect), `release`, `touch`, `find`, `evictIdle`, `evictLru`, `list`, `stats`. |
| `SessionId` | Branded session identity the claim keys on. |
| `ClaimOutcome` | The claim result: `acquired` + `resident`, or `redirectedTo` when another engine owns it, plus `evicted` residents from LRU pressure. |

## Core invariant

One session is resident on at most one engine (a concurrent claim returns the owner instead of inserting a duplicate). Engine identity is borrowed from `@deepseek-ai/dsh-pool`, so one brain-replica value spans the residency registry and the orphan sweep.

## POC status

Claim/redirect/LRU/idle eviction are verified by unit tests; the load simulator drives this registry to produce the M4 density metric. See the [POC verification report](../../../design-docs/workbuddy-pool-poc-verification.md).
