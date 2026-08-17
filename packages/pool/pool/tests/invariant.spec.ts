import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import InvariantRegistry from '@deepseek-ai/dsh-invariants'
import * as PoolInvariant from '../src/invariant.ts'

describe('pool invariant companion', () => {
  it('registers its explained empty runtime invariant', async () => {
    const ctx = new Context()
    await ctx.plugin(InvariantRegistry)
    const fiber = await ctx.plugin(PoolInvariant)

    expect(() => {
      ctx.invariants.register('@deepseek-ai/dsh-pool', () => {})
    }).toThrow(/already registered/)
    await fiber.dispose()
    await ctx.fiber.dispose()
  })
})
