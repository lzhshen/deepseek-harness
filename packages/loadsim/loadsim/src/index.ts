/**
 * dsh-loadsim: the load simulator that drives the pool and residency through
 * the public acquire/reportIdle calls and produces the M1-M5 acceptance
 * report. A pure library with a deterministic discrete-event engine; run
 * {@link runPocDemo} for a worked example, or {@link LoadDriver} directly.
 * @module @deepseek-ai/dsh-loadsim
 */

export { mulberry32, Rng } from './rng.ts'
export type { BehaviorParams, SandboxSpec } from './behavior.ts'
export { SPEC_SLOWDOWN, BehaviorModel } from './behavior.ts'
export type { ConcurrencySample } from './metrics.ts'
export { MetricsCollector } from './metrics.ts'
export type { LoadPlan, SimResult } from './driver.ts'
export { LoadDriver } from './driver.ts'
export type {
  AcceptanceReport,
  M1Capacity,
  M2ColdStart,
  M3ClosePage,
  M4Density,
  M5Spec,
  ReportOptions,
} from './report.ts'
export { generateReport, percentile } from './report.ts'
export { runPocDemo } from './demo.ts'
