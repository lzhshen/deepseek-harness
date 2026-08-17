/**
 * A worked POC scenario: a scaled-down pool serving a population of office
 * workers, plus the resulting M1-M5 acceptance report. Virtual durations are
 * chosen so the demo runs instantly while still exercising warm hits, page
 * closes, reclaims, and cold starts.
 * @module @deepseek-ai/dsh-loadsim/demo
 */

import type { LoadPlan } from './driver.ts'
import { LoadDriver } from './driver.ts'
import type { AcceptanceReport } from './report.ts'
import { generateReport } from './report.ts'

/** A representative scaled-down POC scenario. */
export function pocPlan(): LoadPlan {
  return {
    poolCapacity: 24,
    targetWarmCount: 4,
    idleTimeoutMs: 60_000,
    residencyIdleTimeoutMs: 30 * 60_000,
    maxResidents: 100,
    behavior: {
      taskDurationMeanMs: 60_000,
      taskDurationSpreadMs: 20_000,
      leaveProbability: 0.5,
      returnDelayMeanMs: 90_000,
      returnDelaySpreadMs: 30_000,
    },
    coldStartLatencyMs: 8000,
    spec: 1,
    seed: 42,
    userCount: 24,
    totalDurationMs: 600_000,
    poolTickIntervalMs: 10_000,
    exhaustedRetryDelayMs: 5_000,
    thinkDelayMs: 2_000,
  }
}

/**
 * Run the worked POC scenario and return its acceptance report.
 * @returns the M1-M5 report for the scenario.
 */
export async function runPocDemo(): Promise<AcceptanceReport> {
  const result = await new LoadDriver(pocPlan()).run()
  return generateReport(result)
}
