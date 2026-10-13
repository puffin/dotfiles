import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { Watch, WatchStatus } from '../types'
import {
  bar,
  capped,
  describe,
  detect,
  elapsed,
  fit,
  ghaSeed,
  isDone,
  isHere,
  isPush,
  KIND_BADGE,
  lastLines,
  newestRun,
  newestVersion,
  newWatch,
  parseRun,
  prSeed,
  projectName,
  readChecks,
  readJenkins,
  readPr,
  readQueue,
  readRun,
  readTerrakube,
  repoOf,
  shown,
  statusLine,
  summaryOf,
  terrakubeLabel,
  terrakubeTail,
  workspaceName,
} from './watch'
import type { Reading, Seed } from './watch'

const PANE = 'runwatch'
// Polls in a row that may fail to reach a service before the watch gives up.
const MAX_MISSES = 6
// A PR that reports no checks for this long has none to wait for.
const NO_CHECKS_MS = 10 * 60_000
const MAX_WATCHES = 30
// A watch whose session has not checked it for this long is taken over by another.
const ADOPT_MS = 5 * 60_000
// Each watch is its own store key, so sessions never overwrite each other's.
const STORED = 'watch:'
// While the pane shows a running watch, its clocks move this often.
const REDRAW_MS = 2000
const SOUNDS = { passed: 'sounds/done.wav', failed: 'sounds/fail.wav', waiting: 'sounds/waiting.wav' } as const

const ACCENT = 'cyan'
const MUTED = 'gray'
const BAR_BG = 'blackBright'
const LOOK: Record<WatchStatus, { icon: string; color: string }> = {
  queued: { icon: '○', color: MUTED },
  running: { icon: '⟳', color: 'yellow' },
  waiting: { icon: '‖', color: 'magenta' },
  passed: { icon: '✓', color: 'green' },
  failed: { icon: '✗', color: 'red' },
}

// How much a channel announces: every finish, only failures and approvals, or nothing.
type Level = 'always' | 'failures' | 'off'

type Settings = {
  pollMs: number
  toastMs: number
  toast: Level
  notify: Level
  sound: Level
  isWake: boolean
  isAutoOpen: boolean
  show: 'all' | 'project'
  keepDoneMs: number
  scripts: { terrakube: string; jenkins: string }
}

function settingsOf(options: PluginOptions): Settings {
  const num = (key: string, fallback: number, min: number) => {
    const value = Number(options[key])
    return Number.isFinite(value) && value >= min ? value : fallback
  }
  const level = (key: string): Level => (options[key] === 'failures' || options[key] === 'off' ? options[key] : 'always')
  return {
    pollMs: num('pollSeconds', 20, 5) * 1000,
    toastMs: num('toastSeconds', 10, 1) * 1000,
    toast: level('toast'),
    notify: level('notify'),
    sound: level('sound'),
    isWake: options.wakeClaude !== false,
    isAutoOpen: options.openPane !== false,
    show: options.show === 'project' ? 'project' : 'all',
    keepDoneMs: num('keepDoneHours', 24, 0) * 3_600_000,
    scripts: { terrakube: String(options.terrakubeScript ?? ''), jenkins: String(options.jenkinsScript ?? '') },
  }
}

const watches = atom({ plugin: 'runwatch', key: 'watches' } as const, [])
const expanded = atom({ plugin: 'runwatch', key: 'expanded' } as const, [])
const selected = atom({ plugin: 'runwatch', key: 'selected' } as const, null)

// Read once per load: they do not change within a session.
let home: string | null = null
let me: string | null = null
const scripts = new Map<string, string | null>()
const tokens = new Map<string, string | null>()

async function homeDir($: EngineInterface) {
  if (home === null) home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  return home
}

async function sessionId($: EngineInterface) {
  if (me === null) me = await $.session.id().catch(() => 'this-session')
  return me
}

// Where the session works now: /cd moves it, a shell cd does not.
const projectRoot = ($: EngineInterface) => $.session.root().catch(() => $.session.cwd())

const visible = async ($: EngineInterface, s: Settings) => shown(await read($, watches), s.show, await projectRoot($))

type RunResult = { exitCode: number; stdout: string; stderr: string }

async function run($: EngineInterface, argv: string[], init: { cwd?: string; env?: Record<string, string> } = {}): Promise<RunResult> {
  return $.process
    .run(argv, { ...init, timeoutMs: 30_000 })
    .catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
}

