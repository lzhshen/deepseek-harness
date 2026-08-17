import { describe, expect, it } from 'vitest'
import { SandboxId } from '../src/brand.ts'
import { FakePodFactory } from '../src/fake-pod-factory.ts'

describe('FakePodFactory', () => {
  it('hands out deterministic ids and endpoints', async () => {
    const factory = new FakePodFactory()
    const first = await factory.create()
    const second = await factory.create()
    expect(first).toEqual({ sandboxId: SandboxId('pod-1'), endpoint: 'http://sandbox.local/1' })
    expect(second.sandboxId).toBe('pod-2')
  })

  it('records create/mount/destroy in invocation order', async () => {
    const factory = new FakePodFactory()
    const spec = await factory.create()
    await factory.mount(spec.sandboxId, 'user-a')
    await factory.destroy(spec.sandboxId)
    expect(factory.events.map(e => e.kind)).toEqual(['create', 'mount', 'destroy'])
    expect(factory.events[1]?.userId).toBe('user-a')
    expect(factory.mountings.get(spec.sandboxId)).toBe('user-a')
  })

  it('rejects a negative injected latency', () => {
    expect(() => new FakePodFactory({ mountLatencyMs: -1 })).toThrow(/mountLatencyMs/)
  })
})
