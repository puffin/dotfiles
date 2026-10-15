import { describe, expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Shared } from '../types'
import { age, announcement, arrivals, askText, badge, classify, compileSkip, duty, isShared, searches, shortRepo, toQueue, toSection, toText } from './queue'
import type { PrNode, SearchResult, Settings } from './queue'

const NOW = Date.parse('2026-10-15T12:00:00Z')
const ME = 'me-at-work'
const S: Settings = { login: ME, staleDays: 30, skipAuthors: compileSkip('^ge-svc-|\\[bot\\]$') }

function pr(n: number, over: Partial<PrNode> & { mine?: PrNode['reviews']['nodes'][number] } = {}): PrNode {
  const { mine, ...rest } = over
  return {
    number: n,
    title: `PR ${n}`,
    url: `https://github.com/giant-eagle/repo/pull/${n}`,
    isDraft: false,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-14T00:00:00Z',
    headRefOid: 'head',
    repository: { nameWithOwner: 'giant-eagle/repo' },
    author: { __typename: 'User', login: 'alice' },
    reviews: { nodes: mine ? [mine] : [] },
    commits: { nodes: [{ commit: { committedDate: '2026-10-14T00:00:00Z' } }] },
    timelineItems: { nodes: [] },
    ...rest,
  }
}
const reviewed = (state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED', oid = 'head') => ({ state, submittedAt: '2026-10-13T00:00:00Z', commit: { oid } })

describe('classify', () => {
  test('asked and not reviewed is Review; asked again after reviewing is Re-review', () => {
    expect(classify(pr(1), true, S)?.bucket).toBe('review')
    expect(classify(pr(1, { mine: reviewed('APPROVED') }), true, S)).toMatchObject({ bucket: 'rereview', reason: 're-requested' })
  })

  test('your review on an older head is Re-review, on today’s head is Waiting', () => {
    expect(classify(pr(2, { mine: reviewed('CHANGES_REQUESTED', 'old') }), false, S)).toMatchObject({ bucket: 'rereview', reason: 'new commits' })
    expect(classify(pr(2, { mine: reviewed('COMMENTED', 'old') }), false, S)?.bucket).toBe('rereview')
    expect(classify(pr(2, { mine: reviewed('CHANGES_REQUESTED') }), false, S)).toMatchObject({ bucket: 'waiting', reason: 'changes requested' })
  })

  test('approved, drafts, bots, service accounts and your own PRs need nothing', () => {
    expect(classify(pr(3, { mine: reviewed('APPROVED', 'old') }), false, S)).toBeUndefined()
    expect(classify(pr(3, { isDraft: true }), true, S)).toBeUndefined()
    expect(classify(pr(3, { author: { __typename: 'Bot', login: 'dependabot' } }), true, S)).toBeUndefined()
    expect(classify(pr(3, { author: { __typename: 'User', login: 'ge-svc-fed' } }), true, S)).toBeUndefined()
    expect(classify(pr(3, { author: { __typename: 'User', login: ME } }), true, S)).toBeUndefined()
  })

  test('a request naming you dates the wait, ahead of a team request', () => {
    const events = {
      nodes: [
        { createdAt: '2026-10-10T00:00:00Z', requestedReviewer: { __typename: 'User', login: ME } },
        { createdAt: '2026-10-12T00:00:00Z', requestedReviewer: { __typename: 'Team' } },
        { createdAt: '2026-10-11T00:00:00Z', requestedReviewer: { __typename: 'User', login: 'bob' } },
      ],
    }
    expect(classify(pr(4, { timelineItems: events }), true, S)?.since).toBe(Date.parse('2026-10-10T00:00:00Z'))
    const teamOnly = { nodes: events.nodes.slice(1) }
    expect(classify(pr(4, { timelineItems: teamOnly }), true, S)?.since).toBe(Date.parse('2026-10-12T00:00:00Z'))
  })
})

const RESULT: SearchResult = {
  data: {
    requested: { nodes: [pr(10), pr(11, { mine: reviewed('COMMENTED') })] },
    reviewed: {
      nodes: [
        pr(11, { mine: reviewed('COMMENTED') }),
        pr(12, { mine: reviewed('CHANGES_REQUESTED', 'old'), commits: { nodes: [{ commit: { committedDate: '2026-10-15T09:00:00Z' } }] } }),
        pr(13, { mine: reviewed('CHANGES_REQUESTED') }),
        pr(14, {
          mine: { state: 'CHANGES_REQUESTED', submittedAt: '2022-04-18T00:00:00Z', commit: { oid: 'old' } },
          commits: { nodes: [{ commit: { committedDate: '2022-04-19T00:00:00Z' } }] },
          updatedAt: '2022-04-19T00:00:00Z',
        }),
        // Touched last week, but its last push and your review are a year old.
        pr(16, {
          mine: { state: 'DISMISSED' as 'COMMENTED', submittedAt: '2025-06-16T00:00:00Z', commit: { oid: 'old' } },
          commits: { nodes: [{ commit: { committedDate: '2025-06-16T00:00:00Z' } }] },
        }),
        pr(15, { mine: reviewed('APPROVED') }),
      ],
    },
  },
}

describe('the queue', () => {
  test('both searches merge; stale PRs, by the push or review behind them, are counted not listed', () => {
    const q = toQueue(RESULT, S, NOW)
    expect(q.items.map(i => [i.number, i.bucket])).toEqual([
      [12, 'rereview'],
      [13, 'waiting'],
      [10, 'review'],
      [11, 'rereview'],
    ])
    expect(q.stale).toBe(2)
    expect(badge(q)).toBe('⟲ 2 re-review · 1 review')
    expect(badge({ ...q, items: q.items.filter(i => i.bucket === 'review') })).toBe('○ 1 review')
    // Plain JSON: no key left standing as undefined.
    expect(q.items.find(i => i.number === 10)).not.toHaveProperty('reviewedCommit')
  })

  test('an answer with errors is an error', () => {
    expect(toQueue({ errors: [{ message: 'Bad credentials' }] }, S, NOW).error).toBe('Bad credentials')
  })

  test('the section: re-review first, waiting folded, attention is the re-review count', () => {
    const section = toSection(toQueue(RESULT, S, NOW), NOW)
    expect(section.attention).toBe(2)
    expect(section.groups.map(g => [g.key, g.rows.length, g.isFolded ?? false])).toEqual([
      ['rereview', 2, false],
      ['review', 1, false],
      ['waiting', 1, true],
    ])
    const row = section.groups[0]?.rows[0]
    expect(row).toMatchObject({ key: 'https://github.com/giant-eagle/repo/pull/12', icon: '⟲', label: 'repo#12', aside: 'alice', detail: 'PR 12', meta: '3h' })
    expect(row?.href).toBe('https://github.com/giant-eagle/repo/pull/12')
    expect(row?.lines?.map(l => l.text)).toEqual(['giant-eagle/repo#12 by alice', 'new commits 3h ago', 'you last reviewed old'])
    expect(section.actions?.map(a => [a.id, a.hotkey, a.scope])).toEqual([
      ['ask', 'a', 'row'],
      ['refresh', 'r', 'section'],
    ])
    expect(section.footer).toContain('2 stale hidden')
  })

  test('the text names every PR with its URL', () => {
    const text = toText(toQueue(RESULT, S, NOW), NOW)
    expect(text).toContain('Re-review (2)')
    expect(text).toContain('giant-eagle/repo#12 PR 12 — alice, new commits 3h ago — https://github.com/giant-eagle/repo/pull/12')
  })

  test('arrivals are the bucket’s PRs not seen before, announced by name or by count', () => {
    const q = toQueue(RESULT, S, NOW)
    const fresh = arrivals(q, 'rereview', ['https://github.com/giant-eagle/repo/pull/12'])
    expect(fresh.map(i => i.number)).toEqual([11])
    expect(announcement('rereview', fresh)).toBe('⟲ Re-review: repo#11 PR 11')
    expect(announcement('rereview', arrivals(q, 'rereview', []))).toBe('⟲ 2 PRs ready for re-review')
    expect(announcement('review', arrivals(q, 'review', []))).toBe('○ Review requested: repo#10 PR 10')
    expect(announcement('review', [])).toBeUndefined()
  })

  test('repos read short; ask Claude names the PR, the last reviewed commit, and posts nothing', () => {
    expect(shortRepo('giant-eagle/GE.Corporate.CloudOps.Infra')).toBe('Corporate.Infra')
    expect(shortRepo('giant-eagle/GE.DCOM.Grocery.Core')).toBe('DCOM.Grocery.Core')
    const q = toQueue(RESULT, S, NOW)
    const text = askText(q.items.find(i => i.number === 12)!)
    expect(text).toContain('Re-review https://github.com/giant-eagle/repo/pull/12')
    expect(text).toContain('I last reviewed commit old.')
    expect(text.endsWith("Don't post anything on GitHub; I'll write the review myself.")).toBe(true)
    expect(askText(q.items.find(i => i.number === 10)!)).toContain('my review was requested')
  })

  test('searches scope to the org, or to everything', () => {
    expect(searches('giant-eagle').reviewed).toBe('is:pr is:open archived:false sort:updated-desc org:giant-eagle reviewed-by:@me -author:@me')
    expect(searches('').requested).toBe('is:pr is:open archived:false sort:updated-desc review-requested:@me')
    expect(age(90 * 60_000)).toBe('2h')
    expect(compileSkip('(')).toBeNull()
  })
})

const URL_12 = 'https://github.com/giant-eagle/repo/pull/12'

// A stand-in for the dock mod: it takes the sections, and draws the Reviews
// section's buttons under the keys the real dock gives them. It runs apart
// from this file, so it leaves what it was handed in the host's store.
const dock: Plugin = {
  name: 'dock',
  register(on) {
    let actions: string[] = []
    let opened = 0
    type Store = { store: { set: (key: string, value: unknown) => Promise<void> } }
    on('engine.create', async ($, e, next) => ({ ...(await next(e)), dock: { publish: async () => true, remove: async () => true, open: async () => true, action: async () => true } }))
    on('dock.publish' as never, (async ($: Store, e: { id: string; actions?: { id: string }[] }, next: (e: unknown) => unknown) => {
      if (e.id === 'reviews') actions = (e.actions ?? []).map(a => a.id)
      await $.store.set(`dock:${e.id}`, e)
      return next(e)
    }) as never)
    on('dock.open' as never, (async ($: Store, e: unknown, next: (e: unknown) => unknown) => {
      await $.store.set('dock:opened', ++opened)
      return next(e)
    }) as never)
    on('ui.render', { component: 'Pane', requestId: 'dock' }, async ($, e) => {
      const { Box, Button } = $.ui.resolve(e)
      return h(Box, {}, ...actions.map(id => h(Button, { key: `act-reviews-${id}`, onPress: () => undefined }, id))) as never
    })
  },
}

type Seen = {
  self: string
  argv: string[][]
  env: (Record<string, string> | undefined)[]
  store: Map<string, unknown>
  toasts: string[]
  notified: string[]
  sounds: string[]
  prompts: string[]
  statuses: (string | undefined)[]
  opened: number
  isPaneShown: boolean
  answer: SearchResult
}
const seen = (answer: SearchResult): Seen => ({
  self: 'me',
  argv: [],
  env: [],
  store: new Map(),
  toasts: [],
  notified: [],
  sounds: [],
  prompts: [],
  statuses: [],
  opened: 0,
  isPaneShown: false,
  answer,
})

const published = (saw: Seen) => {
  const section = saw.store.get('dock:reviews') as { badge?: string; attention?: number } | undefined
  return section && { badge: section.badge, attention: section.attention }
}
const polls = (saw: Seen) => saw.argv.filter(a => a[1] === 'api').length
const shared = (saw: Seen) => saw.store.get('queue') as Shared | undefined

function host(on: On, saw: Seen) {
  const arg = <T>(e: unknown) => e as T
  on('process.run', ($, e) => {
    const { argv, init } = arg<{ argv: string[]; init?: { env?: Record<string, string> } }>(e)
    saw.argv.push(argv)
    saw.env.push(init?.env)
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (argv[1] === 'auth') return out('tok-work\n')
    if (argv[1] === 'api') return out(JSON.stringify(saw.answer))
    return { value: { exitCode: 1, stdout: '', stderr: 'unexpected' } } as never
  })
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('session.id', () => ({ value: saw.self }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__review-queue__list' } }) as never)
  on('store.keys', () => ({ value: [...saw.store.keys()] }) as never)
  on('store.get', ($, e) => ({ value: saw.store.get(arg<{ key: string }>(e).key) }) as never)
  on('store.set', ($, e) => {
    const { key, value } = arg<{ key: string; value: unknown }>(e)
    saw.store.set(key, structuredClone(value))
    return { value: undefined } as never
  })
  on('store.delete', ($, e) => {
    saw.store.delete(arg<{ key: string }>(e).key)
    return { value: undefined } as never
  })
  on('ui.open', () => {
    saw.opened++
    return { value: { isPlaced: false, reason: 'test' } } as never
  })
  on('ui.panes', () => ({ value: [{ id: 'review-queue', title: 'review-queue', isShown: saw.isPaneShown, isFocused: false, isPlaced: saw.isPaneShown }] }) as never)
  on('ui.focus', () => ({}) as never)
  on('ui.status', ($, e) => {
    saw.statuses.push(arg<{ text?: string }>(e).text)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    saw.toasts.push(arg<{ text: string }>(e).text)
    return { value: undefined } as never
  })
  on('ui.notify', ($, e) => {
    saw.notified.push(arg<{ text: string }>(e).text)
    return { value: { isDelivered: true } } as never
  })
  on('audio.play', ($, e) => {
    saw.sounds.push(arg<{ clip: { asset: string } }>(e).clip.asset)
    return { value: undefined } as never
  })
  on('prompt.submit', ($, e) => {
    saw.prompts.push(arg<{ text: string }>(e).text)
    return { drop: 'test' } as never
  })
}

const pick = ($: { ui: { focus: (input: never) => Promise<unknown> } }, requestId: string, element: string) =>
  $.ui.focus({ component: 'Pane', requestId, element, origin: { kind: 'person' } } as never)

describe('ownership', () => {
  test('a poll is due for the owner; another session takes over once the owner is a poll and a minute quiet', () => {
    const q: Shared = { items: [], stale: 0, fetchedAt: 0, owner: 'a', checkedAt: 0 }
    const POLL = 300_000
    expect(duty(undefined, 'a', 0, POLL)).toBe('fetch')
    expect(duty(q, 'a', POLL - 1, POLL)).toBe('adopt')
    expect(duty(q, 'a', POLL, POLL)).toBe('fetch')
    expect(duty(q, 'b', POLL, POLL)).toBe('adopt')
    expect(duty(q, 'b', POLL + 60_001, POLL)).toBe('fetch')
    expect(isShared(q)).toBe(true)
    expect(isShared({ items: [] })).toBe(false)
  })
})

describe('polling', () => {
  test('polls as the named account, publishes to the dock, and alerts only on what is new', { plugins: [dock], options: { account: ME } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)

    expect(saw.argv[0]).toEqual(['gh', 'auth', 'token', '--user', ME])
    expect(saw.argv[1]?.slice(0, 3)).toEqual(['gh', 'api', 'graphql'])
    expect(saw.argv[1]).toContain(`login=${ME}`)
    expect(saw.env[1]).toEqual({ GH_TOKEN: 'tok-work' })
    expect(published(saw)).toEqual({ badge: '⟲ 2 re-review · 1 review', attention: 2 })
    // The list is in the store for every session, this one its owner.
    expect(shared(saw)).toMatchObject({ owner: 'me', checkedAt: NOW })
    // Docked: the dock's status entry counts it, this mod's says nothing.
    expect(saw.statuses.at(-1)).toBeUndefined()
    expect(saw.opened).toBe(0)
    // The first run ever learns what is there without a toast.
    expect([...saw.toasts, ...saw.notified, ...saw.sounds]).toEqual([])

    // Checks between polls read the store; GitHub is asked once a poll.
    await clock.advance(4 * 60_000)
    expect(polls(saw)).toBe(1)

    // PR 13's author pushed and PR 17 asks for you: each is announced once.
    // By default a new request toasts; a re-review also notifies and chimes.
    const answer = structuredClone(RESULT)
    const moved = answer.data!.reviewed.nodes.find(n => n?.number === 13)!
    moved.headRefOid = 'newer'
    answer.data!.requested.nodes.push(pr(17))
    saw.answer = answer
    await clock.advance(60_000)
    expect(polls(saw)).toBe(2)
    expect(published(saw)).toEqual({ badge: '⟲ 3 re-review · 2 review', attention: 3 })
    expect(saw.toasts).toEqual(['⟲ Re-review: repo#13 PR 13', '○ Review requested: repo#17 PR 17'])
    expect(saw.notified).toEqual(['⟲ Re-review: repo#13 PR 13'])
    expect(saw.sounds).toEqual(['sounds/waiting.wav'])
    await clock.advance(5 * 60_000)
    expect(saw.toasts).toHaveLength(2)

    // The model's tool reads the last poll.
    const asked = await $.tool.call({ tool: 'mcp__review-queue__list' } as never)
    expect(String((asked as { result?: unknown }).result)).toContain('Re-review (3)')
    expect(polls(saw)).toBe(3)
  })

  test('another session’s fresh list is shown without asking GitHub, or alerting', { plugins: [dock], options: { account: ME } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const saw = seen(RESULT)
    const theirs: Shared = { ...toQueue(RESULT, S, NOW - 60_000), owner: 'other', checkedAt: NOW - 60_000 }
    saw.store.set('queue', theirs)
    saw.store.set('rereview-seen', [])
    saw.store.set('review-seen', [])
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    expect(polls(saw)).toBe(0)
    expect(published(saw)).toEqual({ badge: '⟲ 2 re-review · 1 review', attention: 2 })
    expect(saw.toasts).toEqual([])

    // Its next poll lands in the store: shown here within a check.
    saw.store.set('queue', { ...theirs, items: theirs.items.filter(i => i.bucket !== 'review'), checkedAt: NOW + 3 * 60_000 })
    await clock.advance(3 * 60_000 + 30_000)
    expect(published(saw)).toEqual({ badge: '⟲ 2 re-review', attention: 2 })
    expect(polls(saw)).toBe(0)

    // It goes quiet: a poll and a minute on, this session asks, and owns the list.
    await clock.advance(6 * 60_000)
    expect(polls(saw)).toBe(1)
    expect(shared(saw)?.owner).toBe('me')

    // It comes back and asks again: this session goes back to reading.
    saw.store.set('queue', { ...shared(saw)!, owner: 'other', checkedAt: NOW + 9 * 60_000 + 60_000 })
    await clock.advance(5 * 60_000)
    expect(polls(saw)).toBe(1)
  })

  test('a failed refresh keeps the last list and says why', { plugins: [dock], options: { account: ME } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    saw.answer = { errors: [{ message: 'Bad credentials' }] }
    await clock.advance(5 * 60_000)
    expect(published(saw)).toEqual({ badge: '⟲ 2 re-review · 1 review', attention: 2 })
    const text = await $.tool.call({ tool: 'mcp__review-queue__list' } as never)
    expect(String((text as { result?: unknown }).result)).toContain('Last refresh failed: Bad credentials')
    // A failure waits out the poll like a success: no retry on every check.
    await clock.advance(60_000)
    expect(polls(saw)).toBe(2)
  })

  test('off silences a channel; always notifies new requests too', { plugins: [dock], options: { account: ME, toast: 'off', notify: 'always', sound: 'off' } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    const answer = structuredClone(RESULT)
    answer.data!.requested.nodes.push(pr(17))
    saw.answer = answer
    await clock.advance(5 * 60_000)
    expect(saw.toasts).toEqual([])
    expect(saw.notified).toEqual(['○ Review requested: repo#17 PR 17'])
    expect(saw.sounds).toEqual([])
  })

  test('the dock’s ask Claude submits the picked PR’s prompt; refresh polls; /review-queue opens the dock', { plugins: [dock], options: { account: ME } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    const ui = await $.ui.mount({ plugin: 'dock', surface: 'terminal', component: 'Pane', requestId: 'dock', props: { bodyColumns: 80 } } as never)

    await pick($, 'dock', `row:reviews:${URL_12}`)
    await pick($, 'dock', 'act-reviews-ask')
    await $.ui.press({ plugin: 'dock', key: 'act-reviews-ask' } as never)
    expect(saw.prompts).toHaveLength(1)
    expect(saw.prompts[0]).toContain(`Re-review ${URL_12}`)
    // Another section's row picks nothing here.
    await pick($, 'dock', `row:runs:tk:job-1`)
    await $.ui.press({ plugin: 'dock', key: 'act-reviews-ask' } as never)
    expect(saw.prompts).toHaveLength(1)

    // Refresh asks GitHub now, whoever owned the list.
    saw.store.set('queue', { ...shared(saw)!, owner: 'other' })
    await $.ui.press({ plugin: 'dock', key: 'act-reviews-refresh' } as never)
    expect(polls(saw)).toBe(2)
    expect(shared(saw)?.owner).toBe('me')
    await ui.unmount()

    const ran = await $.command.run({ command: 'review-queue', args: '' } as never)
    expect(String((ran as { text?: unknown }).text)).toContain('Re-review (2)')
    expect(saw.store.get('dock:opened')).toBe(1)
    expect(saw.opened).toBe(0)
  })
})

describe('without the dock', () => {
  test('its own pane: opens on re-reviews, rows in groups, details, buttons; the status line while it is closed', { options: { account: ME } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    expect(saw.opened).toBe(1)
    expect(saw.statuses.at(-1)).toBe('⟲ 2 re-review · 1 review')
    // The same re-reviews again open nothing.
    await clock.advance(5 * 60_000)
    expect(saw.opened).toBe(1)

    const ui = await $.ui.mount({ plugin: 'review-queue', surface: 'terminal', component: 'Pane', requestId: 'review-queue', props: { bodyColumns: 100 } } as never)
    const text = (await ui.find({ key: `row:${URL_12}` }))?.text ?? ''
    expect(text).toContain('⟲')
    expect(text).toContain('repo#12 · alice')
    expect(text).toContain('PR 12')
    expect((await ui.find({ key: 'fold:rereview' }))?.text).toContain('RE-REVIEW 2')
    // Waiting is folded: its heading and count, no rows.
    expect((await ui.find({ key: 'fold:waiting' }))?.text).toContain('WAITING ON AUTHOR 1')
    expect(await ui.find({ key: 'row:https://github.com/giant-eagle/repo/pull/13' })).toBeFalsy()
    await ui.press({ key: 'fold:waiting' })
    expect(await ui.find({ key: 'row:https://github.com/giant-eagle/repo/pull/13' })).toBeTruthy()

    // Enter opens the details, with the link.
    expect(await ui.find({ type: 'Link' })).toBeFalsy()
    await ui.press({ key: `row:${URL_12}` })
    expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: URL_12 })
    expect((await ui.find({ key: `more:${URL_12}` }))?.text).toContain('you last reviewed old')

    // Nothing picked: refresh and close only. Picked: open and ask Claude too.
    expect(await ui.find({ key: 'act-ask' })).toBeFalsy()
    await pick($, 'review-queue', `row:${URL_12}`)
    expect(await ui.find({ key: 'act-open' })).toBeTruthy()
    await ui.press({ key: 'act-ask' })
    expect(saw.prompts[0]).toContain(`Re-review ${URL_12}`)
    const before = polls(saw)
    await ui.press({ key: 'act-refresh' })
    expect(polls(saw)).toBe(before + 1)
    await ui.unmount()

    // /review-queue opens the pane, and the status line goes while it is on screen.
    saw.isPaneShown = true
    await $.command.run({ command: 'review-queue', args: '' } as never)
    expect(saw.opened).toBe(2)
    expect(saw.statuses.at(-1)).toBeUndefined()
  })

  test('openPane off never opens by itself', { options: { account: ME, openPane: false } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    expect(saw.opened).toBe(0)
    expect(saw.statuses.at(-1)).toBe('⟲ 2 re-review · 1 review')
  })
})