function json(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const firstLine = (text: string) => text.trim().split('\n')[0]?.slice(0, 160) || 'no output'

// The skill's wrapper script, which holds the credentials: the configured
// path, else the newest version in any marketplace's plugin cache.
async function script($: EngineInterface, name: 'terrakube' | 'jenkins', configured: string) {
  if (configured) return configured
  if (scripts.get(name)) return scripts.get(name)!
  const cache = `${await homeDir($)}/.claude/plugins/cache`
  const marketplaces = (await $.fs.list(cache).catch(() => [])).map(entry => entry.name)
  // The ge-cloudops marketplace first: it is where these skills come from.
  for (const market of [...marketplaces].sort((a, b) => Number(b === 'ge-cloudops') - Number(a === 'ge-cloudops'))) {
    const root = `${cache}/${market}/${name}`
    const version = newestVersion((await $.fs.list(root).catch(() => [])).map(entry => entry.name))
    if (version) {
      const path = `${root}/${version}/scripts/${name}.sh`
      scripts.set(name, path)
      return path
    }
  }
  return null
}

// gh as the repo's owner when gh is signed in to that account (a personal repo
// beside a work account), else gh's active account.
async function ghEnv($: EngineInterface, owner: string | null | undefined): Promise<Record<string, string> | undefined> {
  if (!owner) return undefined
  if (!tokens.has(owner)) {
    const token = await run($, ['gh', 'auth', 'token', '--user', owner])
    tokens.set(owner, token.exitCode === 0 && token.stdout.trim() ? token.stdout.trim() : null)
  }
  const token = tokens.get(owner)
  return token ? { GH_TOKEN: token } : undefined
}

// The owner of the repo a folder is in, from its origin remote (https, ssh or an ssh alias).
async function ownerOf($: EngineInterface, cwd: string) {
  const remote = await run($, ['git', 'remote', 'get-url', 'origin'], { cwd })
  return repoOf(remote.stdout.trim())?.split('/')[0] ?? null
}

type Poll = { reading: Reading; tail?: string[] } | { error: string }

// A failed script call drops the cached path: a skill update may have pruned
// that version, and the next poll finds the newest again.
function failed(name: 'terrakube' | 'jenkins', result: RunResult): Poll {
  scripts.delete(name)
  return { error: firstLine(result.stderr) }
}

// One look at the run. Output is fetched only when the status moves, since a
// plan or console log can be large.
async function poll($: EngineInterface, w: Watch, s: Settings): Promise<Poll> {
  if (w.kind === 'terrakube') {
    const tk = await script($, 'terrakube', s.scripts.terrakube)
    if (!tk) return { error: 'the terrakube skill is not installed (or set its path in /config)' }
    const job = await run($, [tk, 'job', w.org ?? '', w.job ?? ''])
    if (job.exitCode !== 0) return failed('terrakube', job)
    const reading = readTerrakube(json(job.stdout))
    // A watch started by id is named after its workspace, once.
    if (reading.ws && !w.ws && w.label === terrakubeLabel(undefined, w.job ?? '')) {
      const ws = await run($, [tk, 'workspace', w.org ?? '', reading.ws])
      const name = ws.exitCode === 0 ? workspaceName(json(ws.stdout)) : null
      if (name) reading.label = name
    }
    const hasOutput = reading.status === 'waiting' || isDone(reading.status)
    if (!hasOutput || reading.status === w.status) return { reading }
    // A plugin older than step-log exits non-zero: finish without the log lines.
    const log = await run($, [tk, 'step-log', w.org ?? '', w.job ?? ''])
    return { reading, tail: log.exitCode === 0 ? terrakubeTail(log.stdout) : [] }
  }

  if (w.kind === 'jenkins') {
    const jk = await script($, 'jenkins', s.scripts.jenkins)
    if (!jk) return { error: 'the jenkins skill is not installed (or set its path in /config)' }
    const path = w.path ?? ''
    if (w.queueId && !w.build) {
      const queue = await run($, [jk, 'queue'])
      if (queue.exitCode !== 0) return failed('jenkins', queue)
      const queued = readQueue(json(queue.stdout), w.queueId)
      if (queued) return { reading: queued }
      // Left the queue: its build is the job's newest.
    }
    const info = await run($, [jk, 'build-info', path, w.build ?? 'lastBuild'])
    if (info.exitCode !== 0) return failed('jenkins', info)
    const reading = readJenkins(json(info.stdout), await $.clock.now())
    if (!isDone(reading.status)) return { reading }
    const build = reading.build ?? w.build ?? 'lastBuild'
    const log = await run($, ['sh', '-c', '"$0" log "$1" "$2" | tail -n 15', jk, path, build])
    return { reading, tail: lastLines(log.stdout, 15) }
  }

  if (w.kind === 'gha') {
    const env = await ghEnv($, w.repo?.split('/')[0] ?? (w.cwd ? await ownerOf($, w.cwd) : null))
    const repoArgs = w.repo ? ['-R', w.repo] : []
    let found: Pick<Reading, 'run' | 'url' | 'repo'> = {}
    if (!w.run) {
      // A dispatched workflow: its run shows in the list a few seconds later.
      const fields = ['--json', 'databaseId,createdAt,url']
      const list = await run($, ['gh', 'run', 'list', '--workflow', w.workflow ?? '', ...repoArgs, '--event', 'workflow_dispatch', '--limit', '5', ...fields], { cwd: w.cwd, env })
      if (list.exitCode !== 0) return { error: firstLine(list.stderr) }
      const newest = newestRun(json(list.stdout), w.startedAt)
      if (!newest) {
        const isLate = (await $.clock.now()) - w.startedAt > NO_CHECKS_MS
        return { reading: isLate ? { status: 'failed', detail: 'no run appeared' } : { status: 'queued', detail: 'waiting for the run' } }
      }
      found = { run: newest.run, url: newest.url, repo: repoOf(newest.url) ?? undefined }
    }
    const fields = 'status,conclusion,jobs,displayTitle,workflowName,url,headBranch'
    const view = await run($, ['gh', 'run', 'view', found.run ?? w.run ?? '', ...repoArgs, '--json', fields], { cwd: w.cwd, env })
    const value = json(view.stdout)
    if (view.exitCode !== 0 || value === undefined) return { error: firstLine(view.stderr) }
    const { failing, ...reading } = readRun(value)
    return { reading: { ...found, ...reading }, tail: failing }
  }

  const env = await ghEnv($, repoOf(w.pr ?? '')?.split('/')[0])
  // A repo without PR checks would otherwise wait out NO_CHECKS_MS even after the merge.
  const view = await run($, ['gh', 'pr', 'view', w.pr ?? '', '--json', 'state,title'], { cwd: w.cwd, env })
  const { ended, title } = readPr(json(view.stdout))
  if (ended) return { reading: { ...ended, title } }

  const checks = await run($, ['gh', 'pr', 'checks', w.pr ?? '', '--json', 'name,bucket'], { cwd: w.cwd, env })
  // gh exits non-zero while checks are pending or failing, so read its output first.
  const list = json(checks.stdout) ?? (/no checks reported/i.test(checks.stderr) ? [] : undefined)
  if (list === undefined) return { error: firstLine(checks.stderr) }
  const { failing, ...reading } = readChecks(list)
  if (reading.detail === 'waiting for checks' && (await $.clock.now()) - w.startedAt > NO_CHECKS_MS) {
    return { reading: { status: 'passed', detail: 'no checks reported', title } }
  }
  return { reading: { ...reading, title }, tail: failing }
}

const defined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>

async function save($: EngineInterface, w: Watch) {
  await $.store.set(`${STORED}${w.id}`, w).catch(() => undefined)
}

async function forget($: EngineInterface, ids: string[]) {
  await Promise.all(ids.map(id => $.store.delete(`${STORED}${id}`).catch(() => undefined)))
}

// Tells the person, once, that a run finished or waits on them; Claude too,
// for a run it handed off.
function announce($: EngineInterface, w: Watch, what: 'waiting' | 'finished', s: Settings, self: string) {
  const summary = summaryOf(w)
  const text =
    what === 'waiting'
      ? `${describe(w)} is waiting for approval${summary ? ` · ${summary}` : ''}`
      : `${describe(w)}: ${w.detail}${summary ? ` · ${summary}` : ''}`
  const icon = what === 'waiting' ? LOOK.waiting.icon : LOOK[w.status].icon
  // A run waiting on you counts with failures: both need you to act.
  const needsYou = what === 'waiting' || w.status === 'failed'
  const wants = (level: Level) => level === 'always' || (level === 'failures' && needsYou)
  if (wants(s.toast)) $.ui.toast(`${icon} ${text}`, { timeoutMs: s.toastMs })
  if (wants(s.notify)) void $.ui.notify(text, { title: `runwatch ${icon}` }).catch(() => undefined)
  const sound = what === 'waiting' ? SOUNDS.waiting : w.status === 'failed' ? SOUNDS.failed : SOUNDS.passed
  if (wants(s.sound)) void $.audio.play({ asset: sound }).catch(() => undefined)
  // Only the session that started it has the Claude that asked.
  if (what === 'finished' && w.origin === self) wake($, w, s)
}

function wake($: EngineInterface, w: Watch, s: Settings) {
  if (w.wake && s.isWake) void $.prompt.submit({ text: wakeText(w) }).catch(() => undefined)
}

function wakeText(w: Watch) {
  const link = w.url ? `\nRun: ${w.url}` : ''
  const tail = w.tail.length ? `\n\n\`\`\`\n${w.tail.join('\n')}\n\`\`\`` : ''
  return `[runwatch] ${describe(w)} finished: ${w.status} (${w.detail}) after ${elapsed((w.endedAt ?? w.checkedAt) - w.startedAt)}.${link}${tail}`
}

function askText(w: Watch) {
  const link = w.url ? `\nRun: ${w.url}` : ''
  const tail = w.tail.length ? `\n\nWhat runwatch saw:\n\`\`\`\n${w.tail.join('\n')}\n\`\`\`` : ''
  return `${describe(w)} ${w.status === 'failed' ? 'failed' : 'finished'} (${w.detail}). Look into why and tell me what to do about it.${link}${tail}`
}

async function check($: EngineInterface, id: string, s: Settings) {
  const w = (await read($, watches)).find(one => one.id === id)
  if (!w || isDone(w.status)) return
  const self = await sessionId($)

  const result = await poll($, w, s).catch((err: unknown): Poll => ({ error: String(err) }))
  const now = await $.clock.now()

  // Removed while the poll ran, here or in another session: saving would bring it back.
  const isGone = (await $.store.get(`${STORED}${id}`).catch(() => w)) === undefined
  if (isGone) {
    await update($, watches, list => list.filter(one => one.id !== id))
    return
  }

  let fresh: Watch
  if ('error' in result) {
    const misses = w.misses + 1
    fresh =
      misses >= MAX_MISSES
        ? { ...w, misses, status: 'failed', detail: `lost contact: ${result.error}`, checkedAt: now, endedAt: now, progress: undefined, eta: undefined }
        : { ...w, misses, error: result.error, checkedAt: now }
  } else {
    // A rerun or a push can still show the last attempt's result for a moment.
    const isStale = isDone(result.reading.status) && w.settleUntil !== undefined && now < w.settleUntil
    const reading: Reading = isStale ? { ...result.reading, status: 'queued', detail: 'starting', progress: undefined } : result.reading
    const tail = isStale ? undefined : result.tail
    // progress and eta are the latest reading's own: one that does not measure clears them.
    fresh = { ...w, ...defined(reading), progress: reading.progress, eta: reading.eta, tail: tail ?? w.tail, misses: 0, error: undefined, checkedAt: now }
    if (isDone(fresh.status)) fresh.endedAt = now
  }

  // Decided inside the write, so two polls of one run never both announce it.
  let isPresent = false
  let isFinished = false
  let isNowWaiting = false
  await update($, watches, list => {
    isPresent = isFinished = isNowWaiting = false
    return list.map(one => {
      // Finished already, or taken over by another session while this poll ran.
      if (one.id !== id || isDone(one.status) || one.owner !== w.owner) return one
      isPresent = true
      isFinished = isDone(fresh.status)
      isNowWaiting = one.status !== 'waiting' && fresh.status === 'waiting'
      return fresh
    })
  })
  if (!isPresent) return
  await save($, fresh)

  if (isNowWaiting) announce($, fresh, 'waiting', s, self)
  if (isFinished) announce($, fresh, 'finished', s, self)
}

const isWatch = (value: unknown): value is Watch =>
  typeof value === 'object' && value !== null && typeof (value as Watch).id === 'string' && typeof (value as Watch).status === 'string'

// Brings in watches other sessions keep, takes over the ones whose session
// went quiet (and back the ones this session started), and drops finished ones
// past keepDoneHours.
async function sync($: EngineInterface, s: Settings) {
  const self = await sessionId($)
  const keys = (await $.store.keys().catch(() => [] as string[])).filter(key => key.startsWith(STORED))
  const stored = (await Promise.all(keys.map(key => $.store.get(key).catch(() => undefined))))
    .filter(isWatch)
    // Saved before watches named the session that started them.
    .map(w => (w.origin ? w : { ...w, origin: w.owner }))
  const now = await $.clock.now()
  const root = await projectRoot($)
  const expired = stored.filter(w => isDone(w.status) && now - (w.endedAt ?? w.checkedAt) > s.keepDoneMs).map(w => w.id)
  const kept = new Map(stored.filter(w => !expired.includes(w.id)).map(w => [w.id, w]))
  const isOrphan = (w: Watch) =>
    now - w.checkedAt > Math.max(3 * s.pollMs, ADOPT_MS) &&
    // A session that hides another project's runs leaves them to a session that shows them.
    (s.show === 'all' || isHere(w, root))

  let toSave: Watch[] = []
  let toWake: Watch[] = []
  await update($, watches, list => {
    toSave = []
    toWake = []
    const byId = new Map<string, Watch>()
    for (const local of list) {
      // Held from before sessions owned watches: this session's now.
      if (!local.owner || !local.origin) {
        const mine = { ...local, owner: local.owner ?? self, origin: local.origin ?? local.owner ?? self }
        byId.set(mine.id, mine)
        toSave.push(mine)
        continue
      }
      // Gone from the store: removed in some session, or expired. One just
      // added may not be saved yet.
      const isJustAdded = local.owner === self && !isDone(local.status) && now - local.startedAt < s.pollMs
      if (kept.has(local.id) || isJustAdded) byId.set(local.id, local)
    }
    for (const w of kept.values()) {
      const ours = byId.get(w.id)
      if (ours && w.owner === self) continue
      // Another session's copy wins when newer, or when its origin took it back.
      const isNewer = !ours || w.checkedAt >= ours.checkedAt || (w.owner === w.origin && ours.origin !== self)
      if (!isNewer) continue
      // Finished in a session that took it over: the Claude that asked is here.
      if (ours && !isDone(ours.status) && isDone(w.status) && w.origin === self) toWake.push(w)
      const isOurs = !isDone(w.status) && (w.origin === self || isOrphan(w))
      const next = isOurs ? { ...w, owner: self } : w
      if (isOurs) toSave.push(next)
      byId.set(w.id, next)
    }
    return capped([...byId.values()], MAX_WATCHES)
  })
  await forget($, expired)
  await Promise.all(toSave.map(w => save($, w)))
  for (const w of toWake) wake($, w, s)
}

async function isPaneShown($: EngineInterface) {
  const panes = await $.ui.panes().catch(() => [])
  return panes.some(pane => pane.id === PANE && pane.isPlaced && pane.isShown)
}

// The status line stands in for the pane: none while the pane is on screen.
async function refreshStatus($: EngineInterface, s: Settings) {
  const list = await visible($, s)
  $.ui.status((await isPaneShown($)) ? undefined : statusLine(list))
}

let isTicking = false
async function tick($: EngineInterface, s: Settings) {
  if (isTicking) return
  isTicking = true
  try {
    await sync($, s)
    const self = await sessionId($)
    const now = await $.clock.now()
    // A watch just added was checked then: polling it again now would see the same.
    const due = (w: Watch) => !isDone(w.status) && w.owner === self && now - w.checkedAt >= s.pollMs / 2
    // Side by side, so one slow service holds up no other watch.
    await Promise.all((await read($, watches)).filter(due).map(w => check($, w.id, s)))
    await refreshStatus($, s)
  } finally {
    isTicking = false
  }
}

async function add($: EngineInterface, seed: Seed, s: Settings) {
  const w = newWatch({ ...seed, cwd: seed.cwd ?? (await $.session.cwd()), project: await projectRoot($) }, await $.clock.now(), await sessionId($))
  // The same run started again replaces its old watch.
  await update($, watches, list => capped([...list.filter(one => one.id !== w.id), w], MAX_WATCHES))
  await save($, w)
  const opened = s.isAutoOpen ? $.ui.open({ id: PANE, title: 'runwatch' }).catch(() => undefined) : undefined
  void Promise.all([opened, check($, w.id, s)]).then(() => refreshStatus($, s))
  return w
}

async function remove($: EngineInterface, ids: string[], s: Settings) {
  await update($, watches, list => list.filter(w => !ids.includes(w.id)))
  await update($, expanded, list => list.filter(id => !ids.includes(id)))
  await forget($, ids)
  await refreshStatus($, s)
}

async function prUrl($: EngineInterface, cwd: string, pr?: string) {
  if (pr && /^https:\/\//.test(pr)) return pr
  const env = await ghEnv($, await ownerOf($, cwd))
  const view = await run($, ['gh', 'pr', 'view', ...(pr ? [pr] : []), '--json', 'url'], { cwd, env })
  const url = (json(view.stdout) as { url?: unknown } | undefined)?.url
  return typeof url === 'string' ? url : null
}

async function openUrl($: EngineInterface, url: string) {
  const opened = await run($, ['open', url])
  if (opened.exitCode !== 0) await run($, ['xdg-open', url])
}

type Request = { kind?: unknown; org?: unknown; job?: unknown; path?: unknown; build?: unknown; pr?: unknown; run?: unknown; repo?: unknown }
const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined)

// A watch asked for by name, from the model's tool or /watch.
async function fromRequest($: EngineInterface, req: Request, wake: boolean): Promise<Seed | { error: string }> {
  const [org, job, path, build, pr, runId, repo] = [req.org, req.job, req.path, req.build, req.pr, req.run, req.repo].map(str)
  if (req.kind === 'terrakube') {
    if (!org || !job) return { error: 'terrakube needs org and job' }
    return { id: `tk:${job}`, kind: 'terrakube', label: terrakubeLabel(undefined, job), org, job, wake }
  }
  if (req.kind === 'jenkins') {
    if (!path) return { error: 'jenkins needs path (the job path, e.g. folder/job)' }
    return { id: `jk:${path}:${build ?? 'last'}`, kind: 'jenkins', label: path, path, build, wake }
  }
  if (req.kind === 'pr') {
    const cwd = await $.session.cwd()
    const url = await prUrl($, cwd, pr)
    if (!url) return { error: pr ? `no PR found for ${pr}` : 'no PR found for the current branch' }
    return prSeed(url, cwd, wake)
  }
  if (req.kind === 'gha') {
    const parsed = runId ? parseRun(runId) : null
    if (!parsed) return { error: 'gha needs run (a run id or its github.com/.../actions/runs/... URL)' }
    return ghaSeed(parsed.repo ?? repo ?? null, parsed.run, await $.session.cwd(), wake)
  }
  return { error: 'kind must be terrakube, jenkins, pr or gha' }
}

const USAGE = 'Usage: /watch [tk <org> <job> | jenkins <path> [build] | pr [number|url] | gha <run id|url> | clear]'

function parseArgs(args: string): Request | 'open' | 'clear' | null {
  const [what, ...rest] = args.trim().split(/\s+/).filter(Boolean)
  if (!what) return 'open'
  if (what === 'clear') return 'clear'
  if (what === 'tk' || what === 'terrakube') return { kind: 'terrakube', org: rest[0], job: rest[1] }
  if (what === 'jenkins' || what === 'jk') return { kind: 'jenkins', path: rest[0], build: rest[1] }
  if (what === 'pr') return { kind: 'pr', pr: rest[0] }
  if (what === 'gha' || what === 'run') return { kind: 'gha', run: rest[0] }
  return null
}

// Only what the pane shows: another project's finished runs stay for its sessions.
const clearDone = async ($: EngineInterface, s: Settings) =>
  remove($, (await visible($, s)).filter(w => isDone(w.status)).map(w => w.id), s)

// Plan lines read in Terraform's own colors.
function tailColor(line: string) {
  if (/^✗|Error|error:/.test(line)) return 'red'
  if (/will be (created|read)|^applied|^plan:/.test(line)) return 'green'
  if (/will be (updated|replaced)|must be replaced/.test(line)) return 'yellow'
  if (/will be destroyed/.test(line)) return 'red'
  return MUTED
}

export const register: Register = (on, options) => {
  const s = settingsOf(options)

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'watch', description: 'Watch a Terrakube job, Jenkins build, PR checks or Actions run in a pane' })
    await $.tool.register({
      name: 'watch',
      description:
        'Hand a long-running Terrakube job, Jenkins build, GitHub PR checks or GitHub Actions run to a background watcher instead of polling it yourself. ' +
        'The user sees it live in a pane and is notified when it finishes, and you receive a prompt with the result then. ' +
        "Never poll or sleep-wait on a run you've handed over. Runs started with terrakube.sh run --confirm, jenkins.sh trigger, " +
        'gh pr create, gh workflow run, gh run rerun or git push are picked up automatically; use this for anything else.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['terrakube', 'jenkins', 'pr', 'gha'] },
          org: { type: 'string', description: 'terrakube: organization id or name' },
          job: { type: 'string', description: 'terrakube: job id' },
          path: { type: 'string', description: 'jenkins: job path, e.g. folder/job' },
          build: { type: 'string', description: 'jenkins: build number (default: newest)' },
          pr: { type: 'string', description: 'pr: number or URL (default: the current branch)' },
          run: { type: 'string', description: 'gha: run id or its github.com/<owner>/<repo>/actions/runs/<id> URL' },
          repo: { type: 'string', description: 'gha: owner/repo, when run is a bare id outside the repo' },
        },
        required: ['kind'],
      },
      isDeferred: false,
    })
    // Watches live in the store, so another session, or the next one, picks them up.
    await sync($, s).catch(() => undefined)
    // Another project's runs show in the list, but only this one's open the pane.
    const root = await projectRoot($)
    if (s.isAutoOpen && (await read($, watches)).some(w => !isDone(w.status) && isHere(w, root))) {
      void $.ui.open({ id: PANE, title: 'runwatch' }).catch(() => undefined)
    }
    $.clock.every(s.pollMs, () => void tick($, s))
    $.clock.every(REDRAW_MS, async () => {
      const list = await read($, watches)
      if (list.some(w => !isDone(w.status)) && (await isPaneShown($))) $.ui.invalidate('ui.render')
    })
    void tick($, s)
    return next(e)
  })

  // Runs started from Bash: watch them without being asked. No .catch: a
  // failure here skips the hook, leaving the command's result untouched.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError || e.run_in_background) return ran
    try {
      const cwd = await $.session.cwd()
      let seed = detect(e.command, ran.result.stdout, cwd)
      if (!seed && isPush(e.command)) {
        const url = await prUrl($, cwd)
        // Right after the push, gh may still report the previous commit's checks.
        if (url) seed = { ...prSeed(url, cwd, false), settle: true }
      }
      if (!seed) return ran
      const w = await add($, seed, s)
      return {
        ...ran,
        context: [
          ...(ran.context ?? []),
          `runwatch is now watching ${describe(w)} in its pane, and the user is notified when it finishes. Don't poll it.`,
        ],
      }
    } catch {
      return ran
    }
  })

  on('tool.call', { tool: 'mcp__runwatch__watch' }, async ($, e) => {
    const seed = await fromRequest($, e, true)
    if ('error' in seed) return { deny: `runwatch: ${seed.error}` }
    const w = await add($, seed, s)
    return { result: `Watching ${describe(w)}. You'll get a prompt with the result when it finishes; don't poll it.` }
  }).catch(() => ({ deny: 'runwatch could not start the watch.' }))

  on('command.run', { command: 'watch' }, async ($, e) => {
    const req = parseArgs(e.args)
    if (req === null) return { text: USAGE }
    if (req === 'clear') {
      await clearDone($, s)
      return { text: 'Cleared finished watches.' }
    }
    if (req === 'open') {
      await $.ui.open({ id: PANE, title: 'runwatch' })
      await refreshStatus($, s)
      const count = (await visible($, s)).length
      return { text: count ? `${count} watch${count === 1 ? '' : 'es'}. ctrl+x tab puts the keys in the pane.` : `Nothing watched yet. ${USAGE}` }
    }
    const seed = await fromRequest($, req, false)
    if ('error' in seed) return { text: `${seed.error}. ${USAGE}` }
    const w = await add($, seed, { ...s, isAutoOpen: true })
    return { text: `Watching ${describe(w)}.` }
  })

  // The focus ring's row is the one o, x and a act on.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const key = e.element
    await update($, selected, () => (key?.startsWith('row:') ? key.slice(4) : null))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const closed = await next(e)
    void refreshStatus($, s)
    return closed
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const root = await projectRoot($)
    const list = shown(await read($, watches), s.show, root)
    const open = await read($, expanded)
    const selectedId = await read($, selected)
    const chosen = list.find(w => w.id === selectedId)
    const now = await $.clock.now()
    const active = list.filter(w => !isDone(w.status)).sort((a, b) => b.startedAt - a.startedAt)
    const done = list.filter(w => isDone(w.status)).sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))
    const waiting = active.filter(w => w.status === 'waiting').length
    const failed = done.filter(w => w.status === 'failed').length

    // Columns: icon, kind, name, detail, progress bar, time. The bar goes on a narrow pane.
    const inner = Math.max(30, (e.props.bodyColumns || 80) - 2)
    const barWidth = inner >= 70 ? 12 : 0
    const flex = inner - (2 + 4 + 1 + (barWidth ? barWidth + 1 : 0) + 7)
    const nameWidth = Math.ceil(flex * 0.5)
    const detailWidth = flex - nameWidth

    const row = (w: Watch) => {
      const look = LOOK[w.status]
      const summary = summaryOf(w)
      const eta = w.eta !== undefined && !isDone(w.status) ? ` · ~${elapsed(Math.max(0, w.eta - (now - w.checkedAt)))} left` : ''
      const detail = `${w.detail}${eta}${summary && w.status !== 'running' ? ` · ${summary}` : ''}`
      const [filled, empty] = w.progress === undefined ? ['', ' '.repeat(barWidth)] : bar(w.progress, barWidth)
      const took = elapsed((w.endedAt ?? now) - w.startedAt).padStart(7)
      // Another project's run names its folder, in up to half the name column.
      const tag = w.project && !isHere(w, root) ? ` · ${projectName(w.project)}` : ''
      const label = fit(w.label, nameWidth - Math.min([...tag].length, Math.floor(nameWidth / 2))).trimEnd()
      return (
        <Button key={`row:${w.id}`} plain onPress={() => update($, expanded, ids => (ids.includes(w.id) ? ids.filter(id => id !== w.id) : [...ids, w.id]))}>
          <Text color={look.color} bold>
            {look.icon}
          </Text>{' '}
          <Text color={MUTED}>{fit(KIND_BADGE[w.kind], 3)}</Text> <Text bold>{label}</Text>
          <Text color={MUTED}>{fit(tag, nameWidth - [...label].length)}</Text>{' '}
          <Text color={look.color}>{fit(detail, detailWidth)}</Text>
          {barWidth ? ' ' : ''}
          <Text color={look.color}>{filled}</Text>
          <Text color={MUTED}>{empty}</Text>
          <Text color={MUTED}>{took}</Text>
        </Button>
      )
    }

    const details = (w: Watch) => {
      const isOpen = open.includes(w.id)
      // Closed, a failed run still shows its first reasons; an open one shows everything.
      const reasons = w.status === 'failed' ? w.tail.filter(line => line !== summaryOf(w)).slice(0, 2) : []
      const lines = isOpen ? w.tail.slice(0, 25) : reasons
      const hasError = w.misses > 0 && !isDone(w.status)
      if (!isOpen && !lines.length && !hasError) return null
      return (
        <Box key={`more:${w.id}`} flexDirection="column" paddingLeft={6}>
          {isOpen && w.title && <Text color={MUTED}>{w.title}</Text>}
          {isOpen && w.url && <Link key={`open:${w.id}`} href={w.url} label="open ↗" />}
          {hasError && (
            <Text color="red" wrap="truncate-end">
              can't reach it ({w.misses}/{MAX_MISSES}){w.error ? `: ${w.error}` : ''}
            </Text>
          )}
          {lines.map((line, i) => (
            <Text key={`${w.id}-t${i}`} color={tailColor(line)} wrap="truncate-end">
              {line}
            </Text>
          ))}
          {isOpen && !isDone(w.status) && <Text color={MUTED}>checked {elapsed(now - w.checkedAt)} ago</Text>}
        </Box>
      )
    }

    const section = (title: string, items: Watch[]) =>
      items.length > 0 && (
        <Box key={`section:${title}`} flexDirection="column" marginBottom={1}>
          <Text color={MUTED} bold>
            {title}
          </Text>
          {items.map(w => (
            <Box key={`watch:${w.id}`} flexDirection="column">
              {row(w)}
              {details(w)}
            </Box>
          ))}
        </Box>
      )

    const counts = [
      `${active.length - waiting} running`,
      waiting ? `${waiting} waiting` : '',
      `${done.length} done`,
      failed ? `${failed} failed` : '',
    ].filter(Boolean)

    return (
      <Box flexDirection="column">
        <Box key="header" backgroundColor={BAR_BG} paddingX={1} gap={2} width={e.props.bodyColumns || undefined}>
          <Text color={ACCENT} bold>
            ◆ runwatch
          </Text>
          <Text color={MUTED}>{counts.join(' · ')}</Text>
        </Box>
        <Box key="body" flexDirection="column" paddingX={1} marginTop={1}>
          {list.length === 0 ? (
            <Box flexDirection="column">
              <Text dimColor>Nothing watched.</Text>
              <Text dimColor>terrakube.sh run, jenkins.sh trigger, gh pr create, gh workflow run and git push are picked up by themselves.</Text>
              <Text dimColor>{USAGE}</Text>
            </Box>
          ) : (
            [section('RUNNING', active), section('DONE', done)]
          )}
        </Box>
        <Box key="actions" paddingX={1} gap={2}>
          {chosen?.url && <Button key="act-open" label="open" hotkey="o" plain onPress={() => openUrl($, chosen.url!)} />}
          {chosen && isDone(chosen.status) && (
            <Button key="act-ask" label="ask Claude" hotkey="a" plain onPress={() => $.prompt.submit({ text: askText(chosen) }).then(() => undefined)} />
          )}
          {chosen && <Button key="act-remove" label="remove" hotkey="x" plain onPress={() => remove($, [chosen.id], s)} />}
          {done.length > 0 && <Button key="act-clear" label="clear done" hotkey="d" plain onPress={() => clearDone($, s)} />}
          <Button key="act-close" label="close" hotkey="c" plain onPress={() => $.ui.close({ id: PANE })} />
        </Box>
        <Box key="hint" paddingX={1}>
          <Text color={MUTED}>ctrl+x tab: keys here · ↑↓ pick · enter details · every {s.pollMs / 1000}s</Text>
        </Box>
      </Box>
    )
  })
}
