/**
 * The residency registry: which engine replica holds which session in memory.
 * A claim is atomic within one process — an already-resident session returns
 * its owning engine (redirect) instead of double-residing. New claims evict
 * the least-recently-active residents when over capacity, and idle residents
 * are released on demand (the brain's idle timer drives {@link evictIdle}).
 * The POC keeps this in memory; the persistent backend uses a row-level claim
 * so one session never resides on two replicas across processes.
 * @module @deepseek-ai/dsh-tenant-residency/residency
 */

import type { EngineId } from '@deepseek-ai/dsh-pool'
import type { SessionId } from './brand.ts'

/** Validated deployment-varying tunables for one residency registry. */
export interface ResidencyConfig {
  /** Hard ceiling on resident sessions per brain replica. */
  readonly maxResidents: number
  /** How long a resident may stay inactive before eviction. */
  readonly idleTimeoutMs: number
}

/** One resident session with its owning engine and activity clock. */
export interface Resident {
  readonly sessionId: SessionId
  readonly engineId: EngineId
  readonly userId: string
  readonly lastActiveAt: number
}

/** Result of a claim: either acquired here, or redirected to the current owner. */
export interface ClaimOutcome {
  readonly resident: Resident
  /** True when this replica now owns the residency; false when redirected. */
  readonly acquired: boolean
  /** The owning engine when `acquired` is false. */
  readonly redirectedTo?: EngineId
  /** Residents evicted by LRU pressure to make room for a new claim. */
  readonly evicted: Resident[]
}

/** Current residency water level plus cumulative counters. */
export interface ResidencyStats {
  readonly residents: number
  readonly maxResidents: number
  readonly claimTotal: number
  readonly acquiredTotal: number
  readonly redirectTotal: number
  readonly evictedTotal: number
}

/** Validates one residency configuration and fails loud on any invalid field. */
export function validateResidencyConfig(config: ResidencyConfig): void {
  const { maxResidents, idleTimeoutMs } = config
  if (!Number.isInteger(maxResidents) || maxResidents <= 0) {
    throw new Error('dsh-tenant-residency: maxResidents must be a positive integer')
  }
  if (!Number.isFinite(idleTimeoutMs) || idleTimeoutMs <= 0) {
    throw new Error('dsh-tenant-residency: idleTimeoutMs must be a positive finite number')
  }
}

/** Single-process residency registry with LRU and idle eviction. */
export class ResidencyRegistry {
  private readonly config: ResidencyConfig
  private readonly bySession = new Map<SessionId, Resident>()
  private readonly clock: () => number

  private claimTotal = 0
  private acquiredTotal = 0
  private redirectTotal = 0
  private evictedTotal = 0

  /**
   * @param config - validated residency tunables.
   * @param clock - epoch-milliseconds source; defaults to `Date.now`.
   */
  constructor(config: ResidencyConfig, clock: () => number = Date.now) {
    validateResidencyConfig(config)
    this.config = config
    this.clock = clock
  }

  /**
   * Claim residency for a session. Returns the existing resident (with its
   * owning engine) when already resident; otherwise inserts a new resident,
   * evicting least-recently-active ones if the registry is at capacity.
   * @param sessionId - the session to claim.
   * @param engineId - this replica's identity.
   * @param userId - the session's owner, for tenant attribution.
   * @returns the claim outcome.
   */
  claim(sessionId: SessionId, engineId: EngineId, userId: string): ClaimOutcome {
    this.claimTotal += 1
    const existing = this.bySession.get(sessionId)
    if (existing !== undefined) {
      this.redirectTotal += 1
      return { resident: existing, acquired: false, redirectedTo: existing.engineId, evicted: [] }
    }
    this.acquiredTotal += 1
    const evicted = this.evictForRoom()
    const resident: Resident = { sessionId, engineId, userId, lastActiveAt: this.clock() }
    this.bySession.set(sessionId, resident)
    return { resident, acquired: true, evicted }
  }

  /**
   * Release a session's residency (its engine is evicting or the session closed).
   * @param sessionId - the session to release.
   * @returns true when the session was resident and is now released.
   */
  release(sessionId: SessionId): boolean {
    return this.bySession.delete(sessionId)
  }

  /**
   * Refresh a resident's activity clock without changing ownership.
   * @param sessionId - the resident to touch.
   * @returns true when the session is resident and was touched.
   */
  touch(sessionId: SessionId): boolean {
    const resident = this.bySession.get(sessionId)
    if (resident === undefined) return false
    this.bySession.set(sessionId, { ...resident, lastActiveAt: this.clock() })
    return true
  }

  /** Return the resident for a session, if any. */
  find(sessionId: SessionId): Resident | undefined {
    return this.bySession.get(sessionId)
  }

  /**
   * Release every resident inactive since `cutoff`.
   * @param cutoff - epoch milliseconds; residents with `lastActiveAt < cutoff` are evicted.
   * @returns the evicted residents, oldest first.
   */
  evictIdle(cutoff: number): Resident[] {
    const evicted: Resident[] = []
    for (const resident of this.bySession.values()) {
      if (resident.lastActiveAt < cutoff) evicted.push(resident)
    }
    evicted.sort((left, right) => left.lastActiveAt - right.lastActiveAt)
    for (const resident of evicted) this.bySession.delete(resident.sessionId)
    this.evictedTotal += evicted.length
    return evicted
  }

  /**
   * Release up to `count` least-recently-active residents.
   * @param count - maximum residents to evict.
   * @returns the evicted residents, oldest first.
   */
  evictLru(count: number): Resident[] {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error('dsh-tenant-residency: evictLru count must be a non-negative integer')
    }
    const residents = [...this.bySession.values()].sort((left, right) => left.lastActiveAt - right.lastActiveAt)
    const evicted = residents.slice(0, count)
    for (const resident of evicted) this.bySession.delete(resident.sessionId)
    this.evictedTotal += evicted.length
    return evicted
  }

  /** Number of currently resident sessions. */
  get size(): number {
    return this.bySession.size
  }

  /** Snapshot of all residents, unordered. */
  list(): Resident[] {
    return [...this.bySession.values()]
  }

  /** Current water level plus cumulative counters. */
  stats(): ResidencyStats {
    return {
      residents: this.bySession.size,
      maxResidents: this.config.maxResidents,
      claimTotal: this.claimTotal,
      acquiredTotal: this.acquiredTotal,
      redirectTotal: this.redirectTotal,
      evictedTotal: this.evictedTotal,
    }
  }

  /** Evict enough least-recently-active residents to fit one more claim. */
  private evictForRoom(): Resident[] {
    const overflow = this.bySession.size - this.config.maxResidents + 1
    if (overflow <= 0) return []
    return this.evictLru(overflow)
  }
}
