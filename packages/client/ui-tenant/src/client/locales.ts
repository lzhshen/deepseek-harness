/** `tenant` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'label.current': '当前用户',
  'action.switch': '切换用户',
  'action.stamp': '绑定我的沙箱',
  'menu.title': '切换用户',
  'echo.user': '用户：',
  'echo.sandbox': '沙箱：',
  'echo.file': '文件：',
  'echo.warm': '保温命中',
  'echo.cold': '冷绑定',
} satisfies Record<string, string>

/** The tenant namespace key union. */
export type TenantKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'label.current': 'Current user',
  'action.switch': 'Switch user',
  'action.stamp': 'Bind my sandbox',
  'menu.title': 'Switch user',
  'echo.user': 'User:',
  'echo.sandbox': 'Sandbox:',
  'echo.file': 'File:',
  'echo.warm': 'warm hit',
  'echo.cold': 'cold bind',
} satisfies Record<TenantKey, string>
