/**
 * The pooled-sandbox shared owner, registered as `ctx.pool`. It composes the
 * pure `@deepseek-ai/dsh-pool` {@link PoolManager} with the POC's in-memory
 * ledger and fake Pod factory, and is the single place the engine-side
 * pool-client view and the sandbox providers (`ctx.fs` / `ctx.subprocess`)
 * both talk to. A production deployment swaps the ledger for a persistent
 * backend and the factory for a K8s implementation without touching the two
 * providers or this service's interface.
 * @module @deepseek-ai/dsh-pool-dsh
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  BindingKey,
  EngineId,
  FakePodFactory,
  MemoryLedger,
  PoolManager,
} from '@deepseek-ai/dsh-pool'
import type { AcquireResult, PoolConfig, PoolStats } from '@deepseek-ai/dsh-pool'

/**
 * One acquisition the runtime handed out. Carries the binding key and user so
 * providers can route operations into the current sandbox's user directory.
 */
export interface PoolBinding {
  /** The sandbox identifier the pool returned. */
  readonly sandboxId: AcquireResult['sandboxId']
  /** The sandbox endpoint (the fake Pod's recorded endpoint in the POC). */
  readonly endpoint: string
  /** Whether this was a warm rebind rather than a cold claim. */
  readonly warm: boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    pool: PoolRuntime
  }
}

/** Configuration for the pooled-sandbox owner. */
export interface Config {
  /** Pool tunables, passed through to {@link PoolManager}. */
  readonly pool: PoolConfig
  /**
   * Local storage root standing in for the CFS. Each user's files live under
   * `storageRoot/<userId>/` so users stay isolated; a K8s PodFactory would
   * mount the real CFS subPath instead, leaving this routing unchanged.
   */
  readonly storageRoot: string
  /**
   * This engine replica's identity for the pool's orphan sweep; an empty
   * string (the default) yields a random id.
   */
  readonly engineId?: string
}

interface SchemaResolvedConfig extends Config {
  pool: PoolConfig
  storageRoot: string
}

/**
 * The pooled-sandbox owner. Constructs a {@link PoolManager} over the POC's
 * in-memory ledger and fake Pod substrate and reserves the engine-side client
 * surface (`acquire`/`release`/`heartbeat`/`stats`) plus the storage root the
 * sandbox providers route through.
 */
export class PoolRuntime extends Service {
  static Config: z<Config> = z.object({
    pool: z.object({
      poolCapacity: z.number(),
      targetWarmCount: z.number(),
      idleTimeoutMs: z.number(),
    }),
    storageRoot: z.string(),
    engineId: z.string().default(''),
  })

  /** The composed pool manager (the pure library's core, now service-hosted). */
  readonly manager: PoolManager
  /** Local storage root for per-user directories (the POC's CFS stand-in). */
  readonly storageRoot: string

  private readonly engineId: EngineId

  /**
   * @param ctx - Cordis context; registers this service as `ctx.pool`.
   * @param config - validated pool tunables and the storage root.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'pool')
    const resolved = config as SchemaResolvedConfig
    this.storageRoot = resolved.storageRoot
    const engineId = resolved.engineId ?? ''
    this.engineId = EngineId(engineId === '' ? `engine-${String(Math.random()).slice(2)}` : engineId)
    this.manager = new PoolManager(
      resolved.pool,
      new MemoryLedger(),
      new FakePodFactory(),
    )
  }

  /** The engine replica this runtime owns (the pool's orphan-sweep input). */
  get engineIdentity(): EngineId {
    return this.engineId
  }

  /**
   * Acquire a sandbox for one user, the engine-side client view of the pool's
   * `acquire`. The binding key is fixed to the user id in the POC (design D10).
   * @param userId - the user whose sandbox to bind and directory to mount.
   * @returns the acquired sandbox.
   */
  async acquire(userId: string): Promise<PoolBinding> {
    const result = await this.manager.acquire(BindingKey(userId), userId, this.engineId)
    return { sandboxId: result.sandboxId, endpoint: result.endpoint, warm: result.warm }
  }

  /**
   * Release a user's binding into the idle keep-alive countdown.
   * @param userId - the user whose binding to release.
   * @returns true when a bound sandbox was marked idle.
   */
  release(userId: string): boolean {
    return this.manager.release(BindingKey(userId))
  }

  /**
   * Heartbeat one user's binding, resetting the reclaim countdown.
   * @param userId - the user whose binding to keep alive.
   * @returns true when the key's sandbox was touched.
   */
  heartbeat(userId: string): boolean {
    return this.manager.heartbeat(BindingKey(userId))
  }

  /** Current pool water level plus cumulative counters. */
  stats(): PoolStats {
    return this.manager.stats()
  }

  /** Top the warm pool up toward the target water level (the pool's refill tick). */
  async refill(): Promise<number> {
    return this.manager.refillTick()
  }
}

export default PoolRuntime
