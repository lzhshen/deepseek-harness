# @deepseek-ai/dsh-client-ui-tenant

English | [中文](README.zh.md)

Web multi-tenant identity switch plugin. Its browser half registers a floating current-user pill as the `tenant-switcher` entry of the frame-declared `shell.overlay` list slot; its node half is empty (multi-tenant identity is the host `@deepseek-ai/dsh-tenant` service's job). The pill reads the simulated roster and current user through `tenant.list`, switches through `tenant.select`, and then re-pulls the session list so it shows only the new user's sessions.

The switch is additive presentation: it composes into the frame without modifying the layout, sidebar, or conversation plugins, and the roster/current-user facts ride the `tenant.*` wire the host gateway serves. Without the host tenant service composed, both methods answer `internal` and the pill stays on its empty state.

## Model Experience

None, as the current-user switch is browser-side identity presentation and nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

- **Simulated, process-scoped identity** — the switch selects a user on the single host process, not a per-request authenticated identity. Production replaces the roster with an SSO-injected header; the pill's `load`/`select` face is designed to survive that swap unchanged.
- **Re-list, not incremental group** — switching re-pulls the whole session baseline rather than re-grouping rows in place. A grouped-by-user listing is deferred until the list contract carries the owning `userId` column end to end.
