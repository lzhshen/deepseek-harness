import { describe, expect, it } from 'vitest'
import { BindingKey, EngineId, SandboxId } from '../src/brand.ts'
import { FakePodFactory } from '../src/fake-pod-factory.ts'
import { MemoryLedger } from '../src/memory-ledger.ts'
import type { PodFactory, PodSpec } from '../src/pod-factory.ts'
import { PoolManager } from '../src/pool-manager.ts'
import { PoolExhaustedError } from '../src/types.ts'

const keyA = BindingKey('user-a')
const keyB = BindingKey('user-b')
const engineA = EngineId('engine-a')

interface Setup {
  manager: PoolManager
  ledger: MemoryLedger
  factory: FakePodFactory
  clock: { now: number }
}

function setup(overrides: Partial<{ poolCapacity: number; targetWarmCount: number; idleTimeoutMs: number }> = {}): Setup {
  const clock = { now: 1000 }
  const ledger = new MemoryLedger()
  const factory = new FakePodFactory()
  const manager = new PoolManager(
    {
      poolCapacity: overrides.poolCapacity ?? 4,
      targetWarmCount: overrides.targetWarmCount ?? 2,
      idleTimeoutMs: overrides.idleTimeoutMs ?? 500,
    },
    ledger,
    factory,
    () => clock.now,
  )
  return { manager, ledger, factory, clock }
}

describe('PoolManager acquire', () => {
  it('serves a cold acquire from the warm pool and mounts the user directory', async () => {
    const { manager, factory } = setup()
    await manager.refillTick()
    const result = await manager.acquire(keyA, 'user-a', engineA)
    expect(result.warm).toBe(false)
    expect(result.sandboxId).toBe('pod-1')
    expect(result.endpoint).toBe('http://sandbox.local/1')
    expect(factory.mountings.get(result.sandboxId)).toBe('user-a')
    expect(manager.stats()).toMatchObject({ warm: 1, bound: 1, coldAcquireTotal: 1, acquireTotal: 1 })
  })

  it('serves a warm hit by rebinding an IDLE sandbox', async () => {
    const { manager } = setup()
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    manager.reportIdle(keyA)
    const result = await manager.acquire(keyA, 'user-a', EngineId('engine-b'))
    expect(result.warm).toBe(true)
    expect(result.sandboxId).toBe('pod-1')
    expect(manager.stats()).toMatchObject({ warmHitTotal: 1, coldAcquireTotal: 1, acquireTotal: 2 })
  })

  it('throws PoolExhaustedError when the pool is full and warm is empty', async () => {
    const { manager } = setup({ poolCapacity: 1, targetWarmCount: 1 })
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    await expect(manager.acquire(keyB, 'user-b', engineA)).rejects.toBeInstanceOf(PoolExhaustedError)
    expect(manager.stats().exhaustedTotal).toBe(1)
  })

  it('does not throw while a warm sandbox remains even at capacity', async () => {
    const { manager } = setup({ poolCapacity: 2, targetWarmCount: 2 })
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    // One warm remains: a second distinct key is still served.
    await expect(manager.acquire(keyB, 'user-b', engineA)).resolves.toMatchObject({ warm: false })
  })

  it('rolls back the binding when the mount fails and refills the warm pool', async () => {
    const failing: PodFactory = {
      async create(): Promise<PodSpec> {
        return { sandboxId: SandboxId('pod-1'), endpoint: 'http://s/1' }
      },
      async mount(): Promise<void> {
        throw new Error('mount boom')
      },
      async destroy(): Promise<void> {},
    }
    const ledger = new MemoryLedger()
    const manager = new PoolManager({ poolCapacity: 2, targetWarmCount: 1, idleTimeoutMs: 500 }, ledger, failing, () => 1000)
    await manager.refillTick()
    await expect(manager.acquire(keyA, 'user-a', engineA)).rejects.toThrow('mount boom')
    expect(ledger.counts()).toEqual({ warm: 1, bound: 0, idle: 0, reclaiming: 0 })
    expect(manager.stats().reclaimTotal).toBe(1)
  })
})

