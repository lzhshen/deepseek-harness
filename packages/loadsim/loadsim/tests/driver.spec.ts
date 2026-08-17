import { describe, expect, it } from 'vitest'
import { LoadDriver } from '../src/driver.ts'
import type { LoadPlan } from '../src/driver.ts'
import { runPocDemo } from '../src/demo.ts'
import { generateReport } from '../src/report.ts'

function smallPlan(overrides: Partial<LoadPlan> = {}): LoadPlan {
  return {
    poolCapacity: 4,
    targetWarmCount: 1,
    idleTimeoutMs: 60_000,
    residencyIdleTimeoutMs: 30 * 60_000,
    maxResidents: 10,
    behavior: {
      taskDurationMeanMs: 1000,
      taskDurationSpreadMs: 0,
      leaveProbability: 1,
      returnDelayMeanMs: 2000,
      returnDelaySpreadMs: 0,
    },
    coldStartLatencyMs: 5000,
    spec: 1,
    seed: 7,
    userCount: 3,
    totalDurationMs: 5000,
    poolTickIntervalMs: 500,
    exhaustedRetryDelayMs: 100,
    thinkDelayMs: 100,
    ...overrides,
  }
}

describe('LoadDriver', () => {
  it('replays the same seed identically', async () => {
    const first = await new LoadDriver(smallPlan()).run()
    const second = await new LoadDriver(smallPlan()).run()
    expect(first.metrics).toEqual(second.metrics)
    expect(first.poolStats).toEqual(second.poolStats)
    expect(first.residencyStats).toEqual(second.residencyStats)
  })

  it('never exceeds pool capacity across warm, bound, and idle', async () => {
    const result = await new LoadDriver(smallPlan()).run()
    for (const sample of result.metrics.samples) {
      expect(sample.warm + sample.bound + sample.idle).toBeLessThanOrEqual(result.poolStats.capacity)
    }
  })

  it('completes every page-closed task after disconnect', async () => {
    const result = await new LoadDriver(smallPlan()).run()
    expect(result.metrics.taskSentWithLeave).toBeGreaterThan(0)
    expect(result.metrics.taskCompletedAfterDisconnect).toBe(result.metrics.taskSentWithLeave)
  })

  it('serves warm hits after the first round of cold acquires', async () => {
    const result = await new LoadDriver(smallPlan()).run()
    expect(result.metrics.coldAcquires).toBeGreaterThan(0)
    expect(result.metrics.warmHits).toBeGreaterThan(0)
  })

  it('keeps resident sessions under the residency cap', async () => {
    const result = await new LoadDriver(smallPlan()).run()
    expect(result.metrics.peakResidents).toBeLessThanOrEqual(result.residencyStats.maxResidents)
  })

  it('records exhaustion when the pool is too small for the load', async () => {
    const result = await new LoadDriver(smallPlan({ poolCapacity: 1, targetWarmCount: 0, userCount: 3 })).run()
    expect(result.metrics.exhausted).toBeGreaterThan(0)
  })

  it('validates an invalid plan loudly', () => {
    expect(() => new LoadDriver(smallPlan({ totalDurationMs: 0 }))).toThrow(/totalDurationMs/)
    expect(() => new LoadDriver(smallPlan({ poolTickIntervalMs: 0 }))).toThrow(/poolTickIntervalMs/)
    expect(() => new LoadDriver(smallPlan({ userCount: -1 }))).toThrow(/userCount/)
  })
})

describe('runPocDemo and report', () => {
  it('produces a full M1-M5 acceptance report', async () => {
    const report = await runPocDemo()
    expect(report.m1).toBeDefined()
    expect(report.m2).toBeDefined()
    expect(report.m3).toBeDefined()
    expect(report.m4).toBeDefined()
    expect(report.m5.map(entry => entry.spec)).toEqual([0.25, 0.5, 1])
    expect(report.summary).toHaveLength(5)
    expect(report.m3.passed).toBe(true)
  })

  it('computes M2 from the modeled cold-start latency', async () => {
    const result = await new LoadDriver(smallPlan({ coldStartLatencyMs: 8000 })).run()
    const report = generateReport(result)
    expect(report.m2.p95Ms).toBe(8000)
    expect(report.m2.passed).toBe(true)
  })

  it('marks M3 passed only when every page-closed task completed', async () => {
    const result = await new LoadDriver(smallPlan()).run()
    expect(generateReport(result).m3.passed).toBe(true)
  })
})
