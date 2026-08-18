# dsh-tenant

English | [中文](README.zh.md)

The **host-side multi-tenant identity plugin** for the shared-pool POC. It owns the "current user" context (a simulated roster the browser switches between, design D7) and the attribution helpers the API boundary uses to stamp sessions with an owning `userId` and to isolate session listings by user.

On its own it is pure attribution: it stamps each new session's header with the current user's id, and `session.list` returns only that user's sessions. Isolation is enforced at the listing boundary, not by the presence of the header field — the field is metadata, not proof of authority.

## API

```ts
import TenantService from '@deepseek-ai/dsh-tenant'
```

| Export | Role |
|---|---|
| `TenantService` | Cordis service (`ctx.tenant`): `listUsers`, `currentUserId`, `selectUser`, `userIdOf`, `belongsTo`. |
| `UserId` | Branded owning-user identity (from `dsh-tenant/types`). |

The session header carries `userId` via `@deepseek-ai/dsh-session`'s `CreateSessionOptions.meta`; the API gateway (`@deepseek-ai/dsh-host-apiproxy`) reads `ctx.get('tenant')` to stamp and filter. Without the tenant service composed, the gateway stays single-user.

## Known Limitations and Deferred Work

- **Simulated identity, not SSO**: the current user is a process-scoped roster declared in configuration. Production replaces the roster resolution with the SSO-injected request header; the downstream `currentUserId()` / `listForUser()` face is designed to survive that swap unchanged.
- **Process-scoped current user**: the POC current user is one process fact, not per-request state, so a single gateway process serves one user at a time (the browser switches by calling the tenant-boundary switch). A production multi-tenant gateway makes the identity per-request.