describe('PoolManager lifecycle', () => {
  it('release aliases reportIdle and starts the idle countdown', async () => {
    const { manager, ledger } = setup()
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    expect(manager.release(keyA)).toBe(true)
    expect(ledger.find(keyA)?.state).toBe('idle')
    expect(manager.reportIdle(keyA)).toBe(false)
  })

  it('heartbeat keeps a binding active and resets the clock', async () => {
    const { manager, ledger, clock } = setup()
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    clock.now = 1500
    expect(manager.heartbeat(keyA)).toBe(true)
    expect(ledger.find(keyA)?.record.lastActiveAt).toBe(1500)
    expect(manager.heartbeat(BindingKey('nobody'))).toBe(false)
  })
})

describe('PoolManager schedulers', () => {
  it('refillTick tops up the warm pool to target without exceeding capacity', async () => {
    const { manager, ledger } = setup({ poolCapacity: 3, targetWarmCount: 2 })
    await manager.refillTick()
    expect(ledger.counts()).toEqual({ warm: 2, bound: 0, idle: 0, reclaiming: 0 })
    await manager.acquire(keyA, 'user-a', engineA)
    const created = await manager.refillTick()
    expect(created).toBe(1)
    expect(ledger.counts().warm).toBe(2)
  })

  it('refillTick stops at capacity when bound sandboxes consume it', async () => {
    const { manager, ledger } = setup({ poolCapacity: 1, targetWarmCount: 1 })
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    // The sole slot is BOUND: refill cannot create past capacity.
    const created = await manager.refillTick()
    expect(created).toBe(0)
    expect(ledger.counts().warm).toBe(0)
  })

  it('reclaimTick reclaims idle sandboxes past the timeout and refills', async () => {
    const { manager, ledger, clock } = setup({ poolCapacity: 2, targetWarmCount: 1, idleTimeoutMs: 500 })
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    manager.reportIdle(keyA)
    clock.now = 1600 // idle since 1000; 600ms elapsed > 500ms timeout
    const outcome = await manager.reclaimTick()
    expect(outcome.reclaimed).toBe(1)
    expect(outcome.created).toBe(1)
    expect(ledger.counts()).toEqual({ warm: 1, bound: 0, idle: 0, reclaiming: 0 })
    expect(manager.stats().reclaimTotal).toBe(1)
  })

  it('reclaimTick leaves idle sandboxes inside the window untouched', async () => {
    const { manager, ledger, clock } = setup({ idleTimeoutMs: 500 })
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    manager.reportIdle(keyA)
    clock.now = 1400 // 400ms elapsed
    const outcome = await manager.reclaimTick()
    expect(outcome.reclaimed).toBe(0)
    expect(ledger.counts().idle).toBe(1)
  })

  it('orphanTick reclaims bindings whose engine died and refills', async () => {
    const { manager, ledger } = setup({ targetWarmCount: 1 })
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    const outcome = await manager.orphanTick(new Set([EngineId('engine-alive')]))
    expect(outcome.reclaimed).toBe(1)
    expect(ledger.counts()).toEqual({ warm: 1, bound: 0, idle: 0, reclaiming: 0 })
  })

  it('orphanTick spares bindings whose engine is still alive', async () => {
    const { manager, ledger } = setup()
    await manager.refillTick()
    await manager.acquire(keyA, 'user-a', engineA)
    await manager.orphanTick(new Set([engineA]))
    expect(ledger.counts().bound).toBe(1)
  })
})

describe('PoolManager config validation', () => {
  it('rejects a non-positive poolCapacity', () => {
    expect(() => new PoolManager({ poolCapacity: 0, targetWarmCount: 0, idleTimeoutMs: 100 }, new MemoryLedger(), new FakePodFactory()))
      .toThrow(/poolCapacity/)
  })

  it('rejects targetWarmCount above poolCapacity', () => {
    expect(() => new PoolManager({ poolCapacity: 2, targetWarmCount: 3, idleTimeoutMs: 100 }, new MemoryLedger(), new FakePodFactory()))
      .toThrow(/targetWarmCount/)
  })

  it('rejects a non-positive idleTimeoutMs', () => {
    expect(() => new PoolManager({ poolCapacity: 2, targetWarmCount: 0, idleTimeoutMs: 0 }, new MemoryLedger(), new FakePodFactory()))
      .toThrow(/idleTimeoutMs/)
  })
})
