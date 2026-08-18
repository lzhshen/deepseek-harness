/**
 * Tests for the host-side tenant service: the simulated user roster, the
 * current-user switch, and the attribution helpers (`userIdOf` /
 * `belongsTo`) that the API boundary uses to stamp sessions and isolate
 * listings. Attribution itself (who a session belongs to) is read from the
 * session header, which dsh-session stamps at creation.
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import TenantService from '../src/index.ts'

async function boot(users: string[] = ['alice', 'bob']): Promise<{
  ctx: Context
  tenant: TenantService
}> {
  const ctx = new Context()
  const first = users[0]
  if (first === undefined) throw new Error('users roster must be non-empty')
  await ctx.plugin(TenantService, { users, defaultUserId: first })
  await ctx.plugin(SessionStore)
  return { ctx, tenant: ctx.tenant }
}

describe('TenantService', () => {
  it('defaults the current user to the roster first entry', async () => {
    const { tenant } = await boot()
    expect(tenant.currentUserId()).toBe('alice')
    expect(tenant.listUsers()).toEqual(['alice', 'bob'])
  })

  it('respects an explicit defaultUserId', async () => {
    const { tenant } = await boot(['alice', 'bob', 'carol'])
    expect(tenant.currentUserId()).toBe('alice')
    const ctx = new Context()
    await ctx.plugin(TenantService, { users: ['alice', 'carol'], defaultUserId: 'carol' })
    expect(ctx.tenant.currentUserId()).toBe('carol')
  })

  it('rejects a defaultUserId outside the roster at load', async () => {
    const ctx = new Context()
    await expect(ctx.plugin(TenantService, { users: ['alice'], defaultUserId: 'nobody' }))
      .rejects.toThrow(/not in the users roster/)
  })

  it('switches the current user and rejects unknown users', async () => {
    const { tenant } = await boot()
    tenant.selectUser('bob')
    expect(tenant.currentUserId()).toBe('bob')
    expect(() => tenant.selectUser('mallory')).toThrow(/unknown user/)
  })

  it('reads attribution from the session header', async () => {
    const { ctx, tenant } = await boot()
    const owned = ctx.sessions.create(SessionId('owned'), { meta: { userId: 'alice' } })
    const unowned = ctx.sessions.create(SessionId('unowned'))

    expect(tenant.userIdOf(owned)).toBe('alice')
    expect(tenant.belongsTo(owned, 'alice')).toBe(true)
    expect(tenant.belongsTo(owned, 'bob')).toBe(false)
    expect(tenant.userIdOf(unowned)).toBeNull()
  })
})
