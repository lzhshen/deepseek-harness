/**
 * Shared value types for the pool manager: sandbox state, ledger records,
 * configuration, acquire results, and water-level statistics.
 * @module @deepseek-ai/dsh-pool/types
 */

import type { BindingKey, EngineId, SandboxId } from './brand.ts'

/** The four states of one pooled sandbox (see the pool design's state machine). */
export type SandboxState = 'warm' | 'bound' | 'idle' | 'reclaiming'

/**
 * One sandbox as held by the ledger. Fields that only apply to specific
 * states are omitted elsewhere: `bindingKey`/`engineId`/`userId` exist while
 * BOUND or IDLE (engineId only while BOUND), and are absent while WARM or
 * RECLAIMING.
 */
export interface SandboxRecord {
  readonly sandboxId: SandboxId
  readonly state: SandboxState
  /** The abstract key this sandbox is bound to; absent while WARM/RECLAIMING. */
  readonly bindingKey?: BindingKey
  /** The engine replica currently holding the binding; absent outside BOUND. */
  readonly engineId?: EngineId
  /** Which user directory is mounted; absent while WARM/RECLAIMING. */
  readonly userId?: string
  readonly endpoint: string
  /** Epoch milliseconds of the last activity; drives the idle reclaim countdown. */
  readonly lastActiveAt: number
  readonly createdAt: number
}

/** Validated deployment-varying tunables for one pool. */
export interface PoolConfig {
  /** Hard ceiling on WARM + BOUND + IDLE sandboxes. */
  readonly poolCapacity: number
  /** Warm-pool water level the keeper refills toward. */
  readonly targetWarmCount: number
  /** How long an IDLE sandbox keeps its binding before reclaim. */
  readonly idleTimeoutMs: number
}

/** Result of a successful {@link PoolManager.acquire}. */
export interface AcquireResult {
  readonly sandboxId: SandboxId
  readonly endpoint: string
  /** True when an IDLE sandbox for the binding key was rebound; false on a cold claim. */
  readonly warm: boolean
}

/** Current water level plus cumulative counters, for operations and load reports. */
export interface PoolStats {
  readonly warm: number
  readonly bound: number
  readonly idle: number
  readonly reclaiming: number
  readonly capacity: number
  readonly targetWarm: number
  /** Cumulative sandboxes destroyed by reclaim, orphan sweep, or failed acquire. */
  readonly reclaimTotal: number
  readonly acquireTotal: number
  readonly coldAcquireTotal: number
  readonly warmHitTotal: number
  readonly exhaustedTotal: number
}

/**
 * Thrown by {@link PoolManager.acquire} when no WARM sandbox is available and
 * the pool is already at capacity. Maps to the design's `50301` response.
 */
export class PoolExhaustedError extends Error {
  /** Stable machine-readable failure code. */
  readonly code = 'POOL_EXHAUSTED' as const

  /** @param bindingKey - the binding key whose acquire could not be served. */
  constructor(readonly bindingKey: BindingKey) {
    super(`pool exhausted: no warm sandbox for binding key ${JSON.stringify(String(bindingKey))}`)
    this.name = 'PoolExhaustedError'
  }
}

/** Validates one pool configuration and fails loud on any invalid field. */
export function validatePoolConfig(config: PoolConfig): void {
  const { poolCapacity, targetWarmCount, idleTimeoutMs } = config
  if (!Number.isInteger(poolCapacity) || poolCapacity <= 0) {
    throw new Error('dsh-pool: poolCapacity must be a positive integer')
  }
  if (!Number.isInteger(targetWarmCount) || targetWarmCount < 0) {
    throw new Error('dsh-pool: targetWarmCount must be a non-negative integer')
  }
  if (targetWarmCount > poolCapacity) {
    throw new Error('dsh-pool: targetWarmCount must not exceed poolCapacity')
  }
  if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
    throw new Error('dsh-pool: idleTimeoutMs must be a positive finite number')
  }
}
