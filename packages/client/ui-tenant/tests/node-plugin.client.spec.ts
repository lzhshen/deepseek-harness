/**
 * Web tenant switch plugin, node half: mounts no host-side capability (multi-tenant
 * identity is the host `@deepseek-ai/dsh-tenant` service's job).
 */
import { describe, expect, it } from 'vitest'
import { apply } from '../src/index.ts'

describe('ui-tenant node plugin', () => {
  it('mounts an empty host half', () => {
    expect(() => apply()).not.toThrow()
  })
})
