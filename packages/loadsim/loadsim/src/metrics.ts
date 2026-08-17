/**
 * One run's measurements: cold-start latencies, warm/cold acquire mix, task
 * completion (including after page close), pool exhaustion, and concurrency
 * samples over time. The report generator turns these into the M1-M5
 * acceptance metrics.
 * @module @deepseek-ai/dsh-loadsim/metrics
 */

/** One point-in-time water-level sample. */
export interface ConcurrencySample {
  readonly at: number
  readonly bound: number
  readonly idle: number
  readonly warm: number
  readonly residents: number
}

/** The full measurement record of one simulation run. */
export class MetricsCollector {
  /** Modeled cold-start latencies (one per cold acquire). */
  readonly coldStartLatenciesMs: number[] = []
  /** Sampled task durations (one per task), for the M5 spec calibration. */
  readonly taskDurationsMs: number[] = []
  /** Concurrency/water-level samples, one per processed event. */
  readonly samples: ConcurrencySample[] = []

  taskSentTotal = 0
  taskSentWithLeave = 0
  taskCompletedTotal = 0
  taskCompletedAfterDisconnect = 0
  warmHits = 0
  coldAcquires = 0
  exhausted = 0
  peakResidents = 0
  peakBound = 0

  /** Record one modeled cold-start latency. */
  recordColdStart(latencyMs: number): void {
    this.coldStartLatenciesMs.push(latencyMs)
  }

  /** Record one sampled task duration. */
  recordTaskDuration(durationMs: number): void {
    this.taskDurationsMs.push(durationMs)
  }

  /** Mean of the sampled task durations, or 0 when no task ran. */
  get measuredTaskDurationMeanMs(): number {
    if (this.taskDurationsMs.length === 0) return 0
    const total = this.taskDurationsMs.reduce((sum, value) => sum + value, 0)
    return total / this.taskDurationsMs.length
  }

  /** Record one acquire result classification. */
  recordAcquire(warm: boolean): void {
    if (warm) this.warmHits += 1
    else this.coldAcquires += 1
  }

  /** Record one task send; `withLeave` means the page closed before completion. */
  recordTaskSent(withLeave: boolean): void {
    this.taskSentTotal += 1
    if (withLeave) this.taskSentWithLeave += 1
  }

  /** Record one task completion; `afterDisconnect` means the user had left. */
  recordTaskCompleted(afterDisconnect: boolean): void {
    this.taskCompletedTotal += 1
    if (afterDisconnect) this.taskCompletedAfterDisconnect += 1
  }

  /** Record one pool-exhausted acquire. */
  recordExhausted(): void {
    this.exhausted += 1
  }

  /** Record a water-level sample and refresh peaks. */
  sample(at: number, bound: number, idle: number, warm: number, residents: number): void {
    this.samples.push({ at, bound, idle, warm, residents })
    if (residents > this.peakResidents) this.peakResidents = residents
    if (bound > this.peakBound) this.peakBound = bound
  }
}
