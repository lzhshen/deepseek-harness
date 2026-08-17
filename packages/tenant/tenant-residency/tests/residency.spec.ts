import { describe, expect, it } from 'vitest'
import { EngineId } from '@deepseek-ai/dsh-pool'
import { SessionId } from '../src/brand.ts'
import { ResidencyRegistry } from '../src/residency.ts'

const engineA = EngineId('engine-a')
const engineB = EngineId('engine-b')

function setup(overrides: Partial<{ maxResidents: number; idleTimeoutMs: number }> = {}) {
  const clock = { now: 1000 }
  const registry = new ResidencyRegistry(
    { maxResidents: overrides.maxResidents ?? 4, idleTimeoutMs: overrides.idleTimeoutMs ?? 500 },
    () => clock.now,
  )
  return { registry, clock }
}

describe('ResidencyRegistry claim', () => {
  it('claims a new session for this replica', () => {
    const { registry } = setup()
    const outcome = registry.claim(SessionId('s1'), engineA, 'user-a')
    expect(outcome.acquired).toBe(true)
    expect(outcome.resident).toMatchObject({ sessionId: 's1', engineId: engineA, userId: 'user-a' })
    expect(outcome.redirectedTo).toBeUndefined()
    expect(outcome.evicted).toEqual([])
    expect(registry.size).toBe(1)
  })

  it('redirects a second claim of the same session to the owner', () => {
    const { registry } = setup()
    registry.claim(SessionId('s1'), engineA, 'user-a')
    const outcome = registry.claim(SessionId('s1'), engineB, 'user-a')
    expect(outcome.acquired).toBe(false)
    expect(outcome.redirectedTo).toBe(engineA)
    expect(outcome.resident.engineId).toBe(engineA)
    expect(registry.size).toBe(1)
    expect(registry.stats()).toMatchObject({ claimTotal: 2, acquiredTotal: 1, redirectTotal: 1 })
  })

  it('evicts the least-recently-active resident when at capacity', () => {
    const { registry, clock } = setup({ maxResidents: 2 })
    registry.claim(SessionId('s1'), engineA, 'user-a')
    clock.now = 2000
    registry.claim(SessionId('s2'), engineA, 'user-b')
    clock.now = 3000
    const outcome = registry.claim(SessionId('s3'), engineA, 'user-c')
    expect(outcome.acquired).toBe(true)
    expect(outcome.evicted.map(r => r.sessionId)).toEqual(['s1'])
    expect(registry.size).toBe(2)
    expect(registry.find(SessionId('s1'))).toBeUndefined()
  })

  it('does not evict when below capacity', () => {
    const { registry } = setup({ maxResidents: 4 })
    registry.claim(SessionId('s1'), engineA, 'user-a')
    const outcome = registry.claim(SessionId('s2'), engineA, 'user-b')
    expect(outcome.evicted).toEqual([])
    expect(registry.size).toBe(2)
  })
})

describe('ResidencyRegistry lifecycle', () => {
  it('releases a resident exactly once', () => {
    const { registry } = setup()
    registry.claim(SessionId('s1'), engineA, 'user-a')
    expect(registry.release(SessionId('s1'))).toBe(true)
    expect(registry.release(SessionId('s1'))).toBe(false)
    expect(registry.size).toBe(0)
  })

  it('touches a resident to refresh its activity clock', () => {
    const { registry, clock } = setup()
    registry.claim(SessionId('s1'), engineA, 'user-a')
    clock.now = 2500
    expect(registry.touch(SessionId('s1'))).toBe(true)
    expect(registry.find(SessionId('s1'))?.lastActiveAt).toBe(2500)
    expect(registry.touch(SessionId('nobody'))).toBe(false)
  })

  it('evicts idle residents past the cutoff, oldest first', () => {
    const { registry, clock } = setup()
    registry.claim(SessionId('s1'), engineA, 'user-a')
    clock.now = 2000
    registry.claim(SessionId('s2'), engineA, 'user-b')
    const evicted = registry.evictIdle(1500)
    expect(evicted.map(r => r.sessionId)).toEqual(['s1'])
    expect(registry.size).toBe(1)
    expect(registry.stats().evictedTotal).toBe(1)
  })

  it('evicts a requested number of least-recently-active residents', () => {
    const { registry, clock } = setup()
    registry.claim(SessionId('s1'), engineA, 'user-a')
    clock.now = 2000
    registry.claim(SessionId('s2'), engineA, 'user-b')
    clock.now = 3000
    registry.claim(SessionId('s3'), engineA, 'user-c')
    const evicted = registry.evictLru(2)
    expect(evicted.map(r => r.sessionId)).toEqual(['s1', 's2'])
    expect(registry.size).toBe(1)
  })

  it('lists residents and reports stats', () => {
    const { registry } = setup()
    registry.claim(SessionId('s1'), engineA, 'user-a')
    registry.claim(SessionId('s2'), engineA, 'user-b')
    expect(registry.list()).toHaveLength(2)
    expect(registry.stats()).toMatchObject({ residents: 2, maxResidents: 4 })
  })
})

describe('ResidencyRegistry config validation', () => {
  it('rejects a non-positive maxResidents', () => {
    expect(() => new ResidencyRegistry({ maxResidents: 0, idleTimeoutMs: 100 }))
      .toThrow(/maxResidents/)
  })

  it('rejects a non-positive idleTimeoutMs', () => {
    expect(() => new ResidencyRegistry({ maxResidents: 4, idleTimeoutMs: 0 }))
      .toThrow(/idleTimeoutMs/)
  })

  it('rejects a negative evictLru count', () => {
    const { registry } = setup()
    expect(() => registry.evictLru(-1)).toThrow(/count/)
  })
})
