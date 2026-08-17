/**
 * The load driver: a discrete-event simulation that drives the pool manager
 * and residency registry through the same acquire/reportIdle/heartbeat calls
 * the engine makes, with virtual users that behave like office workers
 * (send a task, sometimes close the page, return later). It produces the
 * measurement record the report generator turns into M1-M5.
 * @module @deepseek-ai/dsh-loadsim/driver
 */

import type { BindingKey, EngineId, PoolStats } from '@deepseek-ai/dsh-pool'
import {
  BindingKey as bindingKey,
  EngineId as engineId,
  FakePodFactory,
  MemoryLedger,
  PoolExhaustedError,
  PoolManager,
} from '@deepseek-ai/dsh-pool'
import type { ResidencyStats } from '@deepseek-ai/dsh-tenant-residency'
import { ResidencyRegistry, SessionId } from '@deepseek-ai/dsh-tenant-residency'
import type { BehaviorParams, SandboxSpec } from './behavior.ts'
import { BehaviorModel } from './behavior.ts'
import { MetricsCollector } from './metrics.ts'

/** One run's configuration. All durations are virtual milliseconds. */
export interface LoadPlan {
  readonly poolCapacity: number
  readonly targetWarmCount: number
  readonly idleTimeoutMs: number
  readonly residencyIdleTimeoutMs: number
  readonly maxResidents: number
  readonly behavior: BehaviorParams
  /** Modeled cold-start cost recorded per cold acquire (CFS mount + pod ready). */
  readonly coldStartLatencyMs: number
  readonly spec: SandboxSpec
  readonly seed: number
  readonly userCount: number
  readonly totalDurationMs: number
  readonly poolTickIntervalMs: number
  readonly exhaustedRetryDelayMs: number
  readonly thinkDelayMs: number
}

/** What one simulation run leaves behind. */
export interface SimResult {
  readonly metrics: MetricsCollector
  readonly poolStats: PoolStats
  readonly residencyStats: ResidencyStats
  /** Mean sampled task duration, for the M5 spec calibration. */
  readonly measuredTaskDurationMeanMs: number
}

interface UserState {
  readonly userId: number
  readonly sessionId: SessionId
  readonly key: BindingKey
  leftPage: boolean
  hasSandbox: boolean
}

type SimEvent =
  | { readonly at: number; readonly kind: 'arrive'; readonly userId: number }
  | { readonly at: number; readonly kind: 'complete'; readonly userId: number }
  | { readonly at: number; readonly kind: 'return'; readonly userId: number }
  | { readonly at: number; readonly kind: 'poolTick' }
  | { readonly at: number; readonly kind: 'end' }

/** Runs one simulation of the shared pool under multi-user load. */
export class LoadDriver {
  private readonly plan: LoadPlan
  private readonly engine: EngineId

  /**
   * @param plan - the scenario to simulate.
   * @param engine - the brain replica identity (single engine for the POC).
   */
  constructor(plan: LoadPlan, engine: string = 'engine-1') {
    validatePlan(plan)
    this.plan = plan
    this.engine = engineId(engine)
  }

