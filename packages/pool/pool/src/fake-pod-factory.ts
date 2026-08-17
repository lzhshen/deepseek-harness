/**
 * In-process {@link PodFactory} that simulates the K8s substrate without a
 * cluster: it hands out deterministic sandbox ids and endpoints, records every
 * lifecycle call, and can inject latency so cold-start and warm-hit paths are
 * measurable. Used by the pool tests and the load simulator.
 * @module @deepseek-ai/dsh-pool/fake-pod-factory
 */

import { SandboxId } from './brand.ts'
import type { PodFactory, PodSpec } from './pod-factory.ts'

/** One recorded lifecycle call, in invocation order. */
export interface FakePodEvent {
  readonly kind: 'create' | 'mount' | 'destroy'
  readonly sandboxId: SandboxId
  readonly userId?: string
  readonly at: number
}

/** Tunables for the fake substrate. */
export interface FakePodFactoryConfig {
  /** Simulated create latency; contributes to a cold acquire's cost. */
  readonly createLatencyMs?: number
  /** Simulated user-directory mount latency; the dominant cold-start term. */
  readonly mountLatencyMs?: number
  /** Simulated destroy latency. */
  readonly destroyLatencyMs?: number
}

/** Fake Pod substrate with a recorded event log and optional injected latency. */
export class FakePodFactory implements PodFactory {
  private readonly config: Required<FakePodFactoryConfig>
  private counter = 0
  private readonly record: FakePodEvent[] = []

  constructor(config: FakePodFactoryConfig = {}) {
    const createLatencyMs = config.createLatencyMs ?? 0
    const mountLatencyMs = config.mountLatencyMs ?? 0
    const destroyLatencyMs = config.destroyLatencyMs ?? 0
    for (const [name, value] of [['createLatencyMs', createLatencyMs], ['mountLatencyMs', mountLatencyMs], ['destroyLatencyMs', destroyLatencyMs]] as const) {
      if (!Number.isFinite(value) || value < 0) throw new Error(`dsh-pool: ${name} must be a non-negative finite number`)
    }
    this.config = { createLatencyMs, mountLatencyMs, destroyLatencyMs }
  }

  /** All lifecycle calls in order; assertions read this, not Pod state. */
  get events(): readonly FakePodEvent[] {
    return this.record
  }

  /** The user mounted into each sandbox, for assertions. */
  get mountings(): ReadonlyMap<SandboxId, string> {
    const result = new Map<SandboxId, string>()
    for (const event of this.record) {
      if (event.kind === 'mount' && event.userId !== undefined) result.set(event.sandboxId, event.userId)
    }
    return result
  }

  async create(): Promise<PodSpec> {
    await delay(this.config.createLatencyMs)
    this.counter += 1
    const sandboxId = SandboxId(`pod-${this.counter}`)
    this.record.push({ kind: 'create', sandboxId, at: Date.now() })
    return { sandboxId, endpoint: `http://sandbox.local/${this.counter}` }
  }

  async mount(sandboxId: SandboxId, userId: string): Promise<void> {
    await delay(this.config.mountLatencyMs)
    this.record.push({ kind: 'mount', sandboxId, userId, at: Date.now() })
  }

  async destroy(sandboxId: SandboxId): Promise<void> {
    await delay(this.config.destroyLatencyMs)
    this.record.push({ kind: 'destroy', sandboxId, at: Date.now() })
  }
}

function delay(ms: number): Promise<void> {
  if (ms === 0) return Promise.resolve()
  return new Promise(resolve => setTimeout(resolve, ms))
}
