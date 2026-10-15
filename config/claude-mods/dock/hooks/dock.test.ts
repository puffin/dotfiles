import { describe, expect, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { DockSection } from '../types'
import { actionsFor, bar, columns, findRow, fit, isFolded, statusLine, toggle, upsert, without } from './dock'

const URL_1 = 'https://github.com/o/a/pull/1'
const reviews: DockSection = {
  id: 'reviews',
  title: 'Reviews',
  order: 10,
  badge: '⟲ 1 re-review · 1 review',
  attention: 1,
  groups: [
    {
      key: 'rereview',
      title: 'Re-review',
      rows: [{ key: URL_1, icon: '⟲', iconColor: 'yellow', label: 'a#1', aside: 'bob', detail: 'Fix the thing', meta: '2h', href: URL_1, title: 'Fix the thing', lines: [{ text: 'new commits 2h ago' }] }],
    },
    { key: 'waiting', title: 'Waiting on author', isFolded: true, rows: [{ key: 'b#2', label: 'b#2', detail: 'Other thing', actions: [] }] },
  ],
  actions: [
    { id: 'ask', label: 'ask Claude', hotkey: 'a', scope: 'row' },
    { id: 'refresh', label: 'refresh', hotkey: 'r', scope: 'section' },
  ],
  footer: 'updated 10:00',
}
const runs: DockSection = {
  id: 'runs',
  title: 'Runs',
  order: 20,
  badge: '⟳ 1 running',
  groups: [{ key: 'running', title: 'Running', rows: [{ key: 'tk:1', tag: 'tk', label: 'job 1', progress: 0.5, meta: '1m02s' }] }],
  // Clashes with reviews' `r` and the dock's own `c`.
  actions: [
    { id: 'clear', label: 'clear done', hotkey: 'c', scope: 'section' },
    { id: 'reload', label: 'reload', hotkey: 'r', scope: 'section' },
  ],
}

describe('sections', () => {
  test('upsert replaces by id and sorts by order', () => {
    const list = upsert(upsert([], runs), reviews)
    expect(list.map(s => s.id)).toEqual(['reviews', 'runs'])
    const again = upsert(list, { ...reviews, badge: '' })
    expect(again).toHaveLength(2)
    expect(again[0]?.badge).toBe('')
    expect(without(again, 'runs').map(s => s.id)).toEqual(['reviews'])
  })

  test('the status line joins the badges, and is empty with none', () => {
    expect(statusLine([reviews, runs])).toBe('⟲ 1 re-review · 1 review   ⟳ 1 running')
    expect(statusLine([{ ...reviews, badge: '' }])).toBeUndefined()
  })

  test('a toggle flips a fold against its default', () => {
    expect(isFolded([], 'x', true)).toBe(true)
    expect(isFolded(toggle([], 'x'), 'x', true)).toBe(false)
    expect(toggle(['x'], 'x')).toEqual([])
  })

  test('the action bar: the picked row’s actions, then every section’s, hotkeys never doubled', () => {
    const list = [reviews, runs]
    const picked = findRow(list, `reviews:${URL_1}`)
    expect(picked?.row.label).toBe('a#1')
    const bar1 = actionsFor(list, picked).map(({ section, action }) => [section, action.id, action.hotkey])
    expect(bar1).toEqual([
      ['reviews', 'ask', 'a'],
      ['reviews', 'refresh', 'r'],
      ['runs', 'clear', undefined],
      ['runs', 'reload', undefined],
    ])
    // A row that offers none of its section's row actions; nothing picked.
    expect(actionsFor(list, findRow(list, 'reviews:b#2')).map(a => a.action.id)).toEqual(['refresh', 'clear', 'reload'])
    expect(actionsFor(list, undefined).map(a => a.action.id)).toEqual(['refresh', 'clear', 'reload'])
  })

  test('columns and fit follow runwatch: a bar from 70 cells, padded cells', () => {
    expect(columns(98, true, true)).toEqual({ barWidth: 12, metaWidth: 7, nameWidth: 36, detailWidth: 36 })
    expect(columns(58, false, true).barWidth).toBe(0)
    expect(fit('abcdef', 4)).toBe('abc…')
    expect(fit('ab', 4)).toBe('ab  ')
    expect(bar(0.5, 4)).toEqual(['━━', '──'])
  })
})

type Seen = { statuses: (string | undefined)[]; opened: number; isShown: boolean; toasts: string[] }

function host(on: On, saw: Seen) {
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.focus', () => ({}) as never)
  on('ui.open', () => {
    saw.opened++
    return { value: { isPlaced: false, reason: 'test' } } as never
  })
  on('ui.panes', () => ({ value: [{ id: 'dock', title: 'dock', isShown: saw.isShown, isFocused: false, isPlaced: saw.isShown, plugin: 'dock' }] }) as never)
  on('ui.status', ($, e) => {
    saw.statuses.push((e as unknown as { text?: string }).text)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    saw.toasts.push((e as unknown as { text: string }).text)
    return { value: undefined } as never
  })
}

// A feature mod, as review-queue is: it publishes on /publish and hears its
// own presses through `dock.action`.
const feature: Plugin = {
  name: 'feature',
  register(on) {
    on('command.run', { command: 'publish' }, async ($, e) => {
      await $.dock.publish(JSON.parse((e as unknown as { args: string }).args))
      return { text: 'published' }
    })
    on('dock.action', async ($, e, next) => {
      $.ui.toast(`pressed ${JSON.stringify(e)}`)
      return next(e)
    })
  },
}

const publish = ($: { command: { run: (input: never) => Promise<unknown> } }, section: DockSection) =>
  $.command.run({ command: 'publish', args: JSON.stringify(section) } as never)

describe('the pane', () => {
  test('rows in columns, details on Enter, folds on a heading', { plugins: [feature] }, async ($, on) => {
    const saw: Seen = { statuses: [], opened: 0, isShown: false, toasts: [] }
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await publish($, reviews)
    await publish($, runs)

    // Attention rose from nothing: the dock asked to open, and the status stands in.
    expect(saw.opened).toBe(1)
    expect(saw.statuses.at(-1)).toBe('⟲ 1 re-review · 1 review   ⟳ 1 running')

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'dock', surface, component: 'Pane', requestId: 'dock', props: { bodyColumns: 100 } } as never)
      const text = (await ui.find({ key: `row:reviews:${URL_1}` }))?.text ?? ''
      expect(text).toContain('⟲')
      expect(text).toContain('a#1 · bob')
      expect(text).toContain('Fix the thing')
      expect(text.trimEnd().endsWith('2h')).toBe(true)
      expect((await ui.find({ key: 'row:runs:tk:1' }))?.text).toContain('tk  job 1')
      expect((await ui.find({ key: 'row:runs:tk:1' }))?.text).toContain('━━━━━━')

      // Enter opens the details, with the link; again closes them.
      expect(await ui.find({ type: 'Link' })).toBeFalsy()
      await ui.press({ key: `row:reviews:${URL_1}` })
      expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: URL_1 })
      expect((await ui.find({ key: `more:reviews:${URL_1}` }))?.text).toContain('new commits 2h ago')
      await ui.press({ key: `row:reviews:${URL_1}` })
      expect(await ui.find({ type: 'Link' })).toBeFalsy()

      // Waiting is folded by its section's say: a heading and a count, no rows.
      expect((await ui.find({ key: 'fold:reviews/waiting' }))?.text).toContain('WAITING ON AUTHOR 1')
      expect(await ui.find({ key: 'row:reviews:b#2' })).toBeFalsy()
      await ui.press({ key: 'fold:reviews/waiting' })
      expect(await ui.find({ key: 'row:reviews:b#2' })).toBeTruthy()
      await ui.press({ key: 'fold:reviews/waiting' })
      await ui.press({ key: 'fold:reviews' })
      expect(await ui.find({ key: 'fold:reviews/rereview' })).toBeFalsy()
      await ui.press({ key: 'fold:reviews' })
      await ui.unmount()
    }
  })

  test('the picked row’s actions reach its mod through dock.action', { plugins: [feature] }, async ($, on) => {
    const saw: Seen = { statuses: [], opened: 0, isShown: false, toasts: [] }
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await publish($, reviews)
    const ui = await $.ui.mount({ plugin: 'dock', surface: 'terminal', component: 'Pane', requestId: 'dock', props: { bodyColumns: 80 } } as never)

    // Nothing picked: the standing actions and close, no open.
    expect(await ui.find({ key: 'act-reviews-refresh' })).toBeTruthy()
    expect(await ui.find({ key: 'act-reviews-ask' })).toBeFalsy()
    expect(await ui.find({ key: 'act-open' })).toBeFalsy()

    await $.ui.focus({ component: 'Pane', requestId: 'dock', element: `row:reviews:${URL_1}`, origin: { kind: 'person' } } as never)
    expect(await ui.find({ key: 'act-open' })).toBeTruthy()
    await ui.press({ key: 'act-reviews-ask' })
    expect(saw.toasts.at(-1)).toBe(`pressed {"section":"reviews","action":"ask","row":"${URL_1}"}`)

    // Moving onto the bar keeps the pick; a section action carries no row.
    await $.ui.focus({ component: 'Pane', requestId: 'dock', element: 'act-reviews-refresh', origin: { kind: 'person' } } as never)
    expect(await ui.find({ key: 'act-reviews-ask' })).toBeTruthy()
    await ui.press({ key: 'act-reviews-refresh' })
    expect(saw.toasts.at(-1)).toBe('pressed {"section":"reviews","action":"refresh"}')
    await ui.unmount()
  })

  test('the same attention again opens nothing', { plugins: [feature] }, async ($, on) => {
    const saw: Seen = { statuses: [], opened: 0, isShown: false, toasts: [] }
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await publish($, reviews)
    await publish($, reviews)
    expect(saw.opened).toBe(1)
  })

  test('openPane off never opens', { plugins: [feature], options: { openPane: false } }, async ($, on) => {
    const saw: Seen = { statuses: [], opened: 0, isShown: false, toasts: [] }
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await publish($, reviews)
    expect(saw.opened).toBe(0)
    expect(saw.statuses.at(-1)).toBe('⟲ 1 re-review · 1 review')
  })

  test('no status line while the pane is on screen', { plugins: [feature] }, async ($, on) => {
    const saw: Seen = { statuses: [], opened: 0, isShown: true, toasts: [] }
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await publish($, { ...reviews, attention: 0 })
    expect(saw.statuses.at(-1)).toBeUndefined()
  })
})
