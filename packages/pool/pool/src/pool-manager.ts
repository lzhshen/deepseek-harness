/**
 * The pool manager: global sandbox ledger owner and lifecycle scheduler. It
 * serves acquire/release/reportIdle/heartbeat to engine pool-clients and runs
 * the three background jobs (idle reclaim, warm-pool refill, orphan sweep) as
 * explicit ticks so tests and the load simulator drive them deterministically.
 * @module @deepseek-ai/dsh-pool/pool-manager
 */

import type { BindingKey, EngineId, SandboxId } from './brand.ts'
import type { PoolLedger } from './ledger.ts'
import type { PodFactory } from './pod-factory.ts'
import { Sandbox } from './sandbox.ts'
import type { AcquireResult, PoolConfig, PoolStats } from './types.ts'
import { PoolExhaustedError, validatePoolConfig } from './types.ts'

/** Outcome of one idle-reclaim tick. */
export interface ReclaimOutcome {
  readonly reclaimed: number
  readonly created: number
}

/** Outcome of one orphan-reconciliation tick. */
export interface OrphanOutcome {
  readonly reclaimed: number
  readonly created: number
}

/** The single-owner pool scheduler and acquire/release API. */
export class PoolManager {
  private readonly config: PoolConfig
  private readonly ledger: PoolLedger
  private readonly podFactory: PodFactory
  private readonly clock: () => number

  private reclaimTotal = 0
  private acquireTotal = 0
  private coldAcquireTotal = 0
  private warmHitTotal = 0
  private exhaustedTotal = 0

  /**
   * @param config - validated pool tunables.
   * @param ledger - the ledger owning bindings and states.
   * @param podFactory - the Pod substrate.
   * @param clock - epoch-milliseconds source; defaults to `Date.now`.
   */
  constructor(config: PoolConfig, ledger: PoolLedger, podFactory: PodFactory, clock: () => number = Date.now) {
    validatePoolConfig(config)
    this.config = config
    this.ledger = ledger
    this.podFactory = podFactory
    this.clock = clock
  }

  /**
   * Serve one engine's request for a sandbox. A binding key with an IDLE
   * sandbox is a warm hit (rebind); otherwise a WARM sandbox is claimed and
   * the user's directory mounted (cold path). Throws {@link PoolExhaustedError}
   * when the warm pool is empty and the pool is at capacity.
   * @param bindingKey - the abstract binding key (the user id in the POC).
   * @param userId - whose storage directory to mount.
   * @param engineId - the engine replica taking the binding.
   * @returns the acquired sandbox, endpoint, and warm-hit flag.
   */
  async acquire(bindingKey: BindingKey, userId: string, engineId: EngineId): Promise<AcquireResult> {
    this.acquireTotal += 1
    const now = this.clock()
    const rebound = this.ledger.rebindIdle(bindingKey, engineId, now)
    if (rebound !== undefined) {
      this.warmHitTotal += 1
      return { sandboxId: rebound.sandboxId, endpoint: rebound.endpoint, warm: true }
    }
    const claimed = this.ledger.claimWarm(bindingKey, engineId, userId, now)
    if (claimed === undefined) {
      this.exhaustedTotal += 1
      throw new PoolExhaustedError(bindingKey)
    }
    this.coldAcquireTotal += 1
    try {
      await this.podFactory.mount(claimed.sandboxId, userId)
    } catch (error: unknown) {
      await this.reclaimSandbox(claimed.sandboxId)
      throw error
    }
    return { sandboxId: claimed.sandboxId, endpoint: claimed.endpoint, warm: false }
  }

  /**
   * Release a binding into the idle keep-alive countdown. Aliases
   * {@link reportIdle}; a task completing and a page closing share the path.
   * @param bindingKey - the binding to release.
   * @returns true when a BOUND sandbox was marked IDLE.
   */
  release(bindingKey: BindingKey): boolean {
    return this.reportIdle(bindingKey)
  }

