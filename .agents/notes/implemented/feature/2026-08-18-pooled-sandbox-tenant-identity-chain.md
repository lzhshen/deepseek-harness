# Agent Note: Pooled sandbox joined to the tenant identity chain

Status: implemented

English | [中文](2026-08-18-pooled-sandbox-tenant-identity-chain.zh.md)

## Problem

V0 stamped sessions and isolated listings by user, and V1 let the browser switch the current user, but the pooled sandbox (`ctx.fs` / `ctx.subprocess` / `ctx.pool`) still routed by a fixed configuration directory rather than the acting user. The V2 acceptance ("switch user, send work, see that user's sandbox/file is theirs") needed the filesystem and subprocess seams to follow the tenant identity.

## Decision

`PoolFileSystem` and `PoolSubprocess` become tenant-aware, and a new `PoolTenantProbe` service plus a `tenant.stamp` RPC prove the chain end to end.

- When the tenant service is composed, `PoolFileSystem.resolve` and `PoolSubprocess.spawn` route relative paths and child working directories under `storageRoot/<currentUserId>/`, reading the user from `ctx.get('tenant').currentUserId()`. Absolute caller paths pass through unchanged; without the tenant service both providers keep the configured `cwd` (the pre-tenant single-user shape).
- `PoolTenantProbe` (`ctx.poolTenantProbe`) drives the whole chain in one call: current user → `pool.acquire(userId)` → write a stamp file under `storageRoot/<userId>/` → read it back. It writes direct on the storage root (not via `ctx.fs`), so it stays composable alongside a sandbox-fenced `ctx.fs`.
- The API gateway gains `tenant.stamp`, delegating to `poolTenantProbe`; the client `@deepseek-ai/dsh-client-ui-tenant` switch gains a "bind my sandbox" action that echoes the user's sandbox id, warm/cold flag, file path, and read-back content.

## Alternatives considered

- **Routing the staged directory through the agent-preset realm instead of the tenant service.** Rejected: the pool is a host-plane singleton (one sandbox per binding key), and the current user is a process fact, so the tenant service is the single authority both the listing and the pool read.
- **Making the probe write through `ctx.fs`.** Rejected: `ctx.fs` in the web profile is `dsh-fs-sandbox`, not the pooled provider, so the probe would not exercise the pool path; writing direct on `storageRoot/<userId>/` keeps the probe correct regardless of which `ctx.fs` is composed.
- **A separate `pool.*` RPC domain.** Rejected for the POC: the action is tenant-scoped (it acts as the current user), so `tenant.stamp` rides the existing tenant domain and shares its carrier.

## Consequences

- The identity chain is now one attended path from the browser: switch user → `pool.acquire` → write/read under `storageRoot/<userId>/` → echo, with the filesystem and subprocess seams routing by the same user.
- Providers stay backward-compatible: a composition without the tenant service keeps the fixed-directory behavior, so the earlier single-user pool-dsh assembly still works.
- The probe writes real files and binds real (fake-Pod) sandboxes; per-user isolation remains directory routing, not a kernel boundary (design D11 and the existing limitation).

## Verification

`pool-dsh`'s `pool-tenant-v2.spec.ts` composes the tenant service, the pool, and the two tenant-aware providers and asserts that switching users redirects filesystem and subprocess work into the new user's directory, and that the probe echoes distinct sandboxes per user; the apiproxy tenant spec asserts the `tenant.stamp` round trip and the absent-probe failure.
