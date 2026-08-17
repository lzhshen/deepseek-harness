/**
 * The "behaves like a real office worker" model: task durations, page-close
 * probability, and return intervals are sampled from configurable parameters
 * so the load simulator can be calibrated against the D5 workload profile.
 * @module @deepseek-ai/dsh-loadsim/behavior
 */

import { Rng } from './rng.ts'

/** The three sandbox sizes the M5 calibration compares. */
export type SandboxSpec = 0.25 | 0.5 | 1

/** Task-duration multiplier per sandbox spec: a smaller core is slower. */
export const SPEC_SLOWDOWN: Readonly<Record<SandboxSpec, number>> = {
  0.25: 4,
  0.5: 2,
  1: 1,
}

/** Configurable behavior distribution parameters. */
export interface BehaviorParams {
  /** Mean task duration in virtual milliseconds (office tasks: 1-2 minutes). */
  readonly taskDurationMeanMs: number
  /** Uniform half-width jitter around the mean task duration. */
  readonly taskDurationSpreadMs: number
  /** Probability a user closes the page before their task finishes. */
  readonly leaveProbability: number
  /** Mean virtual milliseconds until a user who left returns. */
  readonly returnDelayMeanMs: number
  /** Uniform half-width jitter around the mean return delay. */
  readonly returnDelaySpreadMs: number
}

function validateBehavior(params: BehaviorParams): void {
  for (const [name, value] of [
    ['taskDurationMeanMs', params.taskDurationMeanMs],
    ['taskDurationSpreadMs', params.taskDurationSpreadMs],
    ['returnDelayMeanMs', params.returnDelayMeanMs],
    ['returnDelaySpreadMs', params.returnDelaySpreadMs],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) throw new Error(`dsh-loadsim: ${name} must be a non-negative finite number`)
  }
  if (params.leaveProbability < 0 || params.leaveProbability > 1) {
    throw new Error('dsh-loadsim: leaveProbability must be in [0, 1]')
  }
}

/** Samples one virtual user's next behavior step from a seeded source. */
export class BehaviorModel {
  private readonly params: BehaviorParams
  private readonly rng: Rng

  /**
   * @param params - the behavior distribution.
   * @param seed - replayable seed.
   */
  constructor(params: BehaviorParams, seed: number) {
    validateBehavior(params)
    this.params = params
    this.rng = new Rng(seed)
  }

  /**
   * Sample a task duration for a sandbox spec.
   * @param spec - the sandbox size; smaller specs run slower.
   * @returns the virtual-millisecond duration, at least 1.
   */
  taskDurationMs(spec: SandboxSpec): number {
    const base = this.params.taskDurationMeanMs + this.rng.jitter(this.params.taskDurationSpreadMs)
    return Math.max(1, Math.round(base * SPEC_SLOWDOWN[spec]))
  }

  /** True when the user closes the page before their task finishes. */
  willLeave(): boolean {
    return this.rng.next() < this.params.leaveProbability
  }

  /** Virtual milliseconds until a departed user returns, at least 0. */
  returnDelayMs(): number {
    return Math.max(0, Math.round(this.params.returnDelayMeanMs + this.rng.jitter(this.params.returnDelaySpreadMs)))
  }
}
