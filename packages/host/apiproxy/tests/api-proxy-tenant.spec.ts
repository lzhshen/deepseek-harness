/**
 * Tenant isolation at the listing boundary: with the tenant service
 * composed, `session.list` returns only the current user's sessions. A
 * session stamped for another user, and an unowned session, are both hidden;
 * without the tenant service the listing stays single-user (everything
 * visible).
 */

import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import type { Session } from '@deepseek-ai/dsh-session'
import TenantService from '@deepseek-ai/dsh-tenant'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import type { ApiProxy, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy/api/rpc'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

let nextRpc = 1
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: RpcId(`iso-${String(nextRpc++)}`), payload }
}

async function listIds(api: ApiProxy): Promise<string[]> {
  const response = await api.sessions.list(request({}))
  if (!response.result.ok) throw new Error('list failed')
  return response.result.value.items.map(item => String(item.sessionId))
}

/** Boot contexts and an api proxy; `withTenancy` composes the tenant service. */
async function harness(withTenancy: boolean): Promise<{
  ctx: Context
  api: ApiProxy
  attach: (session: Session) => void
}> {
  const ctx = new Context()
  if (withTenancy) await ctx.plugin(TenantService, { users: ['alice', 'bob'], defaultUserId: 'alice' })
  await ctx.plugin(SessionStore)
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  return {
    ctx,
    api: createApiProxy(ctx, { defaultModelSelection: () => ({ provider: 'p', model: 'm' }), cwd: '/tmp' }),
    attach: (session) => {
      ctx.agents.register({ id: session.id, session, status: 'idle', ctx } as Agent)
    },
  }
}

describe('tenant listing isolation', () => {
  it('lists only the current user\u2019s sessions when tenancy is composed', async () => {
    const { ctx, api, attach } = await harness(true)
    const aliceSession = ctx.sessions.create(undefined, { meta: { userId: 'alice' } })
    attach(aliceSession)
    const bobSession = ctx.sessions.create(undefined, { meta: { userId: 'bob' } })
    attach(bobSession)
    const unowned = ctx.sessions.create()
    attach(unowned)

    // alice is current: only her session is visible.
    expect(await listIds(api)).toEqual([String(aliceSession.id)])

    // Switch to bob: only his session is visible.
    ctx.tenant.selectUser('bob')
    expect(await listIds(api)).toEqual([String(bobSession.id)])
  })

  it('stays single-user (everything visible) without the tenant service', async () => {
    const { ctx, api, attach } = await harness(false)
    const bobSession = ctx.sessions.create(undefined, { meta: { userId: 'bob' } })
    attach(bobSession)
    // Without tenancy there is no current-user filter; the stamped-id session
    // still lists because isolation is opt-in.
    const ids = await listIds(api)
    expect(ids).toContain(String(bobSession.id))
  })
})
