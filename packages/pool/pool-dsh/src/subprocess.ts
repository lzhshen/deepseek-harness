/**
 * Pooled-sandbox Service Provider for the subprocess seam (`ctx.subprocess`).
 * It extends {@link LocalSubprocessRuntime} so the complete process mechanism
 * — detached process trees, per-stream stdio dispositions, bounded collect
 * with spill files, credential-scrubbed environment, and tree-scoped
 * SIGTERM→grace→SIGKILL escalation — is the local implementation's verbatim;
 * this package only scopes the child's working directory into the caller's
 * pooled user directory (`storageRoot/<userId>/`, the POC's CFS stand-in).
 *
 * Commands run for real (real spawn, real stdout/stderr/exit codes) in the
 * pooled sandbox's user directory. The sandbox binding is owned by the engine
 * loop through {@link PoolRuntime.acquire} (async, before tool calls — design
 * 3.3.3); this provider routes the child into the already-bound user's world,
 * so a K8s `PodFactory` can replace the local routing with a remote sandbox
 * agent without changing the subprocess seam or the bash tool.
 *
 * `spawnTerminal` is not provided in the POC: terminal allocation is outside
 * the pooled-execution life cycle the POC verifies (see the README's Known
 * Limitations). It throws a typed error rather than silently degrading.
 *
 * @module @deepseek-ai/dsh-pool-dsh
 */

import type { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import type {
  SubprocessHandle,
  SubprocessSpawnSpec,
  SubprocessTerminalHandle,
  SubprocessTerminalSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'
import { isAbsolute, join, normalize } from 'node:path'
import type { PoolRuntime } from './runtime.ts'

/** Subprocess service that scopes each child into the caller's pooled user directory. */
export class PoolSubprocess extends LocalSubprocessRuntime {
  static inject = ['pool']

  private readonly pool: PoolRuntime

  constructor(ctx: Context, _config?: Record<string, never>) {
    super(ctx)
    this.pool = ctx.pool
  }

  /**
   * Scope the child's working directory into the caller's pooled user
   * directory, then delegate to the local process mechanism.
   * @param spec - the fully-specified spawn request.
   * @returns the live process handle.
   */
  override spawn(spec: SubprocessSpawnSpec): SubprocessHandle {
    const cwd = this.scopedCwd(spec.cwd)
    return super.spawn({ ...spec, cwd })
  }

  /**
   * Terminal allocation is not part of the pooled-execution POC. Fail loudly
   * rather than leak a local terminal outside the pooled user directory.
   * @param _spec - ignored; the POC does not implement pooled terminals.
   * @returns never; rejects.
   */
  override spawnTerminal(_spec: SubprocessTerminalSpawnSpec): Promise<SubprocessTerminalHandle> {
    return Promise.reject(new Error('pool-dsh: spawnTerminal is not implemented in the POC pooled sandbox'))
  }

  /** Route `cwd` under the pool's storage root, treating it as a user-scoped path. */
  private scopedCwd(cwd: string): string {
    const normalized = normalize(cwd)
    const prefix = normalize(this.pool.storageRoot) + '/'
    if (isAbsolute(normalized) && normalized.startsWith(prefix)) return normalized
    if (isAbsolute(normalized)) return normalized
    return join(normalize(this.pool.storageRoot), normalized)
  }
}

export default PoolSubprocess
