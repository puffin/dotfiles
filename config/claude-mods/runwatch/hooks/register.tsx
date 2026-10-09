import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Watch, WatchStatus } from '../types'
import {
  detect,
  elapsed,
  isDone,
  isPush,
  lastLines,
  newestVersion,
  newWatch,
  prSeed,
  readChecks,
  readJenkins,
  readPrState,
  readQueue,
  readTerrakube,
  terrakubeTail,
} from './watch'
import type { Reading, Seed } from './watch'

const PANE = 'runwatch'
const POLL_MS = 20_000
// Polls in a row that may fail to reach a service before the watch gives up.
const MAX_MISSES = 6
// A PR that reports no checks for this long has none to wait for.
const NO_CHECKS_MS = 10 * 60_000
const MAX_WATCHES = 20
const TOAST_MS = 10_000
// The ge-cloudops skills' wrappers hold the credentials; the mod only runs them.
const SKILLS = '.claude/plugins/cache/ge-cloudops'

const ACCENT = 'cyan'
const MUTED = 'gray'
const BAR_BG = 'blackBright'
const LOOK: Record<WatchStatus, { icon: string; color: string }> = {
  queued: { icon: '…', color: MUTED },
  running: { icon: '⟳', color: 'yellow' },
  waiting: { icon: '⏸', color: 'magenta' },
  passed: { icon: '✓', color: 'green' },
  failed: { icon: '✗', color: 'red' },
}

const watches = atom({ plugin: 'runwatch', key: 'watches' } as const, [])

let home: string | null = null
async function homeDir($: EngineInterface) {
  if (home === null) home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  return home
}

async function script($: EngineInterface, name: 'terrakube' | 'jenkins') {
  const root = `${await homeDir($)}/${SKILLS}/${name}`
  const version = newestVersion((await $.fs.list(root).catch(() => [])).map(entry => entry.name))
  return version ? `${root}/${version}/scripts/${name}.sh` : null
}

async function run($: EngineInterface, argv: string[], cwd?: string) {
  return $.process
    .run(argv, { cwd, timeoutMs: 30_000 })
    .catch((err: unknown) => ({ exitCode: -1, stdout: '', stderr: String(err) }))
}

