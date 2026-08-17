import { describe, expect, it } from 'vitest'
import { MetricsCollector } from '../src/metrics.ts'
import { percentile } from '../src/report.ts'

describe('MetricsCollector', () => {
  it('tracks the task accounting', () => {
    const metrics = new MetricsCollector()
    metrics.recordTaskSent(true)
    metrics.recordTaskSent(false)
    metrics.recordTaskCompleted(true)
    metrics.recordTaskCompleted(false)
    expect(metrics.taskSentTotal).toBe(2)
    expect(metrics.taskSentWithLeave).toBe(1)
    expect(metrics.taskCompletedAfterDisconnect).toBe(1)
  })

  it('tracks the acquire mix', () => {
    const metrics = new MetricsCollector()
    metrics.recordAcquire(false)
    metrics.recordAcquire(true)
    metrics.recordAcquire(true)
    expect(metrics.coldAcquires).toBe(1)
    expect(metrics.warmHits).toBe(2)
  })

  it('computes the mean sampled task duration', () => {
    const metrics = new MetricsCollector()
    metrics.recordTaskDuration(1000)
    metrics.recordTaskDuration(2000)
    expect(metrics.measuredTaskDurationMeanMs).toBe(1500)
    expect(new MetricsCollector().measuredTaskDurationMeanMs).toBe(0)
  })

  it('updates peaks from samples', () => {
    const metrics = new MetricsCollector()
    metrics.sample(1, 2, 1, 0, 5)
    metrics.sample(2, 4, 0, 1, 3)
    expect(metrics.peakBound).toBe(4)
    expect(metrics.peakResidents).toBe(5)
  })
})

describe('percentile', () => {
  it('returns undefined for an empty sample', () => {
    expect(percentile([], 0.95)).toBeUndefined()
  })

  it('computes the nearest-rank p95', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    expect(percentile(sorted, 0.95)).toBe(10)
    expect(percentile(sorted, 0.5)).toBe(5)
  })
})
