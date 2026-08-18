# Agent Note: Read-only pool water-level panel over tenant.poolStats

Status: implemented

English | [中文](2026-08-18-pool-water-level-panel.zh.md)

## Problem

V2 joined the pooled sandbox to the identity chain, but the pool's bind/reclaim state machine had no user-visible surface. The V3 acceptance ("see sandbox bind/reclaim change as the user switches, leaves, and returns") needed a read-only water-level panel backed by the pool's real `PoolStats`.

## Decision

A `tenant.poolStats` RPC feeds a second `shell.overlay` entry in `@deepseek-ai/dsh-client-ui-tenant`, and `PoolRuntime` exposes a `reclaim()` tick so the transition is drivable without real wall-clock.

- `PoolRuntime.reclaim()` delegates to `PoolManager.reclaimTick()`, destroying IDLE sandboxes whose keep-alive expired and refilling the warm pool; the production pool runs it on a timer, the POC exposes it for the panel's transition.
- The API gateway gains `tenant.poolStats` (read-only water level: warm/bound/idle/reclaiming/capacity/reclaimTotal), `tenant.release` (release the current user's binding into the idle countdown), and `tenant.reclaim` (one reclaim tick). All three answer `internal` when `ctx.pool` is absent.
- The client plugin adds a read-only `PoolPanel` as a second additive `shell.overlay` entry: it polls `poolStats` on an interval and renders the water level plus the cumulative reclaim count. No action button — the panel is observational; the existing "bind my sandbox" and the release/reclaim verbs drive the state it displays.

## Alternatives considered

- **A dedicated `pool.*` RPC domain and a separate plugin package for the panel.** Rejected for the POC: the pool actions are tenant-scoped (they act as the current user), and one client plugin already owns the overlay entries, so `tenant.*` plus a second overlay entry in `@deepseek-ai/dsh-client-ui-tenant` keeps the surface in one place.
- **Driving reclaim only from a background timer in the POC.** Rejected: a timer makes the panel's bind → idle → reclaim transition nondeterministic and invisible to a keyless test; an explicit `reclaim()` tick keeps the state machine deterministic and demonstrable.
- **A writable panel with bind/release buttons.** Rejected: the panel is read-only by design (design V3); the actions that change state already live in the switcher entry, so the panel stays a pure observer.

## Consequences

- The pool's state machine is observable from the browser: bind (stamp) moves warm→bound, leave (release) moves bound→idle, and the reclaim tick moves idle→reclaiming→reclaimed, all mirrored in the polled water level.
- The panel is additive and read-only; it composes beside the switcher without editing the frame skeleton (design D12).
- `tenant.*` keeps growing as the single tenant-scoped RPC surface, so the carrier, schema, rpcId minting, and timeout behavior stay uniform.

## Verification

`pool-dsh`'s `pool-waterlevel-v3.spec.ts` drives the full bound → idle → reclaim transition and a warm-hit rebind, asserting `PoolStats` reflects each stage; the `ui-tenant` `PoolPanel` spec asserts the poll verb renders the water level, and the apiproxy tenant spec covers the `tenant.poolStats` round trip.
