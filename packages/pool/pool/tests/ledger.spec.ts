import { describe, expect, it } from 'vitest'
import { BindingKey, EngineId, SandboxId } from '../src/brand.ts'
import { MemoryLedger } from '../src/memory-ledger.ts'
import { Sandbox } from '../src/sandbox.ts'

const keyA = BindingKey('user-a')
const keyB = BindingKey('user-b')
const engineA = EngineId('engine-a')

function warmLedger(count: number, start = 1000): MemoryLedger {
  const ledger = new MemoryLedger()
  for (let i = 1; i <= count; i += 1) {
    ledger.addWarm(Sandbox.warm(SandboxId(`pod-${i}`), `http://s/${i}`, start + i))
  }
  return ledger
}

describe('MemoryLedger', () => {
  it('counts warm sandboxes as they join', () => {
    const ledger = warmLedger(3)
    expect(ledger.counts()).toEqual({ warm: 3, bound: 0, idle: 0, reclaiming: 0 })
    expect(ledger.count('warm')).toBe(3)
  })

  it('claims the oldest WARM sandbox first (FIFO)', () => {
    const ledger = warmLedger(2)
    const claimed = ledger.claimWarm(keyA, engineA, 'user-a', 2000)
    expect(claimed?.sandboxId).toBe('pod-1')
    expect(claimed?.state).toBe('bound')
    expect(ledger.counts()).toEqual({ warm: 1, bound: 1, idle: 0, reclaiming: 0 })
  })

  it('refuses to claim a key that is already held', () => {
    const ledger = warmLedger(2)
    ledger.claimWarm(keyA, engineA, 'user-a', 2000)
    expect(() => ledger.claimWarm(keyA, EngineId('engine-b'), 'user-a', 2000)).toThrow(/already held/)
  })

  it('returns undefined when the warm pool is empty', () => {
    const ledger = new MemoryLedger()
    expect(ledger.claimWarm(keyA, engineA, 'user-a', 2000)).toBeUndefined()
  })

  it('rebinds an IDLE sandbox to a new engine', () => {
    const ledger = warmLedger(1)
    ledger.claimWarm(keyA, engineA, 'user-a', 2000)
    ledger.markIdle(keyA, 3000)
    const rebound = ledger.rebindIdle(keyA, EngineId('engine-b'), 4000)
    expect(rebound?.state).toBe('bound')
    expect(rebound?.record.engineId).toBe('engine-b')
    expect(ledger.counts()).toEqual({ warm: 0, bound: 1, idle: 0, reclaiming: 0 })
  })

  it('returns undefined rebinding a key with no IDLE sandbox', () => {
    const ledger = new MemoryLedger()
    expect(ledger.rebindIdle(keyA, engineA, 2000)).toBeUndefined()
  })

  it('marks a BOUND sandbox IDLE and keeps it findable', () => {
    const ledger = warmLedger(1)
    ledger.claimWarm(keyA, engineA, 'user-a', 2000)
    const idle = ledger.markIdle(keyA, 3000)
    expect(idle?.state).toBe('idle')
    expect(ledger.find(keyA)?.state).toBe('idle')
    expect(ledger.counts()).toEqual({ warm: 0, bound: 0, idle: 1, reclaiming: 0 })
  })

  it('touches a binding to reset its activity clock', () => {
    const ledger = warmLedger(1)
    ledger.claimWarm(keyA, engineA, 'user-a', 2000)
    expect(ledger.touch(keyA, 2500)?.record.lastActiveAt).toBe(2500)
    ledger.markIdle(keyA, 3000)
    expect(ledger.touch(keyA, 3500)?.record.lastActiveAt).toBe(3500)
  })

  it('returns undefined for find on an unknown key', () => {
    expect(new MemoryLedger().find(keyA)).toBeUndefined()
  })

  it('marks a sandbox RECLAIMING and releases its binding', () => {
    const ledger = warmLedger(1)
    const claimed = ledger.claimWarm(keyA, engineA, 'user-a', 2000)!
    const reclaiming = ledger.markReclaiming(claimed.sandboxId, 4000)
    expect(reclaiming?.state).toBe('reclaiming')
    expect(ledger.find(keyA)).toBeUndefined()
    expect(ledger.counts()).toEqual({ warm: 0, bound: 0, idle: 0, reclaiming: 1 })
  })

  it('removes a RECLAIMING sandbox only', () => {
    const ledger = warmLedger(1)
    const claimed = ledger.claimWarm(keyA, engineA, 'user-a', 2000)!
    const reclaiming = ledger.markReclaiming(claimed.sandboxId, 4000)!
    expect(ledger.remove(reclaiming.sandboxId)?.state).toBe('reclaiming')
    expect(ledger.counts().reclaiming).toBe(0)
    expect(ledger.remove(SandboxId('missing'))).toBeUndefined()
    const warm = warmLedger(1)
    expect(() => warm.remove(SandboxId('pod-1'))).toThrow(/RECLAIMING/)
  })

  it('sweeps only IDLE sandboxes inactive past the cutoff', () => {
    const ledger = warmLedger(2)
    ledger.claimWarm(keyA, engineA, 'user-a', 1000)
    ledger.claimWarm(keyB, engineA, 'user-b', 1000)
    ledger.markIdle(keyA, 2000)
    ledger.markIdle(keyB, 5000)
    const swept = ledger.sweepIdle(3000, 6000)
    expect(swept.map(s => s.sandboxId)).toEqual(['pod-1'])
    expect(ledger.counts()).toEqual({ warm: 0, bound: 0, idle: 1, reclaiming: 1 })
  })

  it('sweeps only BOUND sandboxes whose engine is dead', () => {
    const ledger = warmLedger(2)
    ledger.claimWarm(keyA, engineA, 'user-a', 1000)
    ledger.claimWarm(keyB, EngineId('engine-b'), 'user-b', 1000)
    const swept = ledger.sweepOrphans(new Set([EngineId('engine-b')]), 6000)
    expect(swept.map(s => s.sandboxId)).toEqual(['pod-1'])
    expect(ledger.counts()).toEqual({ warm: 0, bound: 1, idle: 0, reclaiming: 1 })
  })

  it('enforces one binding key across bound and idle states', () => {
    const ledger = warmLedger(2)
    ledger.claimWarm(keyA, engineA, 'user-a', 2000)
    // The key is BOUND; a second claim for the same key must fail loud.
    expect(() => ledger.claimWarm(keyA, EngineId('engine-b'), 'user-a', 3000)).toThrow(/already held/)
  })
})
