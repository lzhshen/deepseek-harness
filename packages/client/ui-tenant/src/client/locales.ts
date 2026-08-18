/** `tenant` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'label.current': '当前用户',
  'action.switch': '切换用户',
  'menu.title': '切换用户',
} satisfies Record<string, string>

/** The tenant namespace key union. */
export type TenantKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'label.current': 'Current user',
  'action.switch': 'Switch user',
  'menu.title': 'Switch user',
} satisfies Record<TenantKey, string>
