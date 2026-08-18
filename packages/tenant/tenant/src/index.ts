/**
 * dsh-tenant: the host-side multi-tenant identity plugin. It owns the
 * "current user" context (the simulated identity the POC swaps between, design
 * D7) and the attribution helpers the API boundary uses to stamp sessions and
 * isolate listings. The pure `@deepseek-ai/dsh-tenant-residency` library owns
 * which brain holds which session; this package owns who a session belongs to.
 *
 * The current-user context is process-scoped for the POC: `dsh web` boots with
 * a declared user roster, and a request acts as one of them. Production swaps
 * the roster resolution for the SSO-injected identity header without changing
 * the `currentUserId()` / `listForUser()` face.
 *
 * @module @deepseek-ai/dsh-tenant
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { Session } from '@deepseek-ai/dsh-session'

export type { UserId } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    tenant: TenantService
  }
}

/** Configuration for the simulated multi-user identity context. */
export interface Config {
  /**
   * The simulated user roster. In the POC the page switches between these
   * users (design D7); production replaces this with the SSO-injected header.
   * Must be non-empty.
   */
  readonly users: string[]
  /** The user that owns requests until the next explicit switch. Defaults to the roster's first. */
  readonly defaultUserId?: string
}

interface SchemaResolvedConfig extends Config {
  users: string[]
  defaultUserId?: string
}

/**
 * Host-side tenant identity service (`ctx.tenant`). Holds the mutable
 * current-user selection and the attribution helpers the session-creation and
 * listing boundaries call. Setter and readers are all synchronous: the POC
 * current-user is a process fact, not per-request state.
 */
export class TenantService extends Service {
  static Config: z<Config> = z.object({
    users: z.array(z.string()).min(1).required(),
    defaultUserId: z.string(),
  })

  private current: string
  private readonly users: readonly string[]

  /**
   * @param ctx - Cordis context; registers `ctx.tenant`.
   * @param config - the simulated user roster and default current user.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'tenant')
    const resolved = config as SchemaResolvedConfig
    const users = resolved.users
    const def = resolved.defaultUserId ?? users[0]
    if (def === undefined) {
      throw new Error('dsh-tenant: users roster must be non-empty')
    }
    if (!users.includes(def)) {
      throw new Error(`dsh-tenant: defaultUserId "${def}" is not in the users roster`)
    }
    this.users = users
    this.current = def
  }

  /** The simulated users available to switch between. */
  listUsers(): readonly string[] {
    return this.users
  }

  /** The user that owns requests until the next explicit switch. */
  currentUserId(): string {
    return this.current
  }

  /**
   * Switch the current user.
   * @param userId - a member of the declared roster.
   * @throws when the user is not in the roster.
   */
  selectUser(userId: string): void {
    if (!this.users.includes(userId)) {
      throw new Error(`dsh-tenant: unknown user "${userId}"`)
    }
    this.current = userId
  }

  /** Read the owning user stamped on a session, or null when unowned. */
  userIdOf(session: Session): string | null {
    return session.header.userId ?? null
  }

  /** Whether a session belongs to the given user. */
  belongsTo(session: Session, userId: string): boolean {
    return session.header.userId === userId
  }
}

export default TenantService
