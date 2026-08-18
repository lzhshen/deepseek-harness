/**
 * Web tenant switch plugin, browser half: a floating current-user pill
 * registered as an additive entry of the frame-wide `shell.overlay` list slot,
 * plus the `tenant` dictionaries. The pill reads the simulated roster and
 * current user through `tenant.list` and switches through `tenant.select`,
 * then re-pulls the session list so it shows only the new user's sessions.
 * Export discipline: packages/client/AGENTS.md.
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
// Type-only: pulls the 'shell.overlay' SlotMap declaration (the key's owner)
// into this program so the overlay registration below typechecks against the
// real declaration — no runtime edge to ui-layout.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { TenantSwitcherInjected } from './TenantSwitcher.tsx'
import { TenantSwitcher } from './TenantSwitcher.tsx'
import { en, zh, type TenantKey } from './locales.ts'

export type { TenantSwitcherInjected, TenantSwitcherProps } from './TenantSwitcher.tsx'
export type { TenantKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The tenant switch's copy. */
    tenant: TenantKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'tenant'

/** Required services: the slot registry, the wire client, sessions, and locale. */
export const inject = ['slots', 'connection', 'sessions', 'locale']

/**
 * Client plugin body: register the `tenant` dictionaries and the current-user
 * switch into the shell overlay. The inject face carries only plain data verbs
 * — the switch re-list runs through the runtime's sessions service.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-tenant: dictionaries')

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'tenant-switcher',
    order: 1,
    locale: NS,
    inject: (): TenantSwitcherInjected => {
      const connection = ctx.get('connection') as ConnectionHandle
      const sessions = ctx.sessions
      return {
        load: async () => {
          const response = await connection.api.tenant.list({})
          if (!response.result.ok) throw new Error(response.result.error.message)
          return {
            users: [...response.result.value.users],
            current: response.result.value.current,
          }
        },
        select: async (userId) => {
          const response = await connection.api.tenant.select({ userId })
          if (!response.result.ok) throw new Error(response.result.error.message)
          // The baseline merge drops rows no longer visible to the new user.
          await sessions.refresh()
        },
      }
    },
  }, TenantSwitcher))
}
