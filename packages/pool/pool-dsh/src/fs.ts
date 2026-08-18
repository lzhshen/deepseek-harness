/**
 * Pooled-sandbox Service Provider for the filesystem seam (`ctx.fs`). It
 * extends {@link LocalFileSystem} verbatim — all text-storage mechanics (stat,
 * read/stream, list, atomic write/edit, containment) are the local
 * implementation's — and adds only the pool wiring: it injects
 * `ctx.pool` and treats the configured `cwd` as the caller's pooled user
 * directory (the POC's CFS stand-in, design D11).
 *
 * This is the integration the pure `@deepseek-ai/dsh-pool` library could not
 * by itself show: that a `ctx.fs` provider composes on the SAME Cordis context
 * as the `ctx.pool` service, so one shared filesystem backend serves every
 * pooled user under a per-session root. The sandbox binding itself is acquired
 * by the engine loop through {@link PoolRuntime.acquire} (async, before tool
 * calls — design 3.3.3); this provider only resolves under the already-bound
 * user's directory. A K8s `PodFactory` swaps the local directory for the real
 * mounted CFS subPath without touching this provider or the model-facing tools
 * (design 3.3).
 *
 * @module @deepseek-ai/dsh-pool-dsh
 */

import { Context } from '@deepseek-ai/cordis'
import { isAbsolute, join, normalize } from 'node:path'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'
import type { FsTarget } from '@deepseek-ai/dsh-fs'
import type { PoolRuntime } from './runtime.ts'

export type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'

/**
 * Filesystem backend that composes with the pooled-sandbox owner and resolves
 * relative paths under the caller's pooled user directory
 * (`storageRoot/<currentUserId>/`). Registers as `ctx.fs` in place of the
 * local backend; the model-facing tools are untouched.
 *
 * When the tenant service ({@link import('@deepseek-ai/dsh-tenant')}) is
 * composed, the base directory follows `ctx.tenant.currentUserId()` — the
 * identity chain (design V2) — so two users resolve to two distinct
 * directories under the shared storage root. Without the tenant service it
 * falls back to the configured `cwd`.
 */
export class PoolFileSystem extends LocalFileSystem {
  static inject = ['pool']

  /** The pool owner this provider composes with (routed storage root). */
  readonly pool: PoolRuntime

  constructor(ctx: Context, config: LocalConfig) {
    super(ctx, config)
    this.pool = ctx.pool
  }

  /**
   * Resolve a relative path under the current user's pooled directory, or
   * pass an absolute caller path through unchanged.
   * @param path - the path to resolve.
   * @param opts - optional explicit cwd and cancellation.
   * @returns the resolved target.
   */
  override async resolve(path: string, opts?: { cwd?: string; signal?: AbortSignal }): Promise<FsTarget> {
    const userId = this.currentUserId()
    if (userId === undefined) {
      // No tenant composed: keep the configured base (the single-user shape
      // the pre-tenant pool-dsh assembly used).
      return super.resolve(path, opts)
    }
    const base = join(normalize(this.pool.storageRoot), userId)
    const requested = opts?.cwd
    if (requested !== undefined && isAbsolute(requested)) {
      return super.resolve(path, opts)
    }
    return super.resolve(path, { ...opts, cwd: base })
  }

  /** The current tenant user, or undefined when no tenant service is composed. */
  private currentUserId(): string | undefined {
    return (this.ctx.get('tenant') as { currentUserId(): string } | undefined)?.currentUserId()
  }
}

export default PoolFileSystem
