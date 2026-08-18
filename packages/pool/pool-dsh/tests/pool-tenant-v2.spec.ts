/**
 * The V2 identity chain end-to-end: the tenant service, the pooled sandbox,
 * and the tenant-aware `ctx.fs`/`ctx.subprocess` providers composed on one
 * Cordis context. Switching the current user routes filesystem and subprocess
 * work into that user's directory, and the probe echoes the user's own
 * sandbox + file — proving per-user isolation through the real services.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import TenantService from '@deepseek-ai/dsh-tenant'
import { PoolRuntime } from '../src/runtime.ts'
import { PoolFileSystem } from '../src/fs.ts'
import { PoolSubprocess } from '../src/subprocess.ts'
import { PoolTenantProbe } from '../src/probe.ts'

let base: string
let storage: string
let ctx: Context
let fibers: Array<Awaited<ReturnType<Context['plugin']>>>

async function boot(): Promise<void> {
  ctx = new Context()
  fibers = []
  await ctx.plugin(TenantService, { users: ['alice', 'bob'], defaultUserId: 'alice' })
  await ctx.plugin(PoolRuntime, {
    pool: { poolCapacity: 4, targetWarmCount: 2, idleTimeoutMs: 60_000 },
    storageRoot: storage,
    engineId: 'engine-v2',
  })
  fibers.push(await ctx.plugin(PoolFileSystem, { cwd: storage }))
  await ctx.plugin(PoolSubprocess)
  await ctx.plugin(PoolTenantProbe)
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'dsh-pool-v2-'))
  storage = join(base, 'storage')
  await mkdir(join(storage, 'alice'), { recursive: true })
  await mkdir(join(storage, 'bob'), { recursive: true })
})

afterEach(async () => {
  await Promise.all(fibers.map(fiber => fiber.dispose()))
  await rm(base, { recursive: true, force: true })
})

describe('V2 tenant identity chain', () => {
  it('routes the pooled filesystem into the current user\u2019s directory', async () => {
    await boot()
    // alice is current.
    await ctx.pool.refill()
    const target = await ctx.fs.resolve('notes.txt')
    await ctx.fs.writeText(target, 'alice file')
    expect(await readFile(join(storage, 'alice', 'notes.txt'), 'utf8')).toBe('alice file')

    // Switch to bob: the same relative path now resolves under bob's directory.
    ctx.tenant.selectUser('bob')
    const bobTarget = await ctx.fs.resolve('notes.txt')
    await ctx.fs.writeText(bobTarget, 'bob file')
    expect(await readFile(join(storage, 'bob', 'notes.txt'), 'utf8')).toBe('bob file')
    // alice's file is unchanged.
    expect(await readFile(join(storage, 'alice', 'notes.txt'), 'utf8')).toBe('alice file')
  })

  it('routes the pooled subprocess into the current user\u2019s directory', async () => {
    await boot()
    await ctx.pool.refill()
    // alice is current: a relative cwd resolves under alice.
    const handle = ctx.subprocess.spawn({
      argv: ['pwd'],
      cwd: '.',
      stdio: { stdin: 'ignore', stdout: { maxBytes: 1024 }, stderr: { maxBytes: 1024 } },
      graceMs: 1000,
    })
    const outcome = await handle.done
    expect(outcome.exitCode).toBe(0)
    // macOS resolves /var -> /private/var; assert the trailing user dir to stay path-symlink agnostic.
    const cwd = handle.collected.stdout?.readFrom(0).text.trim() ?? ''
    expect(cwd).toMatch(/storage[/\\]alice$/)
  })

  it('echoes the current user\u2019s sandbox and file through the probe', async () => {
    await boot()
    await ctx.pool.refill()
    const alice = await ctx.poolTenantProbe.stamp()
    expect(alice.userId).toBe('alice')
    expect(alice.content).toContain('user=alice')
    expect(await readFile(join(storage, 'alice', 'tenant-stamp.txt'), 'utf8')).toBe(alice.content)

    ctx.tenant.selectUser('bob')
    const bob = await ctx.poolTenantProbe.stamp()
    expect(bob.userId).toBe('bob')
    expect(await readFile(join(storage, 'bob', 'tenant-stamp.txt'), 'utf8')).toBe(bob.content)
    // Two users, two distinct sandboxes (one key, one sandbox each).
    expect(bob.sandboxId).not.toBe(alice.sandboxId)
  })
})
