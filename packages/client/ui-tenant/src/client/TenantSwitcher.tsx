/**
 * The current-user switch: a floating pill that names the user whose sessions
 * the list shows, and a menu to switch to another user. Purely presentational
 * — every data fact and verb arrives through the inject face (load / select);
 * the select callback is what re-pulls the session list on the host side.
 */
import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './TenantSwitcher.module.css'

/** Business face the registrant injects (plain data verbs, no ctx). */
export interface TenantSwitcherInjected {
  /** Read the current roster and user. */
  load: () => Promise<{ users: string[]; current: string }>
  /** Switch to another user (the host re-lists that user's sessions). */
  select: (userId: string) => Promise<void>
}

/** Composed component props: the inject face plus the locale seat. */
export type TenantSwitcherProps = TenantSwitcherInjected & PropsLocale<'tenant'>

/** One loaded roster snapshot (users + the current selection). */
interface Roster {
  users: readonly string[]
  current: string
}

/**
 * Render the floating current-user pill and its switch menu.
 * @param props - inject face and locale seat.
 * @returns the overlay entry element tree.
 */
export function TenantSwitcher({ load, select, t }: TenantSwitcherProps) {
  const [roster, setRoster] = useState<Roster | null>(null)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    void load().then((value) => {
      if (!cancelled) setRoster({ users: value.users, current: value.current })
    }, () => {
      // A failed read leaves the pill in its empty state; the menu stays usable.
    })
    return () => { cancelled = true }
  }, [load])

  // Close on an outside pointer (the pill is the only overlay-surface this
  // entry owns; the frame layer is click-through except the pill itself).
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent): void => {
      if (menuRef.current !== null && !menuRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => { document.removeEventListener('pointerdown', onDown) }
  }, [open])

  const pick = (userId: string): void => {
    if (busy) return
    setBusy(true)
    void select(userId).then(() => {
      setRoster(prev => prev === null ? prev : { users: prev.users, current: userId })
      setOpen(false)
    }, () => {
      // A failed switch leaves the current selection unchanged.
    }).finally(() => { setBusy(false) })
  }

  return (
    <div ref={menuRef} className={css.root}>
      <button
        type="button"
        className={clsx(css.pill, open && css.pillOpen)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('action.switch')}
        onClick={() => { setOpen(open => !open) }}
      >
        <span className={css.label}>{t('label.current')}</span>
        <span className={css.current}>{roster?.current ?? '—'}</span>
      </button>
      {open && roster !== null && (
        <div className={css.menu} role="menu" aria-label={t('menu.title')}>
          {roster.users.map(user => (
            <button
              key={user}
              type="button"
              role="menuitem"
              className={clsx(css.item, user === roster.current && css.itemCurrent)}
              disabled={busy || user === roster.current}
              onClick={() => { pick(user) }}
            >
              {user}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
