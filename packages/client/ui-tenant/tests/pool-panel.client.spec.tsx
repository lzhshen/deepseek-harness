// @vitest-environment jsdom
// The read-only pool water-level panel driven props-direct: it polls the
// injected stats verb and renders warm/bound/idle/reclaiming plus capacity
// and the cumulative reclaim count.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { PoolPanel } from '../src/client/PoolPanel.tsx'
import type { PoolPanelProps } from '../src/client/PoolPanel.tsx'

afterEach(cleanup)

const t: PoolPanelProps['t'] = (key) => {
  const dict: Record<string, string> = {
    'panel.title': 'Sandbox pool',
    'panel.empty': 'no pool data',
    'panel.warm': 'Warm',
    'panel.bound': 'Bound',
    'panel.idle': 'Idle',
    'panel.reclaiming': 'Reclaiming',
    'panel.capacity': 'Capacity',
    'panel.reclaimed': 'Reclaimed',
  }
  return dict[key] ?? key
}

function props(overrides: Partial<PoolPanelProps> = {}): PoolPanelProps {
  return {
    stats: vi.fn().mockResolvedValue({
      warm: 2, bound: 1, idle: 0, reclaiming: 0, capacity: 4, reclaimTotal: 3,
    }),
    intervalMs: 1000,
    t,
    ...overrides,
  }
}

describe('PoolPanel', () => {
  it('renders the water-level rows after one poll', async () => {
    render(<PoolPanel {...props()} />)
    await waitFor(() => expect(screen.getByText('Sandbox pool')).toBeTruthy())
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy())
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('re-polls using the injected stats verb', async () => {
    const stats = vi.fn().mockResolvedValue({
      warm: 0, bound: 1, idle: 0, reclaiming: 0, capacity: 4, reclaimTotal: 0,
    })
    render(<PoolPanel {...props({ stats, intervalMs: 100_000 })} />)
    await waitFor(() => expect(stats).toHaveBeenCalled())
    expect(screen.getByText('1')).toBeTruthy()
  })
})
