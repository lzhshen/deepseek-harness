// @vitest-environment jsdom
// The current-user switch driven props-direct: the pill names the loaded
// current user, the menu lists the roster, and picking a different user calls
// the injected select verb then re-labels the pill.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TenantSwitcher } from '../src/client/TenantSwitcher.tsx'
import type { TenantSwitcherProps } from '../src/client/TenantSwitcher.tsx'

afterEach(cleanup)

const t: TenantSwitcherProps['t'] = (key) => {
  const dict: Record<string, string> = {
    'label.current': 'Current user',
    'action.switch': 'Switch user',
    'action.stamp': 'Bind my sandbox',
    'menu.title': 'Switch user',
    'echo.user': 'User:',
    'echo.sandbox': 'Sandbox:',
    'echo.file': 'File:',
    'echo.warm': 'warm hit',
    'echo.cold': 'cold bind',
  }
  return dict[key] ?? key
}

function props(overrides: Partial<TenantSwitcherProps> = {}): TenantSwitcherProps {
  return {
    load: vi.fn().mockResolvedValue({ users: ['alice', 'bob'], current: 'alice' }),
    select: vi.fn().mockResolvedValue(undefined),
    stamp: vi.fn().mockResolvedValue({
      userId: 'alice', sandboxId: 'sb-1', warm: false, file: '/storage/alice/tenant-stamp.txt', content: 'x',
    }),
    t,
    ...overrides,
  }
}

describe('TenantSwitcher', () => {
  it('names the loaded current user', async () => {
    render(<TenantSwitcher {...props()} />)
    await waitFor(() => expect(screen.getByText('alice')).toBeTruthy())
    expect(screen.getByText('Current user')).toBeTruthy()
  })

  it('lists the roster and selects another user', async () => {
    const select = vi.fn().mockResolvedValue(undefined)
    render(<TenantSwitcher {...props({ select })} />)
    await waitFor(() => expect(screen.getByText('alice')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Switch user' }))
    const bob = await screen.findByRole('menuitem', { name: 'bob' })
    fireEvent.click(bob)

    await waitFor(() => expect(select).toHaveBeenCalledWith('bob'))
    await waitFor(() => expect(screen.getByText('bob')).toBeTruthy())
  })

  it('disables the already-current user in the menu', async () => {
    render(<TenantSwitcher {...props()} />)
    await waitFor(() => expect(screen.getByText('alice')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Switch user' }))
    const alice = await screen.findByRole('menuitem', { name: 'alice' })
    expect((alice as HTMLButtonElement).disabled).toBe(true)
  })

  it('echoes the sandbox and file after a stamp', async () => {
    const stamp = vi.fn().mockResolvedValue({
      userId: 'alice', sandboxId: 'sb-42', warm: true, file: '/storage/alice/tenant-stamp.txt', content: 'tenant-probe user=alice',
    })
    render(<TenantSwitcher {...props({ stamp })} />)
    await waitFor(() => expect(screen.getByText('alice')).toBeTruthy())

    fireEvent.click(screen.getByRole('button', { name: 'Bind my sandbox' }))
    await waitFor(() => expect(stamp).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText(/sb-42/)).toBeTruthy())
    expect(screen.getByText(/storage\/alice\/tenant-stamp\.txt/)).toBeTruthy()
    expect(screen.getByText('tenant-probe user=alice')).toBeTruthy()
  })
})
