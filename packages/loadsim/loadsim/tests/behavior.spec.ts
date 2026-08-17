import { describe, expect, it } from 'vitest'
import { BehaviorModel, SPEC_SLOWDOWN } from '../src/behavior.ts'
import { Rng } from '../src/rng.ts'

const params = {
  taskDurationMeanMs: 1000,
  taskDurationSpreadMs: 0,
  leaveProbability: 0.5,
  returnDelayMeanMs: 2000,
  returnDelaySpreadMs: 0,
}

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = new Rng(42)
    const b = new Rng(42)
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()])
  })

  it('stays within its declared ranges', () => {
    const rng = new Rng(7)
    for (let i = 0; i < 1000; i += 1) {
      const value = rng.next()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
      const integer = rng.int(3, 7)
      expect(integer).toBeGreaterThanOrEqual(3)
      expect(integer).toBeLessThanOrEqual(7)
      const jitter = rng.jitter(5)
      expect(jitter).toBeGreaterThanOrEqual(-5)
      expect(jitter).toBeLessThanOrEqual(5)
    }
  })
})

describe('BehaviorModel', () => {
  it('samples task durations around the mean, respecting the spec slowdown', () => {
    const model = new BehaviorModel(params, 1)
    expect(model.taskDurationMs(1)).toBe(1000)
    expect(model.taskDurationMs(0.5)).toBe(2000)
    expect(model.taskDurationMs(0.25)).toBe(4000)
  })

  it('never samples a duration below 1ms', () => {
    const model = new BehaviorModel({ ...params, taskDurationMeanMs: 0 }, 1)
    expect(model.taskDurationMs(1)).toBeGreaterThanOrEqual(1)
  })

  it('clamps return delays at zero', () => {
    const model = new BehaviorModel({ ...params, returnDelayMeanMs: 0, returnDelaySpreadMs: 500 }, 1)
    expect(model.returnDelayMs()).toBeGreaterThanOrEqual(0)
  })

  it('samples page-close decisions consistently with the probability', () => {
    const model = new BehaviorModel({ ...params, leaveProbability: 1 }, 1)
    expect(model.willLeave()).toBe(true)
    const never = new BehaviorModel({ ...params, leaveProbability: 0 }, 1)
    expect(never.willLeave()).toBe(false)
  })

  it('exposes the spec slowdown table', () => {
    expect(SPEC_SLOWDOWN).toEqual({ 0.25: 4, 0.5: 2, 1: 1 })
  })

  it('rejects an out-of-range leave probability', () => {
    expect(() => new BehaviorModel({ ...params, leaveProbability: 1.5 }, 1)).toThrow(/leaveProbability/)
  })

  it('rejects a negative mean duration', () => {
    expect(() => new BehaviorModel({ ...params, taskDurationMeanMs: -1 }, 1)).toThrow(/taskDurationMeanMs/)
  })
})