  /** Simulate the plan and return the full measurement record. */
  async run(): Promise<SimResult> {
    const { plan, engine } = this
    let now = 0
    let draining = false

    const pool = new PoolManager(
      { poolCapacity: plan.poolCapacity, targetWarmCount: plan.targetWarmCount, idleTimeoutMs: plan.idleTimeoutMs },
      new MemoryLedger(),
      new FakePodFactory(),
      () => now,
    )
    await pool.refillTick()

    const residency = new ResidencyRegistry(
      { maxResidents: plan.maxResidents, idleTimeoutMs: plan.residencyIdleTimeoutMs },
      () => now,
    )
    const behavior = new BehaviorModel(plan.behavior, plan.seed)
    const metrics = new MetricsCollector()
    const users = new Map<number, UserState>()
    for (let userId = 0; userId < plan.userCount; userId += 1) {
      users.set(userId, {
        userId,
        sessionId: SessionId(`session-${userId}`),
        key: bindingKey(`user-${userId}`),
        leftPage: false,
        hasSandbox: false,
      })
    }

    const events: SimEvent[] = []
    const push = (event: SimEvent): void => { events.push(event) }
    const pop = (): SimEvent | undefined => {
      events.sort((left, right) => left.at - right.at)
      return events.shift()
    }
    const stateOf = (userId: number): UserState => {
      const state = users.get(userId)
      if (state === undefined) throw new Error(`dsh-loadsim: unknown user ${userId}`)
      return state
    }
    const sample = (): void => {
      const stats = pool.stats()
      metrics.sample(now, stats.bound, stats.idle, stats.warm, residency.size)
    }

    const handleArrive = async (userId: number): Promise<void> => {
      if (draining) return
      const state = stateOf(userId)
      residency.claim(state.sessionId, engine, `user-${userId}`)
      residency.touch(state.sessionId)
      const willLeave = behavior.willLeave()
      let acquired
      try {
        acquired = await pool.acquire(state.key, `user-${userId}`, engine)
      } catch (error: unknown) {
        if (error instanceof PoolExhaustedError) {
          metrics.recordExhausted()
          push({ at: now + plan.exhaustedRetryDelayMs, kind: 'arrive', userId })
          return
        }
        throw error
      }
      metrics.recordAcquire(acquired.warm)
      if (!acquired.warm) metrics.recordColdStart(plan.coldStartLatencyMs)
      metrics.recordTaskSent(willLeave)
      state.hasSandbox = true
      state.leftPage = willLeave
      const duration = behavior.taskDurationMs(plan.spec)
      metrics.recordTaskDuration(duration)
      push({ at: now + duration, kind: 'complete', userId })
      if (willLeave) push({ at: now + behavior.returnDelayMs(), kind: 'return', userId })
    }

    const handleComplete = (userId: number): void => {
      const state = stateOf(userId)
      metrics.recordTaskCompleted(state.leftPage)
      pool.reportIdle(state.key)
      state.hasSandbox = false
      if (state.leftPage || draining) return // the return event was scheduled when the user left
      if (behavior.willLeave()) {
        state.leftPage = true
        push({ at: now + behavior.returnDelayMs(), kind: 'return', userId })
      } else {
        push({ at: now + plan.thinkDelayMs, kind: 'arrive', userId })
      }
    }

    const handleReturn = (userId: number): void => {
      const state = stateOf(userId)
      state.leftPage = false
      if (!draining && !state.hasSandbox) push({ at: now, kind: 'arrive', userId })
    }

    const handlePoolTick = async (): Promise<void> => {
      await pool.reclaimTick()
      await pool.refillTick()
      await pool.orphanTick(new Set([engine]))
      residency.evictIdle(now - plan.residencyIdleTimeoutMs)
      if (!draining) push({ at: now + plan.poolTickIntervalMs, kind: 'poolTick' })
    }

    // Stagger arrivals over the first fifth of the run to ramp concurrency.
    const rampMs = Math.floor(plan.totalDurationMs / 5)
    for (let userId = 0; userId < plan.userCount; userId += 1) {
      push({ at: Math.floor((userId * rampMs) / Math.max(1, plan.userCount - 1)), kind: 'arrive', userId })
    }
    push({ at: 0, kind: 'poolTick' })
    push({ at: plan.totalDurationMs, kind: 'end' })

    while (events.length > 0) {
      const event = pop()
      if (event === undefined) break
      if (event.kind === 'end') {
        draining = true
        continue
      }
      now = event.at
      if (event.kind === 'arrive') await handleArrive(event.userId)
      else if (event.kind === 'complete') handleComplete(event.userId)
      else if (event.kind === 'return') handleReturn(event.userId)
      else await handlePoolTick()
      sample()
    }

    return {
      metrics,
      poolStats: pool.stats(),
      residencyStats: residency.stats(),
      measuredTaskDurationMeanMs: metrics.measuredTaskDurationMeanMs,
    }
  }
}

function validatePlan(plan: LoadPlan): void {
  for (const [name, value] of [
    ['poolCapacity', plan.poolCapacity],
    ['targetWarmCount', plan.targetWarmCount],
    ['maxResidents', plan.maxResidents],
    ['userCount', plan.userCount],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`dsh-loadsim: ${name} must be a non-negative integer`)
  }
  for (const [name, value] of [
    ['idleTimeoutMs', plan.idleTimeoutMs],
    ['residencyIdleTimeoutMs', plan.residencyIdleTimeoutMs],
    ['coldStartLatencyMs', plan.coldStartLatencyMs],
    ['totalDurationMs', plan.totalDurationMs],
    ['poolTickIntervalMs', plan.poolTickIntervalMs],
    ['exhaustedRetryDelayMs', plan.exhaustedRetryDelayMs],
    ['thinkDelayMs', plan.thinkDelayMs],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`dsh-loadsim: ${name} must be a non-negative finite number`)
  }
  if (plan.totalDurationMs <= 0) throw new Error('dsh-loadsim: totalDurationMs must be positive')
  if (plan.poolTickIntervalMs <= 0) throw new Error('dsh-loadsim: poolTickIntervalMs must be positive')
}
