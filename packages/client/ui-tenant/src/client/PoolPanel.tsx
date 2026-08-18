/**
 * Read-only pool water-level panel (design V3): polls the host pool stats on
 * an interval and renders warm/bound/idle/reclaiming plus the cumulative
 * reclaim count. Purely presentational — the poll verb arrives through the
 * inject face.
 */
import { useEffect, useState } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './PoolPanel.module.css'

/** One polled water-level snapshot. */
export interface PoolSnapshot {
  warm: number
  bound: number
  idle: number
  reclaiming: number
  capacity: number
  reclaimTotal: number
}

/** Business face the registrant injects (a poll verb, no ctx). */
export interface PoolPanelInjected {
  /** Read the current pool water level. */
  stats: () => Promise<PoolSnapshot>
  /** Poll interval in milliseconds. */
  intervalMs: number
}

/** Composed component props: the inject face plus the locale seat. */
export type PoolPanelProps = PoolPanelInjected & PropsLocale<'tenant'>

/**
 * Render the read-only pool water-level panel.
 * @param props - inject face (stats poll verb + interval) and locale seat.
 * @returns the overlay entry element tree.
 */
export function PoolPanel({ stats, intervalMs, t }: PoolPanelProps) {
  const [snapshot, setSnapshot] = useState<PoolSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    const poll = (): void => {
      void stats().then((value) => {
        if (!cancelled) setSnapshot(value)
      }, () => {
        // A failed poll keeps the last snapshot.
      })
    }
    poll()
    const timer = window.setInterval(poll, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [stats, intervalMs])

  return (
    <div className={css.root} data-testid="pool-panel">
      <div className={css.title}>{t('panel.title')}</div>
      {snapshot === null ? (
        <div className={css.empty}>{t('panel.empty')}</div>
      ) : (
        <div className={css.rows}>
          <div className={css.row}><span>{t('panel.warm')}</span><span>{snapshot.warm}</span></div>
          <div className={css.row}><span>{t('panel.bound')}</span><span>{snapshot.bound}</span></div>
          <div className={css.row}><span>{t('panel.idle')}</span><span>{snapshot.idle}</span></div>
          <div className={css.row}><span>{t('panel.reclaiming')}</span><span>{snapshot.reclaiming}</span></div>
          <div className={css.row}><span>{t('panel.capacity')}</span><span>{snapshot.capacity}</span></div>
          <div className={css.row}><span>{t('panel.reclaimed')}</span><span>{snapshot.reclaimTotal}</span></div>
        </div>
      )}
    </div>
  )
}
