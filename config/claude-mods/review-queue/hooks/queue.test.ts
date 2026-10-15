import { describe, expect, mock, test } from 'claude-code/testing'
import type { Plugin } from 'claude-code/testing'
import type { On } from 'claude-code'

import { age, announcement, arrivals, askText, badge, classify, compileSkip, searches, shortRepo, toQueue, toSection, toText } from './queue'
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

// The dock's noun, standing in for the dock mod; its publishes reach the test's hook.
const dock: Plugin = {
  name: 'dock',
  register(on) {
    on('engine.create', async ($, e, next) => {
      const built = await next(e)
      return { ...built, dock: { publish: async () => true, remove: async () => true, open: async () => true, action: async () => true } }
    })
    // A press of one of the section's buttons. The pane raises it from a
    // button's handler, outside any turn; a timer stands in for that here.
    on('command.run', { command: 'press' }, async ($, e) => {
      const press = JSON.parse((e as unknown as { args: string }).args)
      $.clock.after(0, () => void $.dock.action(press))
      return { text: 'pressed' }
    })
  },
}

type Seen = {
  argv: string[][]
  env: (Record<string, string> | undefined)[]
  published: { badge?: string; attention?: number }[]
  toasts: string[]
  notified: string[]
  sounds: string[]
  prompts: string[]
  answer: SearchResult
}
const seen = (answer: SearchResult): Seen => ({ argv: [], env: [], published: [], toasts: [], notified: [], sounds: [], prompts: [], answer })

function host(on: On, saw: Seen) {
  on('process.run', ($, e) => {
    const { argv, init } = e as unknown as { argv: string[]; init?: { env?: Record<string, string> } }
    saw.argv.push(argv)
    saw.env.push(init?.env)
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (argv[1] === 'auth') return out('tok-work\n')
    if (argv[1] === 'api') return out(JSON.stringify(saw.answer))
    return { value: { exitCode: 1, stdout: '', stderr: 'unexpected' } } as never
  })
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__review-queue__list' } }) as never)
  on('dock.publish' as never, (($: unknown, e: { badge?: string; attention?: number }) => {
    saw.published.push({ badge: e.badge, attention: e.attention })
    return { value: true }
  }) as never)
  on('ui.toast', ($, e) => {
    saw.toasts.push((e as unknown as { text: string }).text)
    return { value: undefined } as never
  })
  on('ui.notify', ($, e) => {
    saw.notified.push((e as unknown as { text: string }).text)
    return { value: { isDelivered: true } } as never
  })
  on('audio.play', ($, e) => {
    saw.sounds.push((e as unknown as { clip: { asset: string } }).clip.asset)
    return { value: undefined } as never
  })
  on('prompt.submit', ($, e) => {
    saw.prompts.push((e as unknown as { text: string }).text)
    return { drop: 'test' } as never
  })
}

describe('polling', () => {
  test('polls as the named account, publishes to the dock, and alerts only on what is new', { plugins: [dock], options: { account: ME } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    mock.store(on)
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)

    expect(saw.argv[0]).toEqual(['gh', 'auth', 'token', '--user', ME])
    expect(saw.argv[1]?.slice(0, 3)).toEqual(['gh', 'api', 'graphql'])
    expect(saw.argv[1]).toContain(`login=${ME}`)
    expect(saw.env[1]).toEqual({ GH_TOKEN: 'tok-work' })
    expect(saw.published.at(-1)).toEqual({ badge: '⟲ 2 re-review · 1 review', attention: 2 })
    // The first run ever learns what is there without a toast.
    expect([...saw.toasts, ...saw.notified, ...saw.sounds]).toEqual([])

    // PR 13's author pushed and PR 17 asks for you: each is announced once.
    // By default a new request toasts; a re-review also notifies and chimes.
    const answer = structuredClone(RESULT)
    const moved = answer.data!.reviewed.nodes.find(n => n?.number === 13)!
    moved.headRefOid = 'newer'
    answer.data!.requested.nodes.push(pr(17))
    saw.answer = answer
    await clock.advance(5 * 60_000)
    expect(saw.published.at(-1)).toEqual({ badge: '⟲ 3 re-review · 2 review', attention: 3 })
    expect(saw.toasts).toEqual(['⟲ Re-review: repo#13 PR 13', '○ Review requested: repo#17 PR 17'])
    expect(saw.notified).toEqual(['⟲ Re-review: repo#13 PR 13'])
    expect(saw.sounds).toEqual(['sounds/waiting.wav'])
    await clock.advance(5 * 60_000)
    expect(saw.toasts).toHaveLength(2)

    // The model's tool reads the last poll.
    const asked = await $.tool.call({ tool: 'mcp__review-queue__list' } as never)
    expect(String((asked as { result?: unknown }).result)).toContain('Re-review (3)')
  })

  test('a failed refresh keeps the last list and says why', { plugins: [dock], options: { account: ME } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    mock.store(on)
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    saw.answer = { errors: [{ message: 'Bad credentials' }] }
    await clock.advance(5 * 60_000)
    expect(saw.published.at(-1)).toEqual({ badge: '⟲ 2 re-review · 1 review', attention: 2 })
    const text = await $.tool.call({ tool: 'mcp__review-queue__list' } as never)
    expect(String((text as { result?: unknown }).result)).toContain('Last refresh failed: Bad credentials')
  })

  test('off silences a channel; always notifies new requests too', { plugins: [dock], options: { account: ME, toast: 'off', notify: 'always', sound: 'off' } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    mock.store(on)
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

  test('the dock’s ask Claude submits the PR’s prompt; refresh polls; /review-queue answers', { plugins: [dock], options: { account: ME } }, async ($, on) => {
    const clock = mock.clock(on, { now: NOW })
    mock.store(on)
    const saw = seen(RESULT)
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    const url = 'https://github.com/giant-eagle/repo/pull/12'
    const press = async (args: object) => {
      await $.command.run({ command: 'press', args: JSON.stringify(args) } as never)
      await clock.advance(0)
    }

    await press({ section: 'reviews', action: 'ask', row: url })
    expect(saw.prompts).toHaveLength(1)
    expect(saw.prompts[0]).toContain(`Re-review ${url}`)
    // Another section's press is not this mod's.
    await press({ section: 'runs', action: 'ask', row: url })
    expect(saw.prompts).toHaveLength(1)

    const polls = saw.argv.filter(a => a[1] === 'api').length
    await press({ section: 'reviews', action: 'refresh' })
    expect(saw.argv.filter(a => a[1] === 'api').length).toBe(polls + 1)

    const ran = await $.command.run({ command: 'review-queue', args: '' } as never)
    expect(String((ran as { text?: unknown }).text)).toContain('Re-review (2)')
  })
})
