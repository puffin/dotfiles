import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DockGroup, DockRow, DockSection } from '../types'
import { actionsFor, bar, columns, findRow, fit, isFolded, rowId, statusLine, toggle, upsert, without } from './dock'

// One side pane that other mods fill through `$.dock.publish`: they hand it
// plain data and it draws it the way runwatch draws its own pane (one-line
// rows in columns, details on Enter, an action bar for the picked row), folds
// it, and sums every section's badge into one status entry. A press of a
// section's own action goes back to its mod as the `dock.action` event.

const PANE = 'dock'
const TITLE = 'dock'
// Wide enough for runwatch's progress bar.
const COLUMNS = 76
const ACCENT = 'cyan'
const MUTED = 'gray'
const BAR_BG = 'blackBright'

const sections = atom({ plugin: 'dock', key: 'sections' } as const, [])
const toggled = atom({ plugin: 'dock', key: 'toggled' } as const, [])
const expanded = atom({ plugin: 'dock', key: 'expanded' } as const, [])
const selected = atom({ plugin: 'dock', key: 'selected' } as const, null)

async function isPaneShown($: EngineInterface) {
  const panes = await $.ui.panes().catch(() => [])
  return panes.some(pane => pane.id === PANE && pane.isPlaced && pane.isShown)
}

// The status line stands in for the pane: none while the pane is on screen.
async function refreshStatus($: EngineInterface) {
  $.ui.status((await isPaneShown($)) ? undefined : statusLine(await read($, sections)))
}

async function openPane($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: TITLE, columns: COLUMNS }).catch(() => undefined)
  await refreshStatus($)
  return opened?.isPlaced ?? false
}

async function openUrl($: EngineInterface, url: string) {
  const opened = await $.process.run(['open', url]).catch(() => undefined)
  if (opened?.exitCode !== 0) await $.process.run(['xdg-open', url]).catch(() => undefined)
}

async function press($: EngineInterface, section: string, action: string, row: string | undefined) {
  await $.dock.action(row === undefined ? { section, action } : { section, action, row })
}

