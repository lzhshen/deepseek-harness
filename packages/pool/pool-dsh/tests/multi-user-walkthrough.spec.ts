/**
 * End-to-end multi-user walkthrough (design V0-V3): two simulated users
 * log in, each creates a session, binds a sandbox, and writes/reads their own
 * files through the REAL composed services — tenant, pool, tenant-aware
 * fs/subprocess, and the probe — and then one leaves and returns, verifying
 * the bind/reclaim transitions and that each user's files stay theirs.
 *
 * This is the "simulate real users" acceptance check: it drives the assembled
 * DSH services the way two browser users would, not the pure libraries.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import TenantService from '@deepseek-ai/dsh-tenant'
import { PoolRuntime } from '../src/runtime.ts'
import { PoolFileSystem } from '../src/fs.ts'
import { PoolSubprocess } from '../src/subprocess.ts'
import { PoolTenantProbe } from '../src/probe.ts'

let base: string
let storage: string
let ctx: Context
let fibers: Array<Awaited<ReturnType<Context['plugin']>>>

async function assemble(): Promise<void> {
  ctx = new Context()
  fibers = []
  await ctx.plugin(TenantService, { users: ['alice', 'bob'], defaultUserId: 'alice' })
  await ctx.plugin(SessionStore)
  await ctx.plugin(PoolRuntime, {
    pool: { poolCapacity: 4, targetWarmCount: 2, idleTimeoutMs: 1 },
    storageRoot: storage,
    engineId: 'engine-e2e',
  })
  fibers.push(await ctx.plugin(PoolFileSystem, { cwd: storage }))
  await ctx.plugin(PoolSubprocess)
  await ctx.plugin(PoolTenantProbe)
  await ctx.pool.refill()
}

/** Build the list of session ids visible to the current user, via the same
 * header filter the gateway uses (no apiproxy here — direct service read). */
function visibleSessions(): SessionId[] {
  const userId = ctx.tenant.currentUserId()
  return ctx.sessions
    .list()
    .filter(session => session.header.userId === userId)
    .map(session => session.id)
}

/** Write one private note for the current user and read it back. */
async function writeNote(name: string, text: string): Promise<string> {
  const target = await ctx.fs.resolve(name)
  await ctx.fs.writeText(target, text)
  return ctx.fs.readText(target)
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'dsh-pool-e2e-'))
  storage = join(base, 'storage')
  await mkdir(join(storage, 'alice'), { recursive: true })
  await mkdir(join(storage, 'bob'), { recursive: true })
})

afterEach(async () => {
  await Promise.all(fibers.map(fiber => fiber.dispose()))
  await rm(base, { recursive: true, force: true })
})

describe('multi-user walkthrough', () => {
  it('two users are isolated across sessions, sandboxes, and files, and reclaim is observable', async () => {
    await assemble()

    // ── alice logs in and works ──────────────────────────────────────────────
    const aliceSession = ctx.sessions.create(undefined, { meta: { userId: 'alice' } })
    expect(visibleSessions()).toEqual([aliceSession.id])
    const aliceNote = await writeNote('notes.txt', 'alice private note')
    expect(aliceNote).toBe('alice private note')
    expect(await readFile(join(storage, 'alice', 'notes.txt'), 'utf8')).toBe('alice private note')
    const aliceSandbox = await ctx.poolTenantProbe.stamp()
    expect(aliceSandbox.userId).toBe('alice')
    expect(ctx.pool.stats().bound).toBe(1)

    // ── bob switches in (alice's session disappears from HIS list) ──────────
    ctx.tenant.selectUser('bob')
    expect(visibleSessions()).toEqual([])
    const bobSession = ctx.sessions.create(undefined, { meta: { userId: 'bob' } })
    expect(visibleSessions()).toEqual([bobSession.id])
    await writeNote('notes.txt', 'bob private note')
    expect(await readFile(join(storage, 'bob', 'notes.txt'), 'utf8')).toBe('bob private note')
    const bobSandbox = await ctx.poolTenantProbe.stamp()
    expect(bobSandbox.userId).toBe('bob')
    expect(bobSandbox.sandboxId).not.toBe(aliceSandbox.sandboxId)

    // ── alice's files and bob's files never mix ──────────────────────────────
    expect(await readFile(join(storage, 'alice', 'notes.txt'), 'utf8')).toBe('alice private note')
    expect(await readFile(join(storage, 'bob', 'notes.txt'), 'utf8')).toBe('bob private note')

    // ── bob leaves (bound → idle) and returns (warm rebind) ─────────────────
    ctx.pool.release('bob')
    expect(ctx.pool.stats().idle).toBe(1)
    const bobReturned = await ctx.poolTenantProbe.stamp()
    expect(bobReturned.warm).toBe(true)
    expect(bobReturned.sandboxId).toBe(bobSandbox.sandboxId)

    // ── alice switches back; her session is visible, bob's is not ───────────
    ctx.tenant.selectUser('alice')
    expect(visibleSessions()).toEqual([aliceSession.id])

    // ── alice leaves and the reclaim tick destroys her idle sandbox ─────────
    // alice still holds the sandbox she bound in the first step; release it.
    ctx.pool.release('alice')
    await new Promise(resolve => setTimeout(resolve, 5))
    await ctx.pool.reclaim()
    // Proving the bind → idle → reclaim transition is observable in the water level.
    expect(ctx.pool.stats().reclaimTotal).toBeGreaterThan(0)

    // ── alice returns (cold start): a fresh sandbox, files still intact ─────
    const aliceReturned = await ctx.poolTenantProbe.stamp()
    expect(aliceReturned.userId).toBe('alice')
    // The file survived reclaim — files are durable, only the sandbox is reclaimed.
    expect(await readFile(join(storage, 'alice', 'notes.txt'), 'utf8')).toBe('alice private note')
  })
})
