/**
 * Turns one simulation's measurements into the M1-M5 acceptance metrics and a
 * human-readable summary. Extrapolations follow the D5 estimation口径 (0.5C per
 * sandbox, 2500C budget, 5000-concurrency target) and are labeled as such;
 * cold-start latency is a modeled input, not a real cluster measurement.
 * @module @deepseek-ai/dsh-loadsim/report
 */

import type { SandboxSpec } from './behavior.ts'
import { SPEC_SLOWDOWN } from './behavior.ts'
import type { SimResult } from './driver.ts'

/** M1: capacity at the same budget. */
export interface M1Capacity {
  readonly poolCapacity: number
  readonly coresPerSandbox: number
  readonly peakConcurrentBound: number
  readonly exhausted: number
  readonly degraded: boolean
  readonly extrapolatedConcurrencyAt2500C: number
  readonly target: number
  readonly meetsTarget: boolean
}

/** M2: cold-start p95 after the sandbox was reclaimed. */
export interface M2ColdStart {
  readonly p95Ms: number
  readonly thresholdMs: number
  readonly sampleCount: number
  readonly passed: boolean
}

/** M3: task completion after the page closed. */
export interface M3ClosePage {
  readonly taskSentTotal: number
  readonly taskCompletedTotal: number
  readonly sentWithLeave: number
  readonly completedAfterDisconnect: number
  /** Fraction of sent tasks that completed (closing the page never kills a task). */
  readonly completionRate: number
  readonly passed: boolean
}

/** M4: single-brain steady-state resident session density. */
export interface M4Density {
  readonly peakConcurrentResidents: number
  readonly target: number
  readonly meetsTarget: boolean
}

/** M5: task-duration calibration across the three sandbox sizes. */
export interface M5Spec {
  readonly spec: SandboxSpec
  readonly meanTaskDurationMs: number
}

/** The full acceptance report. */
export interface AcceptanceReport {
  readonly m1: M1Capacity
  readonly m2: M2ColdStart
  readonly m3: M3ClosePage
  readonly m4: M4Density
  readonly m5: M5Spec[]
  readonly summary: string[]
}

/** Tunables for report computation; defaults mirror the design's D5/M1-M5 numbers. */
export interface ReportOptions {
  readonly coresPerSandbox?: number
  readonly budgetCores?: number
  readonly m1Target?: number
  readonly m2ThresholdMs?: number
  readonly m4Target?: number
}

/** Nearest-rank percentile of an already-sorted sample, or undefined when empty. */
export function percentile(sorted: readonly number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined
  const index = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))]
}

/**
 * Generate the M1-M5 report from a simulation run.
 * @param result - the run's measurements.
 * @param options - report tunables; defaults target the design's acceptance numbers.
 * @returns the acceptance report plus a human-readable summary.
 */
export function generateReport(result: SimResult, options: ReportOptions = {}): AcceptanceReport {
  const { metrics, poolStats } = result
  const coresPerSandbox = options.coresPerSandbox ?? 0.5
  const budgetCores = options.budgetCores ?? 2500
  const m1Target = options.m1Target ?? 5000
  const m2ThresholdMs = options.m2ThresholdMs ?? 10_000
  const m4Target = options.m4Target ?? 500

  const coldStartP95 = percentile([...metrics.coldStartLatenciesMs].sort((a, b) => a - b), 0.95) ?? 0
  const sentWithLeave = metrics.taskSentWithLeave
  const completedAfterDisconnect = metrics.taskCompletedAfterDisconnect
  const completionRate = metrics.taskSentTotal === 0 ? 1 : metrics.taskCompletedTotal / metrics.taskSentTotal
  const degraded = metrics.exhausted > 0
  const extrapolatedConcurrencyAt2500C = extrapolate(metrics.peakBound, poolStats.capacity, coresPerSandbox, budgetCores)

  const m1: M1Capacity = {
    poolCapacity: poolStats.capacity,
    coresPerSandbox,
    peakConcurrentBound: metrics.peakBound,
    exhausted: metrics.exhausted,
    degraded,
    extrapolatedConcurrencyAt2500C,
    target: m1Target,
    meetsTarget: !degraded && extrapolatedConcurrencyAt2500C >= m1Target,
  }

  const m2: M2ColdStart = {
    p95Ms: coldStartP95,
    thresholdMs: m2ThresholdMs,
    sampleCount: metrics.coldStartLatenciesMs.length,
    passed: coldStartP95 <= m2ThresholdMs,
  }

  const m3: M3ClosePage = {
    taskSentTotal: metrics.taskSentTotal,
    taskCompletedTotal: metrics.taskCompletedTotal,
    sentWithLeave,
    completedAfterDisconnect,
    completionRate,
    passed: metrics.taskCompletedTotal === metrics.taskSentTotal,
  }

  const m4: M4Density = {
    peakConcurrentResidents: metrics.peakResidents,
    target: m4Target,
    meetsTarget: metrics.peakResidents >= m4Target,
  }

  const specs: readonly SandboxSpec[] = [0.25, 0.5, 1]
  const m5: M5Spec[] = specs.map(spec => ({
    spec,
    meanTaskDurationMs: Math.round(result.measuredTaskDurationMeanMs * SPEC_SLOWDOWN[spec]),
  }))

  const summary = [
    `M1 capacity: peak ${m1.peakConcurrentBound} concurrent bound sandboxes over a ${m1.poolCapacity}-sandbox pool` +
      ` (${m1.exhausted} exhausted); extrapolated ${m1.extrapolatedConcurrencyAt2500C} at ${budgetCores}C — ${m1.meetsTarget ? 'meets' : 'below'} the ${m1Target} target.`,
    `M2 cold start: p95 ${m2.p95Ms}ms over ${m2.sampleCount} cold acquires — ${m2.passed ? 'within' : 'over'} the ${m2.thresholdMs}ms threshold.`,
    `M3 close page: ${m3.taskCompletedTotal}/${m3.taskSentTotal} tasks completed (${Math.round(m3.completionRate * 100)}%), ${m3.completedAfterDisconnect} of them after disconnect.`,
    `M4 density: peak ${m4.peakConcurrentResidents} resident sessions on one brain — ${m4.meetsTarget ? 'meets' : 'below'} the ${m4.target} target.`,
    `M5 spec: ${m5.map(entry => `${entry.spec}C=${entry.meanTaskDurationMs}ms`).join(', ')}.`,
  ]

  return { m1, m2, m3, m4, m5, summary }
}

/** Linear extrapolation from the POC pool to the 2500C budget (D5口径). */
function extrapolate(peakBound: number, poolCapacity: number, coresPerSandbox: number, budgetCores: number): number {
  const poolCores = poolCapacity * coresPerSandbox
  if (poolCores <= 0) return 0
  return Math.round(peakBound * (budgetCores / poolCores))
}
