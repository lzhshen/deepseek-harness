import { describe, expect, it } from 'vitest'
import { BindingKey, EngineId, SandboxId } from '../src/brand.ts'
import { Sandbox, SandboxStateError } from '../src/sandbox.ts'

const now = 1000
const key = BindingKey('user-1')
const engine = EngineId('engine-a')

describe('Sandbox state machine', () => {
  it('creates a WARM sandbox with no binding', () => {
    const sandbox = Sandbox.warm(SandboxId('pod-1'), 'http://s', now)
    expect(sandbox.state).toBe('warm')
    expect(sandbox.record.bindingKey).toBeUndefined()
    expect(sandbox.record.engineId).toBeUndefined()
    expect(sandbox.record.userId).toBeUndefined()
    expect(sandbox.endpoint).toBe('http://s')
  })

  it('binds a WARM sandbox into BOUND with the full binding', () => {
    const bound = Sandbox.warm(SandboxId('pod-1'), 'http://s', now).bind(key, engine, 'user-1', now + 10)
    expect(bound.state).toBe('bound')
    expect(bound.record.bindingKey).toBe(key)
    expect(bound.record.engineId).toBe(engine)
    expect(bound.record.userId).toBe('user-1')
    expect(bound.record.lastActiveAt).toBe(now + 10)
  })

  it('idles a BOUND sandbox and drops the engineId', () => {
    const bound = Sandbox.warm(SandboxId('pod-1'), 'http://s', now).bind(key, engine, 'user-1', now)
    const idle = bound.idle(now + 20)
    expect(idle.state).toBe('idle')
    expect(idle.record.bindingKey).toBe(key)
    expect(idle.record.userId).toBe('user-1')
    expect(idle.record.engineId).toBeUndefined()
    expect(idle.record.lastActiveAt).toBe(now + 20)
  })

  it('rebinds an IDLE sandbox to a new engine keeping the binding', () => {
    const idle = Sandbox.warm(SandboxId('pod-1'), 'http://s', now).bind(key, engine, 'user-1', now).idle(now)
    const rebound = idle.rebind(EngineId('engine-b'), now + 30)
    expect(rebound.state).toBe('bound')
    expect(rebound.record.engineId).toBe('engine-b')
    expect(rebound.record.bindingKey).toBe(key)
    expect(rebound.record.userId).toBe('user-1')
  })

  it('touches BOUND and IDLE without changing state', () => {
    const bound = Sandbox.warm(SandboxId('pod-1'), 'http://s', now).bind(key, engine, 'user-1', now)
    expect(bound.touch(now + 5).state).toBe('bound')
    expect(bound.touch(now + 5).record.lastActiveAt).toBe(now + 5)
    const idle = bound.idle(now)
    expect(idle.touch(now + 6).state).toBe('idle')
    expect(idle.touch(now + 6).record.lastActiveAt).toBe(now + 6)
  })

  it('reclaims a BOUND sandbox and drops all binding fields', () => {
    const bound = Sandbox.warm(SandboxId('pod-1'), 'http://s', now).bind(key, engine, 'user-1', now)
    const reclaiming = bound.reclaim(now + 40)
    expect(reclaiming.state).toBe('reclaiming')
    expect(reclaiming.record.bindingKey).toBeUndefined()
    expect(reclaiming.record.engineId).toBeUndefined()
    expect(reclaiming.record.userId).toBeUndefined()
  })

  it('reclaims an IDLE sandbox too', () => {
    const idle = Sandbox.warm(SandboxId('pod-1'), 'http://s', now).bind(key, engine, 'user-1', now).idle(now)
    expect(idle.reclaim(now).state).toBe('reclaiming')
  })

  it.each([
    ['bind from idle', (s: Sandbox) => s.idle(now).bind(key, engine, 'user-1', now)],
    ['bind from bound', (s: Sandbox) => s.bind(key, engine, 'user-1', now).bind(key, engine, 'user-1', now)],
    ['idle from warm', (s: Sandbox) => s.idle(now)],
    ['idle from idle', (s: Sandbox) => s.bind(key, engine, 'user-1', now).idle(now).idle(now)],
    ['rebind from warm', (s: Sandbox) => s.rebind(engine, now)],
    ['rebind from bound', (s: Sandbox) => s.bind(key, engine, 'user-1', now).rebind(engine, now)],
    ['touch from warm', (s: Sandbox) => s.touch(now)],
    ['reclaim from warm', (s: Sandbox) => s.reclaim(now)],
    ['reclaim from reclaiming', (s: Sandbox) => s.bind(key, engine, 'user-1', now).reclaim(now).reclaim(now)],
  ] as const)('rejects %s', (_label, act) => {
    const sandbox = Sandbox.warm(SandboxId('pod-1'), 'http://s', now)
    expect(() => act(sandbox)).toThrow(SandboxStateError)
  })

  it('reports the offending sandbox and transition in the guard error', () => {
    const sandbox = Sandbox.warm(SandboxId('pod-1'), 'http://s', now)
    try {
      sandbox.idle(now)
      expect.unreachable('expected idle from warm to throw')
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(SandboxStateError)
      expect((error as SandboxStateError).code).toBe('SANDBOX_STATE')
      expect((error as SandboxStateError).message).toContain('pod-1')
      expect((error as SandboxStateError).message).toContain('warm -> idle')
    }
  })
})
