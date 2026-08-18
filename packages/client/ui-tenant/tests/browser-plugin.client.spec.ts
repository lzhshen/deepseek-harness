/**
 * apply wiring on a real cordis Context + SlotRegistry: the current-user
 * switch registered as the `tenant-switcher` entry of the frame-declared
 * `shell.overlay` list slot, declaration-aware activation, and fiber-teardown
 * unregistration. Component and face behavior is covered props-direct in
 * tenant-switcher.client.spec.tsx; no renderer machinery here.
 */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { SlotRegistry } from '@deepseek-ai/dsh-client-runtime/client'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { apply, inject } from '../src/client/index.ts'

const api = {
  tenant: {
    list: async () => ({ rpcId: '' as never, result: { ok: true as const, value: { users: ['alice'], current: 'alice' } } }),
    select: async () => ({ rpcId: '' as never, result: { ok: true as const, value: { current: 'alice' } } }),
    stamp: async () => ({ rpcId: '' as never, result: { ok: true as const, value: { userId: 'alice', sandboxId: 's', warm: false, file: '/f', content: 'c' } } }),
  },
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const slots = ctx.get('slots') as SlotRegistry
  // The overlay slot exists only while its declaring entry is live.
  slots.register(
    { name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('connection', { api } as unknown as ConnectionHandle)
  ctx.provide('sessions', { refresh: async () => {} })
  return { ctx, slots }
}

describe('apply', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['slots', 'connection', 'sessions', 'locale'])
  })

  it('waits until a live entry declares the overlay slot', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry).await()
    ctx.provide('locale', new LocaleRuntime(ctx))
    ctx.provide('connection', { api } as unknown as ConnectionHandle)
    ctx.provide('sessions', { refresh: async () => {} })
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('shell.overlay')).toHaveLength(0)
    await fiber.dispose()
  })

  it('registers the switch once the overlay slot is declared', async () => {
    const { ctx } = await bench()
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(ctx.slots.entries('shell.overlay').map(entry => entry.options.id)).toContain('tenant-switcher')
    await fiber.dispose()
    expect(ctx.slots.entries('shell.overlay').map(entry => entry.options.id)).not.toContain('tenant-switcher')
  })
})
