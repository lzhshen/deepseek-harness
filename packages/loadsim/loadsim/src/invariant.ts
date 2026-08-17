/**
 * Package-owned invariant companion for `@deepseek-ai/dsh-loadsim`.
 * @module @deepseek-ai/dsh-loadsim/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-loadsim'

/** Cordis companion plugin name. */
export const name = 'loadsim-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the simulator is a pure deterministic function of its
 * plan and seed; its invariants (deterministic replay, metric accounting) are
 * pinned by unit tests.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
