/**
 * Pooled-sandbox tenant probe: a host-side service that exercises the full
 * identity chain the pool verifies — current tenant user → `pool.acquire`
 * sandbox bind → write a file under that user's directory → read it back — so
 * a browser can trigger the action and see the user's sandbox/file is their
 * own (design V2). The file write is direct on `storageRoot/<userId>/` (the
 * POC's CFS stand-in): it does not require `ctx.fs` to be the pooled provider,
 * which keeps the probe composable alongside a sandbox-fenced `ctx.fs`.
 *
 * @module @deepseek-ai/dsh-pool-dsh
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, normalize } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import type { PoolBinding, PoolRuntime } from './runtime.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    poolTenantProbe: PoolTenantProbe
  }
}

/** One stamp action's user-visible result (the browser echo). */
export interface PoolTenantStamp {
  /** The user whose sandbox and directory were used. */
  readonly userId: string
  /** The sandbox id the pool bound. */
  readonly sandboxId: PoolBinding['sandboxId']
  /** Whether the acquire hit a warm (idle) sandbox rather than a cold claim. */
  readonly warm: boolean
  /** The stamp file's path under the user's directory, for display. */
  readonly file: string
  /** The file content read back, proving the write went to the user's directory. */
  readonly content: string
}

/**
 * The identity-chain probe. Reads the current user from the optional tenant
 * service, acquires that user's sandbox through {@link PoolRuntime.acquire},
 * and writes/reads a stamp file under the user's pooled directory.
 */
export class PoolTenantProbe extends Service {
  static inject = ['pool']

  private readonly pool: PoolRuntime

  constructor(ctx: Context) {
    super(ctx, 'poolTenantProbe')
    this.pool = ctx.pool
  }

  /** The current tenant user, or 'anonymous' when no tenant service is composed. */
  private currentUser(): string {
    const tenant = this.ctx.get('tenant') as { currentUserId(): string } | undefined
    return tenant?.currentUserId() ?? 'anonymous'
  }

  /**
   * Bind the current user's sandbox, write a stamp file under their directory,
   * and read it back.
   * @returns the user, sandbox id, warm flag, file path, and read-back content.
   */
  async stamp(): Promise<PoolTenantStamp> {
    const userId = this.currentUser()
    const binding = await this.pool.acquire(userId)
    const dir = join(normalize(this.pool.storageRoot), userId)
    await mkdir(dir, { recursive: true })
    const content = `tenant-probe user=${userId} sandbox=${binding.sandboxId}`
    const file = join(dir, 'tenant-stamp.txt')
    await writeFile(file, content, 'utf8')
    const readBack = await readFile(file, 'utf8')
    return { userId, sandboxId: binding.sandboxId, warm: binding.warm, file, content: readBack }
  }
}

export default PoolTenantProbe
