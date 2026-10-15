import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Queue, Shared } from '../types'
import { QUERY, announcement, arrivals, askText, badge, byBucket, columns, compileSkip, duty, fit, isShared, searches, toQueue, toSection, toText } from './queue'
import type { DockSection, SearchResult, Settings } from './queue'

// PRs waiting on your review, and the ones you reviewed that changed since,
// polled from GitHub. One session asks GitHub and keeps the list in the store;
// every session shows it, as the dock's Reviews section when the dock is
// loaded, else in a pane of its own.

const TOOL = 'mcp__review-queue__list'
const COMMAND = 'review-queue'
const PANE = 'review-queue'
const COLUMNS = 76
const ACCENT = 'cyan'
const MUTED = 'gray'
const BAR_BG = 'blackBright'
// The dock's pane and this mod's section in it. The dock is optional: its rows
// and buttons are reached through the engine's ui.focus and ui.press, so this
// mod hooks nothing of the dock's and loads the same with or without it.
const DOCK = 'dock'
const SECTION = 'reviews'
// The queue every session reads, and how often a session looks at it: cheap,
// no GitHub call, so another session's poll shows here within this.
const STORED = 'queue'
const CHECK_MS = 30_000
// URLs already announced per bucket, across sessions: an alert says only what is new.
const SEEN_KEYS = { rereview: 'rereview-seen', review: 'review-seen' } as const
const SOUND = 'sounds/waiting.wav'

const queue = atom({ plugin: 'review-queue', key: 'queue' } as const, null)
const selected = atom({ plugin: 'review-queue', key: 'selected' } as const, null)
const expanded = atom({ plugin: 'review-queue', key: 'expanded' } as const, [])
const toggled = atom({ plugin: 'review-queue', key: 'toggled' } as const, [])

// How much a channel announces, as runwatch's: new re-reviews and new review
// requests, only re-reviews, or nothing.
type Level = 'always' | 'rereview' | 'off'
type Config = Settings & { account: string; org: string; pollMs: number; toast: Level; notify: Level; sound: Level; toastMs: number; isAutoOpen: boolean }

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
    isAutoOpen: options.openPane !== false,
  }
}

const firstLine = (text: string) => text.trim().split('\n')[0] ?? ''

// Whether the last publish reached a dock: the list shows there, not in the pane.
let isDocked = false
// The re-review count last shown, so only a rise opens the pane.
let lastAttention = 0

// The account named, not gh's active one: this machine's gh is also signed in
// as a personal account.
async function tokenOf($: EngineInterface, account: string) {
  const got = await $.process.run(['gh', 'auth', 'token', '--user', account], { timeoutMs: 10_000 }).catch(() => undefined)
  return got?.exitCode === 0 ? got.stdout.trim() : undefined
}

