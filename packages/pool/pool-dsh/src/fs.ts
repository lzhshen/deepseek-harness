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
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'
import type { PoolRuntime } from './runtime.ts'

export type { Config as LocalConfig } from '@deepseek-ai/dsh-fs-local'

/**
 * Filesystem backend that composes with the pooled-sandbox owner and resolves
 * under the caller's pooled user directory (`config.cwd`). Registers as `ctx.fs`
 * in place of the local backend; the model-facing tools are untouched.
 */
export class PoolFileSystem extends LocalFileSystem {
  static inject = ['pool']

  /** The pool owner this provider composes with (routed storage root). */
  readonly pool: PoolRuntime

  constructor(ctx: Context, config: LocalConfig) {
    super(ctx, config)
    this.pool = ctx.pool
  }
}

export default PoolFileSystem
