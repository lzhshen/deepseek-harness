# Agent Note: Client current-user switch via tenant RPC and the shell overlay

Status: implemented

English | [中文](2026-08-18-client-tenant-switch-shell-overlay.zh.md)

## Problem

V0 stamped sessions with an owning `userId` and isolated `session.list` by the current user, but the page could not switch users, so the multi-user acceptance criterion ("two users see only their own sessions") had no user-visible control. The switch needs a host RPC the browser can call, and a UI surface that does not modify the frame skeleton (design D12: skeleton plugins stay untouched).

## Decision

`tenant.list` / `tenant.select` are two new apiproxy unary methods, and `@deepseek-ai/dsh-client-ui-tenant` renders the switch as an additive `shell.overlay` entry.

- The host gateway (`dsh-host-apiproxy`) gains a `tenant` domain: `tenant.list` returns the simulated roster and current user; `tenant.select` switches and answers the new current. Both answer `internal` when the host tenant service is not composed. A `tenant-unknown-user` error code reports a selection outside the roster.
- `@deepseek-ai/dsh-client-ui-tenant` registers the `tenant-switcher` entry into the frame-declared `shell.overlay` list slot (the documented additive seat for a frame-wide surface). Its inject face carries two plain verbs — `load` (tenant.list) and `select` (tenant.select) — and the node half is empty. After a successful select, `select` calls `ctx.sessions.refresh()`; the baseline merge removes rows no longer visible to the new user, so the list re-projects without a page reload.
- `ISessions` gains `refresh()` (the concrete `SessionRuntime` already implemented it), exposing the full-baseline re-pull the switch needs.

## Alternatives considered

- **`window.location.reload()` after select.** Rejected: a full reload discards the in-memory object layer and reconnect state for no benefit once `refresh()` + the baseline-remove merge already re-project the list.
- **A dedicated `sidebar.tenant` slot in ui-sidebar.** Rejected: that edits a skeleton plugin (design D12 forbids it); `shell.overlay` is the existing additive, frame-wide seat for exactly this kind of floating pill.
- **A `SessionProjectionMap.userId` projection unit for the list row.** Rejected again at the client edge: the owning id already rides the `SessionSummary.userId` wire column (V0), so the client can group on it without a fold unit.
- **Per-request authenticated identity now.** Rejected for V1: the POC keeps the process-scoped simulated roster; the `load`/`select` face survives the SSO swap without change.

## Consequences

- The switch is pure additive presentation: no layout, sidebar, or conversation plugin changed, and the frame keeps its one-flip boot.
- Without the host tenant service the pill stays empty and both RPCs answer `internal`; with it, switching users re-pulls the list so only the new user's sessions remain.
- The `tenant.*` RPCs ride the ordinary unary carrier (schema map, request routes, client face), so they inherit the same rpcId minting, zod parsing, and timeout behavior as every other domain.

## Verification

`api-proxy-tenant.spec.ts` asserts the RPC round-trip, re-list after select, and the `tenant-unknown-user` rejection; `ui-tenant`'s component and apply specs assert the pill names/selects the user and registers/disposes the overlay entry.