function json(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

const firstLine = (text: string) => text.trim().split('\n')[0]?.slice(0, 120) || 'no output'

type Poll = { reading: Reading; tail?: string[] } | { error: string }

// One look at the run. Output is fetched only when the status moves, since a
// plan or console log can be large.
async function poll($: EngineInterface, w: Watch): Promise<Poll> {
  if (w.kind === 'terrakube') {
    const tk = await script($, 'terrakube')
    if (!tk) return { error: 'the terrakube skill is not installed' }
    const job = await run($, [tk, 'job', w.org ?? '', w.job ?? ''])
    if (job.exitCode !== 0) return { error: firstLine(job.stderr) }
    const reading = readTerrakube(json(job.stdout))
    const hasOutput = reading.status === 'waiting' || isDone(reading.status)
    if (!hasOutput || reading.status === w.status) return { reading }
    // A plugin older than step-log exits non-zero: finish without the log lines.
    const log = await run($, [tk, 'step-log', w.org ?? '', w.job ?? ''])
    return { reading, tail: log.exitCode === 0 ? terrakubeTail(log.stdout) : [] }
  }

  if (w.kind === 'jenkins') {
    const jk = await script($, 'jenkins')
    if (!jk) return { error: 'the jenkins skill is not installed' }
    const path = w.path ?? ''
    if (w.queueId && !w.build) {
      const queue = await run($, [jk, 'queue'])
      if (queue.exitCode !== 0) return { error: firstLine(queue.stderr) }
      const queued = readQueue(json(queue.stdout), w.queueId)
      if (queued) return { reading: queued }
      // Left the queue: its build is the job's newest.
    }
    const info = await run($, [jk, 'build-info', path, w.build ?? 'lastBuild'])
    if (info.exitCode !== 0) return { error: firstLine(info.stderr) }
    const reading = readJenkins(json(info.stdout))
    if (!isDone(reading.status)) return { reading }
    const build = reading.build ?? w.build ?? 'lastBuild'
    const log = await run($, ['sh', '-c', '"$0" log "$1" "$2" | tail -n 12', jk, path, build])
    return { reading, tail: lastLines(log.stdout, 12) }
  }

  // A repo without PR checks would otherwise wait out NO_CHECKS_MS even after the merge.
  const view = await run($, ['gh', 'pr', 'view', w.pr ?? '', '--json', 'state'], w.cwd)
  const ended = readPrState(json(view.stdout))
  if (ended) return { reading: ended }

  const checks = await run($, ['gh', 'pr', 'checks', w.pr ?? '', '--json', 'name,bucket'], w.cwd)
  // gh exits non-zero while checks are pending or failing, so read its output first.
  const list = json(checks.stdout) ?? (/no checks reported/i.test(checks.stderr) ? [] : undefined)
  if (list === undefined) return { error: firstLine(checks.stderr) }
  const { failing, ...reading } = readChecks(list)
  if (reading.detail === 'waiting for checks' && Date.now() - w.startedAt > NO_CHECKS_MS) {
    return { reading: { status: 'passed', detail: 'no checks reported' } }
  }
  return { reading, tail: failing }
}

const defined = <T extends object>(value: T) =>
  Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>

async function check($: EngineInterface, id: string) {
  const w = (await read($, watches)).find(one => one.id === id)
  if (!w || isDone(w.status)) return

  const result = await poll($, w).catch((err: unknown): Poll => ({ error: String(err) }))
  const now = Date.now()
  let fresh: Watch
  if ('error' in result) {
    const misses = w.misses + 1
    fresh =
      misses >= MAX_MISSES
        ? { ...w, misses, status: 'failed', detail: `lost contact: ${result.error}`, checkedAt: now, endedAt: now }
        : { ...w, misses, checkedAt: now }
  } else {
    const { reading, tail } = result
    fresh = { ...w, ...defined(reading), tail: tail ?? w.tail, misses: 0, checkedAt: now }
    if (isDone(fresh.status)) fresh.endedAt = now
  }

  // Decided inside the write, so two polls of one run never both announce it.
  let isFinished = false
  let isNowWaiting = false
  await update($, watches, list =>
    list.map(one => {
      if (one.id !== id || isDone(one.status)) return one
      isFinished = isDone(fresh.status)
      isNowWaiting = one.status !== 'waiting' && fresh.status === 'waiting'
      return fresh
    }),
  )

  const summary = fresh.kind === 'terrakube' && /^(plan:|applied:|no changes)/.test(fresh.tail[0] ?? '') ? ` · ${fresh.tail[0]}` : ''
  if (isNowWaiting) $.ui.toast(`⏸ ${fresh.label} is waiting for approval${summary}`, { timeoutMs: TOAST_MS })
  if (isFinished) {
    $.ui.toast(`${LOOK[fresh.status].icon} ${fresh.label}: ${fresh.detail}${summary}`, { timeoutMs: TOAST_MS })
    if (fresh.wake) void $.prompt.submit({ text: wakeText(fresh) }).catch(() => undefined)
  }
}

function wakeText(w: Watch) {
  const link = w.kind === 'terrakube' && w.url ? `\nRun: ${w.url}` : ''
  const tail = w.tail.length ? `\n\n\`\`\`\n${w.tail.join('\n')}\n\`\`\`` : ''
  return `[runwatch] ${w.label} finished: ${w.status} (${w.detail}) after ${elapsed((w.endedAt ?? w.checkedAt) - w.startedAt)}.${link}${tail}`
}

async function refreshStatus($: EngineInterface) {
  const active = (await read($, watches)).filter(w => !isDone(w.status)).length
  $.ui.status(active ? `⟳ ${active} running` : undefined)
}

let isTicking = false
async function tick($: EngineInterface) {
  if (isTicking) return
  isTicking = true
  try {
    for (const w of await read($, watches)) if (!isDone(w.status)) await check($, w.id)
    await refreshStatus($)
  } finally {
    isTicking = false
  }
}

async function add($: EngineInterface, seed: Seed) {
  const w = newWatch(seed, Date.now())
  // The same run started again replaces its old watch.
  await update($, watches, list => [...list.filter(one => one.id !== w.id), w].slice(-MAX_WATCHES))
  void $.ui.open({ id: PANE, title: 'runwatch' }).catch(() => undefined)
  void check($, w.id).then(() => refreshStatus($))
  return w
}

async function prUrl($: EngineInterface, cwd: string, pr?: string) {
  if (pr && /^https:\/\//.test(pr)) return pr
  const view = await run($, ['gh', 'pr', 'view', ...(pr ? [pr] : []), '--json', 'url'], cwd)
  const url = (json(view.stdout) as { url?: unknown } | undefined)?.url
  return typeof url === 'string' ? url : null
}

type Request = { kind?: unknown; org?: unknown; job?: unknown; path?: unknown; build?: unknown; pr?: unknown }
const str = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : typeof value === 'number' ? String(value) : undefined)

// A watch asked for by name, from the model's tool or /watch.
async function fromRequest($: EngineInterface, req: Request, wake: boolean): Promise<Seed | { error: string }> {
  const [org, job, path, build, pr] = [str(req.org), str(req.job), str(req.path), str(req.build), str(req.pr)]
  if (req.kind === 'terrakube') {
    if (!org || !job) return { error: 'terrakube needs org and job' }
    return { id: `tk:${job}`, kind: 'terrakube', label: `Terrakube job ${job.slice(0, 8)}`, org, job, wake }
  }
  if (req.kind === 'jenkins') {
    if (!path) return { error: 'jenkins needs path (the job path, e.g. folder/job)' }
    return { id: `jk:${path}:${build ?? 'last'}`, kind: 'jenkins', label: `Jenkins ${path}`, path, build, wake }
  }
  if (req.kind === 'pr') {
    const cwd = await $.session.cwd()
    const url = await prUrl($, cwd, pr)
    if (!url) return { error: pr ? `no PR found for ${pr}` : 'no PR found for the current branch' }
    return prSeed(url, cwd, wake)
  }
  return { error: 'kind must be terrakube, jenkins or pr' }
}

const USAGE = 'Usage: /watch [tk <org> <job> | jenkins <path> [build] | pr [number|url] | clear]'

function parseArgs(args: string): Request | 'open' | 'clear' | null {
  const [what, ...rest] = args.trim().split(/\s+/).filter(Boolean)
  if (!what) return 'open'
  if (what === 'clear') return 'clear'
  if (what === 'tk' || what === 'terrakube') return { kind: 'terrakube', org: rest[0], job: rest[1] }
  if (what === 'jenkins' || what === 'jk') return { kind: 'jenkins', path: rest[0], build: rest[1] }
  if (what === 'pr') return { kind: 'pr', pr: rest[0] }
  return null
}

const clearDone = ($: EngineInterface) => update($, watches, list => list.filter(w => !isDone(w.status)))

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'watch', description: 'Watch a Terrakube job, Jenkins build or PR checks in a pane' })
    await $.tool.register({
      name: 'watch',
      description:
        'Hand a long-running Terrakube job, Jenkins build or GitHub PR checks to a background watcher instead of polling it yourself. ' +
        'The user sees it live in a pane and gets a toast when it finishes, and you receive a prompt with the result then. ' +
        "Never poll or sleep-wait on a run you've handed over. Runs started with terrakube.sh run --confirm, jenkins.sh trigger, " +
        'gh pr create or git push are picked up automatically; use this for anything else.',
      inputSchema: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['terrakube', 'jenkins', 'pr'] },
          org: { type: 'string', description: 'terrakube: organization id or name' },
          job: { type: 'string', description: 'terrakube: job id' },
          path: { type: 'string', description: 'jenkins: job path, e.g. folder/job' },
          build: { type: 'string', description: 'jenkins: build number (default: newest)' },
          pr: { type: 'string', description: 'pr: number or URL (default: the current branch)' },
        },
        required: ['kind'],
      },
      isDeferred: false,
    })
    // Watches live in session state, so a reload picks them up where they were.
    $.clock.every(POLL_MS, () => void tick($))
    void refreshStatus($)
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
        if (url) seed = prSeed(url, cwd, false)
      }
      if (!seed) return ran
      const w = await add($, seed)
      return {
        ...ran,
        context: [
          ...(ran.context ?? []),
          `runwatch is now watching ${w.label} in its pane, and the user gets a toast when it finishes. Don't poll it.`,
        ],
      }
    } catch {
      return ran
    }
  })

  on('tool.call', { tool: 'mcp__runwatch__watch' }, async ($, e) => {
    const seed = await fromRequest($, e, true)
    if ('error' in seed) return { deny: `runwatch: ${seed.error}` }
    const w = await add($, seed)
    return { result: `Watching ${w.label}. You'll get a prompt with the result when it finishes; don't poll it.` }
  }).catch(() => ({ deny: 'runwatch could not start the watch.' }))

  on('command.run', { command: 'watch' }, async ($, e) => {
    const req = parseArgs(e.args)
    if (req === null) return { text: USAGE }
    if (req === 'clear') {
      await clearDone($)
      return { text: 'Cleared finished watches.' }
    }
    if (req === 'open') {
      await $.ui.open({ id: PANE, title: 'runwatch' })
      const count = (await read($, watches)).length
      return { text: count ? `${count} watch${count === 1 ? '' : 'es'}.` : `Nothing watched yet. ${USAGE}` }
    }
    const seed = await fromRequest($, req, false)
    if ('error' in seed) return { text: `${seed.error}. ${USAGE}` }
    const w = await add($, seed)
    return { text: `Watching ${w.label}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Link, Text } = $.ui.resolve(e)
    const list = await read($, watches)
    const now = Date.now()
    const active = list.filter(w => !isDone(w.status)).length

    const header = (
      <Box key="header" backgroundColor={BAR_BG} paddingX={1} justifyContent="space-between" width={e.props.bodyColumns}>
        <Box gap={1}>
          <Text color={ACCENT} bold>
            ◆ runwatch
          </Text>
          <Text color={MUTED}>
            {active} running · {list.length - active} done
          </Text>
        </Box>
        <Box gap={2}>
          <Button key="clear" label="clear done" hotkey="d" plain onPress={() => clearDone($)} />
          <Button key="close" label="close" hotkey="c" plain onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )

    const rows = [...list].reverse().map(w => {
      const look = LOOK[w.status]
      const took = elapsed((w.endedAt ?? now) - w.startedAt)
      // A run in progress shows its last line; a finished one its whole tail.
      const tail = isDone(w.status) || w.status === 'waiting' ? w.tail.slice(0, 8) : w.tail.slice(-1)
      return (
        <Box key={w.id} flexDirection="column" marginBottom={1}>
          <Box justifyContent="space-between">
            <Box gap={1} flexShrink={1}>
              <Text color={look.color} bold>
                {look.icon}
              </Text>
              <Text bold wrap="truncate-end">
                {w.label}
              </Text>
              <Text color={look.color} wrap="truncate-end">
                {w.detail}
              </Text>
            </Box>
            <Box gap={2} flexShrink={0}>
              <Text color={MUTED}>{took}</Text>
              {w.url && <Link key={`open-${w.id}`} href={w.url} label="open" />}
              <Button
                key={`x-${w.id}`}
                label="✕"
                plain
                onPress={() => update($, watches, all => all.filter(one => one.id !== w.id)).then(() => refreshStatus($))}
              />
            </Box>
          </Box>
          {w.misses > 0 && <Text color="red">  can't reach it ({w.misses}/{MAX_MISSES})</Text>}
          {tail.map((line, i) => (
            <Text key={`${w.id}-t${i}`} color={MUTED} wrap="truncate-end">
              {'  '}
              {line}
            </Text>
          ))}
        </Box>
      )
    })

    return (
      <Box flexDirection="column">
        {header}
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          {list.length === 0 ? <Text dimColor>Nothing watched. /watch tk|jenkins|pr …</Text> : rows}
        </Box>
        <Box key="footer" paddingX={1}>
          <Text color={MUTED}>checks every {POLL_MS / 1000}s · d clear done · c close</Text>
        </Box>
      </Box>
    )
  })
}
