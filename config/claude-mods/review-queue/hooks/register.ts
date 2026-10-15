import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Queue } from '../types'
import { QUERY, announcement, arrivals, askText, badge, byBucket, compileSkip, searches, toQueue, toSection, toText } from './queue'
import type { SearchResult, Settings } from './queue'

// PRs waiting on your review, and the ones you reviewed that changed since,
// polled from GitHub and handed to the dock as its Reviews section.

const TOOL = 'mcp__review-queue__list'
const COMMAND = 'review-queue'
// The dock section this mod owns; its presses come back as `dock.action`.
const SECTION = 'reviews'
// URLs already announced per bucket, across sessions: an alert says only what is new.
const SEEN_KEYS = { rereview: 'rereview-seen', review: 'review-seen' } as const
const SOUND = 'sounds/waiting.wav'
const queue = { plugin: 'review-queue', key: 'queue' } as const

// How much a channel announces, as runwatch's: new re-reviews and new review
// requests, only re-reviews, or nothing.
type Level = 'always' | 'rereview' | 'off'
type Config = Settings & { account: string; org: string; pollMs: number; toast: Level; notify: Level; sound: Level; toastMs: number }

const levelOf = (value: unknown, byDefault: Level): Level => (value === 'always' || value === 'rereview' || value === 'off' ? value : byDefault)

function settingsOf(options: PluginOptions): Config {
  const account = String(options.account ?? '').trim() || 'hatched-DavidMichon'
  return {
    account,
    login: account,
    org: String(options.org ?? 'giant-eagle').trim(),
    staleDays: Math.max(1, Number(options.staleDays ?? 30)),
    pollMs: Math.max(1, Number(options.pollMinutes ?? 5)) * 60_000,
    skipAuthors: compileSkip(String(options.skipAuthors ?? '^ge-svc-|\\[bot\\]$')),
    toast: levelOf(options.toast, 'always'),
    notify: levelOf(options.notify, 'rereview'),
    sound: levelOf(options.sound, 'rereview'),
    toastMs: Math.max(1, Number(options.toastSeconds ?? 10)) * 1000,
  }
}

const firstLine = (text: string) => text.trim().split('\n')[0] ?? ''

// The account named, not gh's active one: this machine's gh is also signed in
// as a personal account.
async function tokenOf($: EngineInterface, account: string) {
  const got = await $.process.run(['gh', 'auth', 'token', '--user', account], { timeoutMs: 10_000 }).catch(() => undefined)
  return got?.exitCode === 0 ? got.stdout.trim() : undefined
}

async function fetchQueue($: EngineInterface, s: Config, last: Queue | null): Promise<Queue> {
  const now = await $.clock.now()
  // A failed refresh keeps the last list and says why.
  const failed = (error: string): Queue => ({ items: last?.items ?? [], stale: last?.stale ?? 0, fetchedAt: last?.fetchedAt ?? now, error })
  const token = await tokenOf($, s.account)
  if (!token) return failed(`gh has no token for ${s.account}: gh auth login`)
  const q = searches(s.org)
  const ran = await $.process
    .run(['gh', 'api', 'graphql', '-f', `query=${QUERY}`, '-f', `requested=${q.requested}`, '-f', `reviewed=${q.reviewed}`, '-f', `login=${s.login}`], {
      env: { GH_TOKEN: token },
      timeoutMs: 30_000,
    })
    .catch((err: unknown) => ({ exitCode: 1, stdout: '', stderr: String(err) }))
  if (ran.exitCode !== 0) return failed(`gh api: ${firstLine(ran.stderr || ran.stdout)}`)
  try {
    const result = toQueue(JSON.parse(ran.stdout) as SearchResult, s, now)
    return result.error ? failed(result.error) : result
  } catch {
    return failed('gh api: unreadable answer')
  }
}

async function publish($: EngineInterface, list: Queue) {
  const now = await $.clock.now()
  try {
    await $.dock.publish(toSection(list, now))
  } catch {
    // No dock loaded: the status line carries the counts alone.
    $.ui.status(badge(list) || undefined)
  }
}

async function announce($: EngineInterface, s: Config, list: Queue) {
  const said: { bucket: 'rereview' | 'review'; text: string }[] = []
  for (const bucket of ['rereview', 'review'] as const) {
    const seen = (await $.store.get(SEEN_KEYS[bucket])) as string[] | undefined
    await $.store.set(SEEN_KEYS[bucket], byBucket(list, bucket).map(item => item.url))
    // The first run ever learns what is there without announcing it.
    if (seen === undefined) continue
    const text = announcement(bucket, arrivals(list, bucket, seen))
    if (text) said.push({ bucket, text })
  }
  const wants = (level: Level, bucket: string) => level === 'always' || (level === 'rereview' && bucket === 'rereview')
  for (const { bucket, text } of said) {
    if (wants(s.toast, bucket)) $.ui.toast(text, { timeoutMs: s.toastMs })
    if (wants(s.notify, bucket)) void $.ui.notify(text, { title: 'review-queue' }).catch(() => undefined)
  }
  if (said.some(({ bucket }) => wants(s.sound, bucket))) void $.audio.play({ asset: SOUND }).catch(() => undefined)
}

// One refresh at a time: a poll and /review-queue landing together share it.
let inflight: Promise<Queue> | undefined

function refresh($: EngineInterface, s: Config) {
  inflight ??= (async () => {
    const last = (await $.state.get(queue)).value ?? null
    const list = await fetchQueue($, s, last)
    await $.state.set(queue, list)
    await publish($, list)
    if (!list.error) await announce($, s, list)
    return list
  })().finally(() => {
    inflight = undefined
  })
  return inflight
}

// The last poll, or a fresh one when there is none or it is asked for.
async function current($: EngineInterface, s: Config, isFresh: boolean) {
  const last = (await $.state.get(queue)).value
  return !isFresh && last ? last : refresh($, s)
}

// The dock's buttons on the Reviews section: ask Claude about the picked PR,
// or refresh now.
async function onPress($: EngineInterface, s: Config, action: string, row: string | undefined) {
  if (action === 'refresh') {
    await refresh($, s)
    return
  }
  if (action !== 'ask') return
  const item = (await $.state.get(queue)).value?.items.find(one => one.url === row)
  if (item) await $.prompt.submit({ text: askText(item) }).catch(() => undefined)
}

export const register: Register = (on, options) => {
  const s = settingsOf(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Refresh the PRs waiting on your review or re-review, and show the dock' })
    await $.tool.register({
      name: 'list',
      description:
        "List the GitHub PRs waiting on the user's review: Re-review (they reviewed it and new commits landed, or they were asked again), " +
        'Review (asked, not reviewed yet) and Waiting on author (their comments stand, nothing pushed). One line per PR with its URL.',
      inputSchema: {
        type: 'object',
        properties: { refresh: { type: 'boolean', description: `Fetch from GitHub now instead of reading the last poll (at most ${s.pollMs / 60_000} minutes old)` } },
      },
    })
    $.clock.every(s.pollMs, () => void refresh($, s))
    void refresh($, s)
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const list = await current($, s, (e as { refresh?: unknown }).refresh === true)
    return { result: toText(list, await $.clock.now()) }
  })

  on('command.run', { command: COMMAND }, async $ => {
    const list = await refresh($, s)
    await $.dock.open().catch(() => undefined)
    return { text: toText(list, await $.clock.now()) }
  })

  on('dock.action', async ($, e, next) => {
    if (e.section === SECTION) await onPress($, s, e.action, e.row)
    return next(e)
    // A failed press must not keep other sections' mods from hearing theirs.
  }).catch(($, e, next) => next(e))
}
