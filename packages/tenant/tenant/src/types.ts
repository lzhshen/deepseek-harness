/**
 * Pure-type outlet of the tenant domain: the brand for an owning user id.
 * Free of runtime value imports so host and wire consumers can carry the
 * brand without importing the tenant service.
 *
 * @module @deepseek-ai/dsh-tenant/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'

/**
 * Opaque identity of one tenant user. Branded, never a bare string, so
 * session `userId` attribution and listing isolation cannot silently mix a
 * user id with an unrelated id of the same shape.
 */
export type UserId = Branded<'dsh.tenant.UserId'>
