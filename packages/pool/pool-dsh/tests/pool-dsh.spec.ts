/**
 * Tests for the pooled-sandbox DSH assembly: the `ctx.pool` service hosting the
 * pure pool manager, and the `ctx.fs`/`ctx.subprocess` providers routing into a
 * per-user pooled directory. This suite proves the DSH claim the pure library
 * alone could not — that the pool and its two seam providers actually live on a
 * Cordis context and route real operations.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { PoolRuntime } from '../src/runtime.ts'
import { PoolFileSystem } from '../src/fs.ts'
import { PoolSubprocess } from '../src/subprocess.ts'

let base: string
let storage: string
let alice: string
let ctx: Context
let fiber: Awaited<ReturnType<Context['plugin']>>

async function boot(): Promise<void> {
  ctx = new Context()
  await ctx.plugin(PoolRuntime, {
    pool: { poolCapacity: 4, targetWarmCount: 2, idleTimeoutMs: 60_000 },
    storageRoot: storage,
    engineId: 'engine-test',
  })
  fiber = await ctx.plugin(PoolFileSystem, { cwd: alice })
  await ctx.plugin(PoolSubprocess)
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'dsh-pool-dsh-'))
  storage = join(base, 'storage')
  alice = join(storage, 'alice')
  await mkdir(alice, { recursive: true })
})

afterEach(async () => {
  await fiber?.dispose()
  await rm(base, { recursive: true, force: true })
})

describe('ctx.pool service', () => {
  it('hosts the pool manager on the Cordis context', async () => {
    await boot()
    expect(ctx.pool).toBeInstanceOf(PoolRuntime)
    expect(ctx.pool.manager).toBeDefined()
    await ctx.pool.refill()
    const binding = await ctx.pool.acquire('alice')
    expect(binding.warm).toBe(false)
    expect(ctx.pool.stats().bound).toBe(1)
  })

  it('releases and heartbeats a binding through the service surface', async () => {
    await boot()
    await ctx.pool.refill()
    await ctx.pool.acquire('alice')
    expect(ctx.pool.release('alice')).toBe(true)
    expect(ctx.pool.stats().idle).toBe(1)
    expect(ctx.pool.heartbeat('alice')).toBe(true)
  })

  it('rebinds the same sandbox on a warm hit after release (one key, one sandbox)', async () => {
    await boot()
    await ctx.pool.refill()
    const first = await ctx.pool.acquire('alice')
    expect(first.warm).toBe(false)
    ctx.pool.release('alice')
    expect(ctx.pool.stats().idle).toBe(1)
    const second = await ctx.pool.acquire('alice')
    expect(second.warm).toBe(true)
    expect(second.sandboxId).toBe(first.sandboxId)
    expect(ctx.pool.stats().bound).toBe(1)
  })
})

describe('ctx.fs pooled routing', () => {
  it('writes and reads a file through the provider composed with the pool', async () => {
    await boot()
    const target = await ctx.fs.resolve('notes.txt')
    await ctx.fs.writeText(target, 'hello pooled sandbox')
    expect(await readFile(join(alice, 'notes.txt'), 'utf8')).toBe('hello pooled sandbox')
    expect(await ctx.fs.readText(await ctx.fs.resolve('notes.txt'))).toBe('hello pooled sandbox')
  })
})

describe('ctx.subprocess pooled routing', () => {
  it('runs a real command and streams real stdout scoped to the user directory', async () => {
    await boot()
    const handle = ctx.subprocess.spawn({
      argv: ['echo', 'from-a-sandbox'],
      cwd: alice,
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 1024 },
        stderr: { maxBytes: 1024 },
      },
      graceMs: 1000,
    })
    const outcome = await handle.done
    expect(outcome.exitCode).toBe(0)
    expect(handle.collected.stdout?.readFrom(0).text.trim()).toBe('from-a-sandbox')
  })

  it('fails loudly on the unimplemented pooled terminal path', async () => {
    await boot()
    await expect(ctx.subprocess.spawnTerminal({
      argv: ['sh'],
      cwd: alice,
      rows: 24,
      cols: 80,
      graceMs: 1000,
    })).rejects.toThrow(/spawnTerminal is not implemented/)
  })
})
