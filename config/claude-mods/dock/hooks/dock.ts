import type { DockAction, DockRow, DockSection } from '../types'

const DEFAULT_ORDER = 100
// The dock's own keys: open the picked row, close the pane.
export const RESERVED_KEYS = ['o', 'c']

// The sections in drawing order, `next` replacing the one with its id.
export function upsert(list: readonly DockSection[], next: DockSection): DockSection[] {
  const rest = list.filter(section => section.id !== next.id)
  return [...rest, next].sort((a, b) => (a.order ?? DEFAULT_ORDER) - (b.order ?? DEFAULT_ORDER) || a.id.localeCompare(b.id))
}

export function without(list: readonly DockSection[], id: string): DockSection[] {
  return list.filter(section => section.id !== id)
}

// One status entry for every section's badge: `⟲ 2 re-review · 8 review   ⟳ 1 running`.
export function statusLine(list: readonly DockSection[]): string | undefined {
  const parts = list.map(section => section.badge).filter(Boolean)
  return parts.length ? parts.join('   ') : undefined
}

// Whether the person flipped a section or group away from its default.
export function isFolded(toggled: readonly string[], key: string, byDefault: boolean): boolean {
  return toggled.includes(key) ? !byDefault : byDefault
}

export function toggle(keys: readonly string[], key: string): string[] {
  return keys.includes(key) ? keys.filter(one => one !== key) : [...keys, key]
}

// A row's address across sections: `<section>:<row>`.
export const rowId = (section: DockSection, row: DockRow) => `${section.id}:${row.key}`

export function findRow(list: readonly DockSection[], id: string | null) {
  if (!id) return undefined
  for (const section of list) {
    for (const group of section.groups) {
      const row = group.rows.find(one => rowId(section, one) === id)
      if (row) return { section, row }
    }
  }
  return undefined
}

const hasRows = (section: DockSection) => section.groups.some(group => group.rows.length > 0)

// The action bar's buttons, in order: the picked row's own, then every
// section's standing ones. A hotkey already taken is dropped, not the button.
export function actionsFor(list: readonly DockSection[], picked: ReturnType<typeof findRow>) {
  const taken = new Set(RESERVED_KEYS)
  const out: { section: string; action: DockAction }[] = []
  const add = (section: DockSection, action: DockAction) => {
    const hotkey = action.hotkey && !taken.has(action.hotkey) ? action.hotkey : undefined
    if (hotkey) taken.add(hotkey)
    out.push({ section: section.id, action: { ...action, hotkey } })
  }
  if (picked) {
    const offered = picked.row.actions
    for (const action of picked.section.actions ?? []) {
      if (action.scope === 'row' && (!offered || offered.includes(action.id))) add(picked.section, action)
    }
  }
  for (const section of list) {
    if (!hasRows(section)) continue
    for (const action of section.actions ?? []) if (action.scope === 'section') add(section, action)
  }
  return out
}

// The row's columns for a pane `inner` cells wide, as runwatch lays them out.
export function columns(inner: number, hasTag: boolean, hasBar: boolean) {
  const barWidth = hasBar && inner >= 70 ? 12 : 0
  const metaWidth = 7
  const flex = Math.max(10, inner - (2 + (hasTag ? 4 : 0) + (barWidth ? barWidth + 1 : 0) + metaWidth))
  const nameWidth = Math.ceil(flex * 0.5)
  return { barWidth, metaWidth, nameWidth, detailWidth: flex - nameWidth }
}

// Padded or cut to exactly `width` columns, as runwatch's `fit`.
export function fit(text: string, width: number): string {
  if (width <= 0) return ''
  const chars = [...text]
  if (chars.length > width) return `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
  return text + ' '.repeat(width - chars.length)
}

export function bar(progress: number, width: number): [filled: string, empty: string] {
  const cells = Math.round(Math.max(0, Math.min(1, progress)) * width)
  return ['━'.repeat(cells), '─'.repeat(width - cells)]
}
