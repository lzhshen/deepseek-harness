# Agent Note: Tenant user attribution via SessionHeader userId

Status: implemented

English | [中文](2026-08-18-tenant-user-attribution-session-header.zh.md)

## Problem

The shared-pool POC needs sessions to carry an owning user and `session.list` to isolate by user (design V0). The session store had no ownership field, the API gateway's `session.list` returned every session, and the Web surface had no current-user concept. The `identity` package only mints an anonymous per-home uuid, which is not multi-user attribution.

## Decision

`userId` is **storage metadata on `SessionHeader`**, not a session event. The tenant plugin (`@deepseek-ai/dsh-tenant`) owns the current-user context and attribution helpers; the API gateway stamps and filters.

- `SessionHeader` gains an optional `userId?: string`, folded through `CreateSessionOptions.meta`, `validateSessionHeader`, and `SessionStore.prepare`. `SessionStore.fork` inherits it, `CreateAgentOptions.meta` mirrors it.
- `@deepseek-ai/dsh-tenant` is a host-side Cordis `Service` (`ctx.tenant`) with `listUsers` / `currentUserId` / `selectUser` / `userIdOf` / `belongsTo`. The POC current user is a process-scoped simulated roster (design D7); the `UserId` brand lives on the `@deepseek-ai/dsh-tenant/types` subpath.
- `@deepseek-ai/dsh-host-apiproxy` reads `ctx.get('tenant')` (optional): `session.create` stamps the current user into the agent's `meta`, and `listVisibleSessionSummaries` filters attached and cold rows to `header.userId === currentUserId()`. `SessionSummary`/`sessionSummarySchema`/`sessionListFields` gain the optional `userId` wire column.
- Without the tenant service composed, the gateway stays single-user (no stamp, no filter) — tenancy is an opt-in composition.

## Alternatives considered

- **A `session/identity` event instead of a header field.** Rejected: ownership is creation-time attribution, not replayable conversation content; a header field is symmetric with `cwd`/`agentPreset`, needs no surface/log plumbing, and stays out of the model-visible log. Fork inheritance is explicit on the header instead of free with a seed event.
- **Reading an `X-User-Id` HTTP header now.** Rejected for V0: no identity pipeline exists at the transport layer, so wiring a real header touches the connection/SSE/gateway stack. The process-scoped roster keeps the same downstream face (`currentUserId()`/`userIdOf`) so the SSO header swaps in later without changing attribution call sites.
- **A `SessionProjectionMap.userId` projection unit.** Rejected: a projection unit folds events, but `userId` lives on the header, which projection units never see. The value rides the `SessionSummary.userId` wire column directly.
- **Bumping `SESSION_FORMAT_VERSION`.** Rejected: the field is optional and additive; an older runtime that does not recognize it ignores it without mis-reading the log, so the version stays `0`.

## Consequences

- Session listings are user-isolated only when the tenant service is composed; unowned sessions (no `userId`) are hidden from every tenant-isolated listing.
- The POC simulates identity per process; a production multi-tenant gateway must make identity per-request and swap the roster for the SSO header.
- `session/end-seed`-style cold sessions persist and reload `userId` through the header, so cold-listing isolation is uniform with attached-listing isolation (both filter on `header.userId`/`meta.userId`).
- Session format stays forward-additive: existing unowned sessions simply lack the field.

## Verification

`api-proxy-tenant.spec.ts` boots the tenant service plus two sessions and asserts `session.list` returns exactly the current user's session and switches with `selectUser`; `fork.spec.ts` asserts stamping and fork inheritance; `tenant.spec.ts` covers roster/default/switch/attribution.
