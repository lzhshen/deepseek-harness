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
  'panel.title': '沙箱水位',
  'panel.empty': '无池数据',
  'panel.warm': '预热',
  'panel.bound': '绑定',
  'panel.idle': '保温',
  'panel.reclaiming': '回收中',
  'panel.capacity': '容量',
  'panel.reclaimed': '已回收',
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
  'panel.title': 'Sandbox pool',
  'panel.empty': 'no pool data',
  'panel.warm': 'Warm',
  'panel.bound': 'Bound',
  'panel.idle': 'Idle',
  'panel.reclaiming': 'Reclaiming',
  'panel.capacity': 'Capacity',
  'panel.reclaimed': 'Reclaimed',
} satisfies Record<TenantKey, string>
