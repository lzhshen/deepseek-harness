/**
 * V3 water-level transition: the pooled sandbox moves through bound → idle →
 * reclaim under the current user, and the pool stats reflect each stage — the
 * read-only panel's backing state machine (design V3). Uses a very short idle
 * timeout so the reclaim tick fires within the test without real wall-clock.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import TenantService from '@deepseek-ai/dsh-tenant'
import { PoolRuntime } from '../src/runtime.ts'

let base: string
let storage: string
let ctx: Context

async function boot(idleTimeoutMs: number): Promise<void> {
  ctx = new Context()
  await ctx.plugin(TenantService, { users: ['alice', 'bob'], defaultUserId: 'alice' })
  await ctx.plugin(PoolRuntime, {
    pool: { poolCapacity: 2, targetWarmCount: 1, idleTimeoutMs },
    storageRoot: storage,
    engineId: 'engine-v3',
  })
  await ctx.pool.refill()
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'dsh-pool-v3-'))
  storage = join(base, 'storage')
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('V3 pool water-level transition', () => {
  it('moves bound → idle → reclaim and reflects it in stats', async () => {
    await boot(1) // idle for 1ms, so the reclaim tick fires immediately after release.

    // Cold bind: alice claims the single warm sandbox.
    const binding = await ctx.pool.acquire('alice')
    expect(binding.warm).toBe(false)
    expect(ctx.pool.stats().bound).toBe(1)
    expect(ctx.pool.stats().warm).toBe(0)

    // Leave: the binding enters the idle keep-alive countdown.
    ctx.pool.release('alice')
    expect(ctx.pool.stats().idle).toBe(1)
    expect(ctx.pool.stats().bound).toBe(0)

    // Let the 1ms keep-alive expire before the reclaim tick (the pool clock is
    // wall-clock `Date.now`, so a real microdelay crosses the cutoff).
    await new Promise(resolve => setTimeout(resolve, 5))

    // Reclaim: the idle sandbox is destroyed and the warm pool refills.
    await ctx.pool.reclaim()
    expect(ctx.pool.stats().idle).toBe(0)
    expect(ctx.pool.stats().reclaimTotal).toBe(1)
    expect(ctx.pool.stats().warm).toBe(1)
  })

  it('rebinds the same sandbox on a warm hit (leave then return within keep-alive)', async () => {
    await boot(60_000) // a long keep-alive, so the sandbox stays idle.
    const first = await ctx.pool.acquire('alice')
    ctx.pool.release('alice')
    expect(ctx.pool.stats().idle).toBe(1)

    // Return: the idle sandbox is rebound rather than cold-claimed.
    const second = await ctx.pool.acquire('alice')
    expect(second.warm).toBe(true)
    expect(second.sandboxId).toBe(first.sandboxId)
    expect(ctx.pool.stats().bound).toBe(1)
    expect(ctx.pool.stats().idle).toBe(0)
  })
})