async function fetchQueue($: EngineInterface, s: Config, last: Queue | null, now: number): Promise<Queue> {
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

async function stored($: EngineInterface) {
  const value = await $.store.get(STORED).catch(() => undefined)
  return isShared(value) ? value : undefined
}

async function isPaneShown($: EngineInterface, id = PANE) {
  const panes = await $.ui.panes().catch(() => [])
  return panes.some(pane => pane.id === id && pane.isPlaced && pane.isShown)
}

async function openPane($: EngineInterface) {
  await $.ui.open({ id: PANE, title: 'review-queue', columns: COLUMNS }).catch(() => undefined)
}

// Brings the list on screen: the dock when it shows there, else the pane.
async function showQueue($: EngineInterface) {
  if (isDocked) {
    try {
      await ($ as unknown as { dock: { open: () => Promise<boolean> } }).dock.open()
      return
    } catch {
      isDocked = false
    }
  }
  await openPane($)
}

// Hands the list to the dock; false, and the pane carries it, when no dock is loaded.
async function publishDock($: EngineInterface, section: DockSection) {
  try {
    await ($ as unknown as { dock: { publish: (section: DockSection) => Promise<boolean> } }).dock.publish(section)
    isDocked = true
  } catch {
    isDocked = false
  }
  return isDocked
}

// Shows the list wherever it goes: the dock, or the pane and the status line,
// the pane coming up by itself when re-reviews rise, as the dock does.
async function show($: EngineInterface, s: Config, list: Shared) {
  await update($, queue, () => list)
  const section = toSection(list, await $.clock.now())
  const attention = section.attention ?? 0
  const rose = attention > lastAttention
  lastAttention = attention
  if (await publishDock($, section)) {
    $.ui.status(undefined)
    return
  }
  const isShown = await isPaneShown($)
  if (!isShown && rose && s.isAutoOpen) await openPane($)
  await refreshStatus($)
}

// The status line stands in for the pane: none while the pane is on screen,
// or while the dock carries the list (its own status entry counts it).
async function refreshStatus($: EngineInterface) {
  const list = await read($, queue)
  const isHidden = isDocked || (await isPaneShown($))
  $.ui.status(isHidden || !list ? undefined : badge(list) || undefined)
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

// One check at a time: the timer, a press and /review-queue landing together share it.
let inflight: Promise<Shared> | undefined

// Asks GitHub when this session's turn (or `isForced`: a refresh asked for
// here, which makes this session the one that asks), else shows what the
// store holds. Only the session that asked announces.
function check($: EngineInterface, s: Config, isForced = false) {
  inflight ??= (async () => {
    const [self, now, last] = await Promise.all([$.session.id(), $.clock.now(), stored($)])
    if (last && !isForced && duty(last, self, now, s.pollMs) === 'adopt') {
      await show($, s, last)
      return last
    }
    const list = await fetchQueue($, s, last ?? (await read($, queue)), now)
    const shared: Shared = { ...list, owner: self, checkedAt: now }
    await $.store.set(STORED, shared).catch(() => undefined)
    await show($, s, shared)
    if (!list.error) await announce($, s, list)
    return shared
  })().finally(() => {
    inflight = undefined
  })
  return inflight
}

// The picked PR's buttons, in the pane or the dock: ask Claude about it, or refresh now.
async function act($: EngineInterface, s: Config, action: string) {
  if (action === 'refresh') {
    await check($, s, true)
    return
  }
  if (action !== 'ask') return
  const url = await read($, selected)
  const item = (await read($, queue))?.items.find(one => one.url === url)
  if (item) await $.prompt.submit({ text: askText(item) }).catch(() => undefined)
}

async function openUrl($: EngineInterface, url: string) {
  const opened = await $.process.run(['open', url]).catch(() => undefined)
  if (opened?.exitCode !== 0) await $.process.run(['xdg-open', url]).catch(() => undefined)
}

const toggle = (keys: readonly string[], key: string) => (keys.includes(key) ? keys.filter(one => one !== key) : [...keys, key])

export const register: Register = (on, options) => {
  const s = settingsOf(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: COMMAND, description: 'Refresh the PRs waiting on your review or re-review, and show them' })
    await $.tool.register({
      name: 'list',
      description:
        "List the GitHub PRs waiting on the user's review: Re-review (they reviewed it and new commits landed, or they were asked again), " +
        'Review (asked by name, not reviewed yet), Team request (asked only through a team they are on, which the line names) ' +
        'and Waiting on author (their comments stand, nothing pushed). One line per PR with its URL.',
      inputSchema: {
        type: 'object',
        properties: { refresh: { type: 'boolean', description: `Fetch from GitHub now instead of reading the last poll (at most ${s.pollMs / 60_000} minutes old)` } },
      },
    })
    $.clock.every(CHECK_MS, () => void check($, s).catch(() => undefined))
    void check($, s).catch(() => undefined)
    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const isFresh = (e as { refresh?: unknown }).refresh === true
    const last = await read($, queue)
    const list = !isFresh && last ? last : await check($, s, isFresh)
    return { result: toText(list, await $.clock.now()) }
  })

  on('command.run', { command: COMMAND }, async $ => {
    const list = await check($, s, true)
    await showQueue($)
    return { text: toText(list, await $.clock.now()) }
  })

  // The focus ring's row is the one the buttons act on; moving onto a button keeps it.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const key = e.element
    if (!key?.startsWith('act-')) await update($, selected, () => (key?.startsWith('row:') ? key.slice(4) : null))
    return next(e)
  }).catch(($, e, next) => next(e))

  // The dock's rows and buttons for the Reviews section, picked and pressed as
  // the pane's are. A press of one of them is this mod's to answer.
  on('ui.focus', { requestId: DOCK }, async ($, e, next) => {
    const key = e.element
    const prefix = `row:${SECTION}:`
    if (!key?.startsWith('act-')) await update($, selected, () => (key?.startsWith(prefix) ? key.slice(prefix.length) : null))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.press', { requestId: DOCK }, async ($, e, next) => {
    const prefix = `act-${SECTION}-`
    if (!e.element.startsWith(prefix)) return next(e)
    await act($, s, e.element.slice(prefix.length))
    return { element: e.element }
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    void refreshStatus($)
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const list = await read($, queue)
    const open = await read($, expanded)
    const flipped = await read($, toggled)
    const pickedUrl = await read($, selected)
    const picked = list?.items.find(item => item.url === pickedUrl)
    const section = list ? toSection(list, await $.clock.now()) : undefined
    const inner = Math.max(30, (e.props.bodyColumns || COLUMNS) - 2)
    const { metaWidth, nameWidth, detailWidth } = columns(inner)

    const row = (item: DockSection['groups'][number]['rows'][number]) => {
      const aside = item.aside ? ` · ${item.aside}` : ''
      const label = fit(item.label, nameWidth - Math.min([...aside].length, Math.floor(nameWidth / 2))).trimEnd()
      const isOpen = open.includes(item.key)
      return (
        <Box key={`item:${item.key}`} flexDirection="column">
          <Button key={`row:${item.key}`} plain onPress={() => update($, expanded, keys => toggle(keys, item.key))}>
            <Text color={item.iconColor ?? MUTED} bold>
              {item.icon ?? '·'}
            </Text>{' '}
            <Text bold>{label}</Text>
            <Text color={MUTED}>{fit(aside, nameWidth - [...label].length)}</Text> <Text>{fit(item.detail ?? '', detailWidth)}</Text>
            <Text color={MUTED}>
              {fit('', metaWidth - [...(item.meta ?? '')].length)}
              {item.meta ?? ''}
            </Text>
          </Button>
          {isOpen && (
            <Box key={`more:${item.key}`} flexDirection="column" paddingLeft={2}>
              {item.title && (
                <Text color={MUTED} wrap="truncate-end">
                  {item.title}
                </Text>
              )}
              {item.href && <Link key={`open:${item.key}`} href={item.href} label="open ↗" />}
              {(item.lines ?? []).map((line, i) => (
                <Text key={`${item.key}-l${i}`} color={line.color ?? MUTED} wrap="truncate-end">
                  {line.text}
                </Text>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    const groups = (section?.groups ?? []).filter(one => one.rows.length > 0)
    const group = (one: DockSection['groups'][number]) => {
      const isDefault = one.isFolded ?? false
      const isClosed = flipped.includes(one.key) ? !isDefault : isDefault
      return (
        <Box key={`group:${one.key}`} flexDirection="column" marginBottom={1}>
          <Button key={`fold:${one.key}`} plain onPress={() => update($, toggled, keys => toggle(keys, one.key))}>
            <Text color={MUTED} bold>
              {isClosed ? '▸' : '▾'} {one.title.toUpperCase()}
            </Text>
            <Text color={MUTED}> {one.rows.length}</Text>
          </Button>
          {!isClosed && one.rows.map(row)}
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box key="header" backgroundColor={BAR_BG} paddingX={1} gap={2} width={e.props.bodyColumns || undefined}>
          <Text color={ACCENT} bold>
            ◆ review-queue
          </Text>
          <Text color={MUTED}>{section?.badge || 'nothing to review'}</Text>
        </Box>
        <Box key="body" flexDirection="column" paddingX={1} marginTop={1}>
          {section?.error && (
            <Text color="red" wrap="truncate-end">
              {section.error}
            </Text>
          )}
          {!list ? <Text dimColor>Asking GitHub…</Text> : groups.length === 0 ? <Text dimColor>Nothing waiting on you.</Text> : groups.map(group)}
          {section?.footer && (
            <Text color={MUTED} wrap="truncate-end">
              {section.footer}
            </Text>
          )}
        </Box>
        <Box key="actions" paddingX={1} gap={2}>
          {picked && <Button key="act-open" label="open" hotkey="o" plain onPress={() => openUrl($, picked.url)} />}
          {picked && <Button key="act-ask" label="ask Claude" hotkey="a" plain onPress={() => act($, s, 'ask')} />}
          <Button key="act-refresh" label="refresh" hotkey="r" plain onPress={() => act($, s, 'refresh')} />
          <Button key="act-close" label="close" hotkey="c" plain onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        <Box key="hint" paddingX={1}>
          <Text color={MUTED}>ctrl+x tab: keys here · ↑↓ pick · enter details · every {s.pollMs / 60_000}m</Text>
        </Box>
      </Box>
    )
  })
}