export const register: Register = (on, options) => {
  const isAutoOpen = options.openPane !== false
  // What each section last asked attention for, so only a rise opens the pane.
  const attention = new Map<string, number>()

  on('engine.create', async ($, e, next) => {
    const built = await next(e)
    // The work happens in the `dock.*` hooks below, which hold the dock's own `$`;
    // `action` has none here: the section's own mod hooks it.
    return { ...built, dock: { publish: async () => true, remove: async () => true, open: async () => true, action: async () => true } }
  })

  on('dock.publish', async ($, e, next) => {
    const section = e as DockSection
    await update($, sections, list => upsert(list, section))
    const before = attention.get(section.id) ?? 0
    const now = section.attention ?? 0
    attention.set(section.id, now)
    if (isAutoOpen && now > before && !(await isPaneShown($))) await openPane($)
    else await refreshStatus($)
    return next(e)
  })

  on('dock.remove', async ($, e, next) => {
    await update($, sections, list => without(list, e.id))
    attention.delete(e.id)
    await refreshStatus($)
    return next(e)
  })

  on('dock.open', async ($, e, next) => {
    await openPane($)
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'dock', description: 'Show or hide the dock side pane (reviews, runs, ...)' })
    return next(e)
  })

  on('command.run', { command: 'dock' }, async $ => {
    if (await isPaneShown($)) {
      await $.ui.close({ id: PANE })
      await refreshStatus($)
      return { text: 'Dock closed.' }
    }
    await openPane($)
    return { text: 'Dock opened. ctrl+x tab puts the keys in it.' }
  })

  // The focus ring's row is the one the action bar acts on; moving onto a
  // button of the bar keeps it.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const key = e.element
    if (!key?.startsWith('act-')) await update($, selected, () => (key?.startsWith('row:') ? key.slice(4) : null))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    void refreshStatus($)
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const list = await read($, sections)
    const flipped = await read($, toggled)
    const open = await read($, expanded)
    const picked = findRow(list, await read($, selected))
    const inner = Math.max(30, (e.props.bodyColumns || COLUMNS) - 2)
    const flip = (key: string) => () => update($, toggled, keys => toggle(keys, key))

    const row = (section: DockSection, item: DockRow) => {
      const id = rowId(section, item)
      const hasTag = section.groups.some(g => g.rows.some(r => r.tag))
      const hasBar = section.groups.some(g => g.rows.some(r => r.progress !== undefined))
      const { barWidth, metaWidth, nameWidth, detailWidth } = columns(inner, hasTag, hasBar)
      const aside = item.aside ? ` · ${item.aside}` : ''
      const label = fit(item.label, nameWidth - Math.min([...aside].length, Math.floor(nameWidth / 2))).trimEnd()
      const [filled, empty] = item.progress === undefined ? ['', ' '.repeat(barWidth)] : bar(item.progress, barWidth)
      const isOpen = open.includes(id)
      const href = item.href
      return (
        <Box key={`item:${id}`} flexDirection="column">
          <Button key={`row:${id}`} plain onPress={() => update($, expanded, ids => toggle(ids, id))}>
            <Text color={item.iconColor ?? MUTED} bold>
              {item.icon ?? '·'}
            </Text>{' '}
            {hasTag ? <Text color={MUTED}>{fit(item.tag ?? '', 3)} </Text> : ''}
            <Text bold>{label}</Text>
            <Text color={MUTED}>{fit(aside, nameWidth - [...label].length)}</Text>{' '}
            <Text color={item.detailColor}>{fit(item.detail ?? '', detailWidth)}</Text>
            {barWidth ? ' ' : ''}
            <Text color={item.iconColor}>{filled}</Text>
            <Text color={MUTED}>{empty}</Text>
            <Text color={MUTED}>{fit('', metaWidth - [...(item.meta ?? '')].length)}{item.meta ?? ''}</Text>
          </Button>
          {isOpen && (
            <Box key={`more:${id}`} flexDirection="column" paddingLeft={hasTag ? 6 : 2}>
              {item.title && (
                <Text color={MUTED} wrap="truncate-end">
                  {item.title}
                </Text>
              )}
              {href && <Link key={`open:${id}`} href={href} label="open ↗" />}
              {(item.lines ?? []).map((line, i) => (
                <Text key={`${id}-l${i}`} color={line.color ?? MUTED} wrap="truncate-end">
                  {line.text}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    const group = (section: DockSection, one: DockGroup) => {
      const key = `${section.id}/${one.key}`
      const isClosed = isFolded(flipped, key, one.isFolded ?? false)
      return (
        <Box key={`group:${key}`} flexDirection="column">
          <Button key={`fold:${key}`} plain onPress={flip(key)}>
            <Text color={MUTED} bold>
              {isClosed ? '▸' : '▾'} {one.title.toUpperCase()}
            </Text>
            <Text color={MUTED}> {one.rows.length}</Text>
          </Button>
          {!isClosed && one.rows.map(item => row(section, item))}
        </Box>
      )
    }

    const block = (section: DockSection) => {
      const isClosed = isFolded(flipped, section.id, false)
      const groups = section.groups.filter(one => one.rows.length > 0)
      return (
        <Box key={`section:${section.id}`} flexDirection="column" marginBottom={1}>
          <Button key={`fold:${section.id}`} plain onPress={flip(section.id)}>
            <Text color={ACCENT} bold>
              {isClosed ? '▸' : '▾'} {section.title}
            </Text>
            {section.badge ? <Text color={MUTED}> {section.badge}</Text> : ''}
          </Button>
          {section.error && (
            <Text color="red" wrap="truncate-end">
              {section.error}
            </Text>
          )}
          {!isClosed && groups.map(one => group(section, one))}
          {!isClosed && groups.length === 0 && !section.error && <Text dimColor>Nothing here.</Text>}
          {!isClosed && section.footer && (
            <Text color={MUTED} wrap="truncate-end">
              {section.footer}
            </Text>
          )}
        </Box>
      )
    }

    const pickedHref = picked?.row.href
    const pickedId = picked ? picked.row.key : undefined

    return (
      <Box flexDirection="column">
        <Box key="header" backgroundColor={BAR_BG} paddingX={1} gap={2} width={e.props.bodyColumns || undefined}>
          <Text color={ACCENT} bold>
            ◆ dock
          </Text>
          <Text color={MUTED}>{statusLine(list) ?? ''}</Text>
        </Box>
        <Box key="body" flexDirection="column" paddingX={1} marginTop={1}>
          {list.length === 0 ? <Text dimColor>No sections yet. Mods add theirs with $.dock.publish.</Text> : list.map(block)}
        </Box>
        <Box key="actions" paddingX={1} gap={2}>
          {pickedHref && <Button key="act-open" label="open" hotkey="o" plain onPress={() => openUrl($, pickedHref)} />}
          {actionsFor(list, picked).map(({ section, action }) => (
            <Button
              key={`act-${section}-${action.id}`}
              label={action.label}
              hotkey={action.hotkey}
              plain
              onPress={() => press($, section, action.id, action.scope === 'row' ? pickedId : undefined)}
            />
          ))}
          <Button key="act-close" label="close" hotkey="c" plain onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        <Box key="hint" paddingX={1}>
          <Text color={MUTED}>ctrl+x tab: keys here · ↑↓ pick · enter details · click a heading to fold</Text>
        </Box>
      </Box>
    )
  })
}