  /**
   * Mark the binding key's sandbox IDLE, starting the reclaim countdown.
   * @param bindingKey - the binding whose task finished with no online connection.
   * @returns true when a BOUND sandbox was marked IDLE.
   */
  reportIdle(bindingKey: BindingKey): boolean {
    return this.ledger.markIdle(bindingKey, this.clock()) !== undefined
  }

  /**
   * Reset the binding key's activity clock, keeping it bound (or extending its
   * idle keep-alive).
   * @param bindingKey - the binding to keep alive.
   * @returns true when the key's sandbox was touched.
   */
  heartbeat(bindingKey: BindingKey): boolean {
    return this.ledger.touch(bindingKey, this.clock()) !== undefined
  }

  /** Current water level plus cumulative counters. */
  stats(): PoolStats {
    const counts = this.ledger.counts()
    return {
      warm: counts.warm,
      bound: counts.bound,
      idle: counts.idle,
      reclaiming: counts.reclaiming,
      capacity: this.config.poolCapacity,
      targetWarm: this.config.targetWarmCount,
      reclaimTotal: this.reclaimTotal,
      acquireTotal: this.acquireTotal,
      coldAcquireTotal: this.coldAcquireTotal,
      warmHitTotal: this.warmHitTotal,
      exhaustedTotal: this.exhaustedTotal,
    }
  }

  /**
   * Top the warm pool up toward `targetWarmCount`, never exceeding
   * `poolCapacity` across WARM+BOUND+IDLE.
   * @returns how many sandboxes were created.
   */
  async refillTick(): Promise<number> {
    let created = 0
    while (true) {
      const counts = this.ledger.counts()
      const active = counts.warm + counts.bound + counts.idle
      if (counts.warm >= this.config.targetWarmCount) break
      if (active >= this.config.poolCapacity) break
      const spec = await this.podFactory.create()
      this.ledger.addWarm(Sandbox.warm(spec.sandboxId, spec.endpoint, this.clock()))
      created += 1
    }
    return created
  }

  /**
   * Reclaim every IDLE sandbox inactive past `idleTimeoutMs`, destroy its Pod,
   * then refill the warm pool.
   * @returns how many were reclaimed and how many warm replacements were created.
   */
  async reclaimTick(): Promise<ReclaimOutcome> {
    const now = this.clock()
    const cutoff = now - this.config.idleTimeoutMs
    const reclaimed = this.ledger.sweepIdle(cutoff, now)
    for (const sandbox of reclaimed) await this.destroySandbox(sandbox.sandboxId)
    const created = await this.refillTick()
    return { reclaimed: reclaimed.length, created }
  }

  /**
   * Reclaim every BOUND sandbox whose engine is absent from `liveEngineIds`,
   * destroy its Pod, then refill the warm pool.
   * @param liveEngineIds - the engine replicas still alive.
   * @returns how many were reclaimed and how many warm replacements were created.
   */
  async orphanTick(liveEngineIds: ReadonlySet<EngineId>): Promise<OrphanOutcome> {
    const now = this.clock()
    const reclaimed = this.ledger.sweepOrphans(liveEngineIds, now)
    for (const sandbox of reclaimed) await this.destroySandbox(sandbox.sandboxId)
    const created = await this.refillTick()
    return { reclaimed: reclaimed.length, created }
  }

  private async destroySandbox(sandboxId: SandboxId): Promise<void> {
    await this.podFactory.destroy(sandboxId)
    this.ledger.remove(sandboxId)
    this.reclaimTotal += 1
  }

  /** Roll back a cold acquire whose mount failed: reclaim, destroy, refill. */
  private async reclaimSandbox(sandboxId: SandboxId): Promise<void> {
    this.ledger.markReclaiming(sandboxId, this.clock())
    await this.destroySandbox(sandboxId)
    await this.refillTick()
  }
}
