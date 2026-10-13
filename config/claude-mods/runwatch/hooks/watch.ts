import type { Watch, WatchStatus } from '../types'

// Pure parsing, detection and layout, kept apart from the engine so tests reach it.

export type Seed = Pick<Watch, 'id' | 'kind' | 'label' | 'wake'> &
  Partial<Pick<Watch, 'title' | 'org' | 'job' | 'path' | 'build' | 'queueId' | 'pr' | 'repo' | 'run' | 'workflow' | 'cwd' | 'project' | 'url'>> & {
    // The service may still report the previous attempt for a moment.
    settle?: boolean
  }

export type Reading = Pick<Watch, 'status' | 'detail'> &
  Partial<Pick<Watch, 'label' | 'title' | 'url' | 'build' | 'queueId' | 'ws' | 'repo' | 'run' | 'progress' | 'eta'>>

export const isDone = (status: WatchStatus) => status === 'passed' || status === 'failed'

// How long a rerun's or a push's first readings may still be the previous attempt's.
export const SETTLE_MS = 30_000

export function newWatch({ settle, ...seed }: Seed, now: number, owner: string): Watch {
  const settleUntil = settle ? now + SETTLE_MS : undefined
  return { ...seed, status: 'queued', detail: 'starting', tail: [], startedAt: now, checkedAt: now, misses: 0, owner, origin: owner, settleUntil }
}

const unquote = (s: string) => s.replace(/^['"]|['"]$/g, '')
const PR_URL = /https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/
const RUN_URL = /https:\/\/github\.com\/([^\s/]+\/[^\s/]+)\/actions\/runs\/(\d+)/

export const prLabel = (url: string) => {
  const m = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/.exec(url)
  return m ? `${m[1]}#${m[2]}` : 'PR checks'
}

// owner/name from a PR, run or repo URL, or a remote: https, ssh, or an ssh
// alias such as github.com-private.
export function repoOf(url: string) {
  const m = /github\.com[\w.-]*[:/]([^/\s:]+)\/([^/\s?#]+?)(?:\.git)?(?=[/\s?#]|$)/.exec(url)
  return m ? `${m[1]}/${m[2]}` : null
}

export const isPush = (command: string) => /\bgit\b(\s+-[Cc]\s+\S+)*\s+push\b/.test(command)

function jsonId(text: string) {
  const start = text.indexOf('{')
  try {
    const value = JSON.parse(start < 0 ? text : text.slice(start)) as { id?: unknown }
    return typeof value.id === 'string' ? value.id : null
  } catch {
    return /"id"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? null
  }
}

// The words after `marker` in a command, quotes taken off, up to the next
// shell operator.
function argsAfter(command: string, marker: RegExp) {
  const match = marker.exec(command)
  if (!match) return null
  const rest = command.slice(match.index + match[0].length).split(/\s*(?:&&|\|\||[;|]|\n)\s*/)[0] ?? ''
  return (rest.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(unquote)
}

// `terrakube.sh run` prints "Workspace : name (id)" and "Template : name (id)"
// before its JSON.
const previewField = (stdout: string, field: string) => new RegExp(`^\\s*${field}\\s*:\\s*(.+?)\\s+\\([^)]*\\)\\s*$`, 'm').exec(stdout)?.[1]

export const terrakubeLabel = (ws: string | undefined, job: string) => ws ?? `job ${job.slice(0, 8)}`

// The run a Bash call just started, from its command and output. A git push
// is not here: its PR is looked up with gh (isPush).
export function detect(command: string, stdout: string, cwd: string): Seed | null {
  const tk = argsAfter(command, /terrakube\.sh['"]?\s+run\b/)
  if (tk && tk.includes('--confirm')) {
    const [org] = tk.filter(arg => !arg.startsWith('-'))
    const job = jsonId(stdout)
    if (!org || !job) return null
    const ws = previewField(stdout, 'Workspace')
    const template = previewField(stdout, 'Template')
    return { id: `tk:${job}`, kind: 'terrakube', label: terrakubeLabel(ws, job), title: template, org, job, wake: false }
  }

  const jk = argsAfter(command, /jenkins\.sh['"]?\s+trigger\b/)
  if (jk) {
    const queueId = /^location:.*\/queue\/item\/(\d+)/im.exec(stdout)?.[1]
    const path = jk[0]
    if (!queueId || !path) return null
    return { id: `jk:${path}:q${queueId}`, kind: 'jenkins', label: path, path, queueId, wake: false }
  }

  if (/\bgh\s+pr\s+create\b/.test(command)) {
    const url = PR_URL.exec(stdout)?.[0]
    return url ? prSeed(url, cwd, false) : null
  }

  // gh's own confirmation, so a command that only mentions one (a heredoc, an echo) is no run.
  const dispatch = /Created workflow_dispatch event/i.test(stdout) ? argsAfter(command, /\bgh\s+workflow\s+run\b/) : null
  if (dispatch) {
    const url = RUN_URL.exec(stdout)
    if (url) return ghaSeed(url[1]!, url[2]!, cwd, false)
    // Most gh versions print no run URL: the run is found by its workflow.
    const { first, repo } = ghArgs(dispatch)
    return first ? workflowSeed(repo, first, cwd, false) : null
  }

  const rerun = /Requested rerun/i.test(stdout) ? argsAfter(command, /\bgh\s+run\s+rerun\b/) : null
  if (rerun) {
    const url = RUN_URL.exec(stdout)
    const { first, repo } = ghArgs(rerun)
    const seed = url ? ghaSeed(url[1]!, url[2]!, cwd, false) : first && /^\d+$/.test(first) ? ghaSeed(repo, first, cwd, false) : null
    return seed && { ...seed, settle: true }
  }
  return null
}

// gh flags that take a value, so their value is not taken for the workflow or run.
const GH_VALUE_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '-r', '--ref', '-R', '--repo', '-j', '--job', '--json'])

// The first positional argument of a gh command, and its -R repo.
function ghArgs(args: string[]) {
  let first: string | undefined
  let repo: string | null = null
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    if (arg === '-R' || arg === '--repo') repo = args[i + 1] ?? null
    if (arg.startsWith('--repo=')) repo = arg.slice('--repo='.length)
    if (GH_VALUE_FLAGS.has(arg)) i++
    else if (!arg.startsWith('-') && first === undefined) first = arg
  }
  return { first, repo }
}

export const prSeed = (url: string, cwd: string, wake: boolean): Seed => ({
  id: `pr:${url}`,
  kind: 'pr',
  label: prLabel(url),
  pr: url,
  url,
  cwd,
  wake,
})

export const ghaSeed = (repo: string | null, run: string, cwd: string, wake: boolean): Seed => ({
  id: `gha:${repo ?? cwd}:${run}`,
  kind: 'gha',
  label: `run ${run}`,
  run,
  cwd,
  wake,
  ...(repo ? { repo, url: `https://github.com/${repo}/actions/runs/${run}` } : {}),
})

// A dispatched workflow, until `gh run list` shows its run. Dispatching it
// again replaces the watch.
export const workflowSeed = (repo: string | null, workflow: string, cwd: string, wake: boolean): Seed => ({
  id: `gha:${repo ?? cwd}:wf:${workflow}`,
  kind: 'gha',
  label: workflow,
  workflow,
  cwd,
  wake,
  ...(repo ? { repo } : {}),
})

// `gh run list --workflow <file> --json databaseId,createdAt,url`: the newest
// run created since the dispatch, allowing a minute of clock skew.
export function newestRun(list: unknown, since: number): { run: string; url: string } | null {
  const runs = Array.isArray(list) ? (list as { databaseId?: unknown; createdAt?: unknown; url?: unknown }[]) : []
  const fresh = runs
    .map(r => ({ run: String(r.databaseId ?? ''), url: typeof r.url === 'string' ? r.url : '', at: Date.parse(String(r.createdAt ?? '')) }))
    .filter(r => r.run && r.url && r.at >= since - 60_000)
    .sort((a, b) => b.at - a.at)
  return fresh[0] ? { run: fresh[0].run, url: fresh[0].url } : null
}

// A run URL or id, for the watch tool.
export function parseRun(value: string): { repo: string | null; run: string } | null {
  const url = RUN_URL.exec(value)
  if (url) return { repo: url[1]!, run: url[2]! }
  return /^\d+$/.test(value) ? { repo: null, run: value } : null
}

const TERRAKUBE: Record<string, WatchStatus> = {
  pending: 'queued',
  queue: 'queued',
  running: 'running',
  approved: 'running',
  waitingApproval: 'waiting',
  completed: 'passed',
  noChanges: 'passed',
  failed: 'failed',
  rejected: 'failed',
  cancelled: 'failed',
  unknown: 'failed',
}

const TERRAKUBE_WORDS: Record<string, string> = { waitingApproval: 'waiting for approval', noChanges: 'no changes', queue: 'queued' }

// `terrakube.sh job <org> <id>`: { id, attributes: { status }, relationships: { workspace }, ui_url? }.
export function readTerrakube(job: unknown): Reading {
  const value = job as { attributes?: { status?: unknown }; relationships?: { workspace?: { data?: { id?: unknown } } }; ui_url?: unknown } | undefined
  const status = String(value?.attributes?.status ?? '')
  const ws = value?.relationships?.workspace?.data?.id
  return {
    status: Object.hasOwn(TERRAKUBE, status) ? TERRAKUBE[status]! : 'running',
    detail: TERRAKUBE_WORDS[status] ?? (status || 'unknown'),
    url: typeof value?.ui_url === 'string' ? value.ui_url : undefined,
    ws: typeof ws === 'string' ? ws : undefined,
  }
}

// `terrakube.sh workspace <org> <id>`: { id, attributes: { name } }.
export function workspaceName(workspace: unknown) {
  const name = (workspace as { attributes?: { name?: unknown } } | undefined)?.attributes?.name
  return typeof name === 'string' && name ? name : null
}

// `terrakube.sh step-log <org> <id>`: the plain-text log of each step. The plan
// summary first, then which resources change, or the log's last lines when
// there are none (a failed run ends with its error).
export function terrakubeTail(log: string): string[] {
  const text = log.trim()
  if (!text) return []
  const summary = planSummary(text)
  const actions = lastLines(text, Number.MAX_SAFE_INTEGER).filter(line => /^\s*# \S.* (will be|must be) /.test(line))
  const body = actions.length ? actions.slice(0, 20).map(line => line.trim()) : lastLines(text, 12)
  return [...(summary ? [summary] : []), ...body]
}

export function planSummary(text: string) {
  const plan = /Plan: (\d+) to add, (\d+) to change, (\d+) to destroy/.exec(text)
  if (plan) return `plan: +${plan[1]} ~${plan[2]} -${plan[3]}`
  const apply = /Apply complete! Resources: (\d+) added, (\d+) changed, (\d+) destroyed/.exec(text)
  if (apply) return `applied: +${apply[1]} ~${apply[2]} -${apply[3]}`
  if (/No changes\./.test(text)) return 'no changes'
  return null
}

// The plan or apply summary a Terrakube watch's tail starts with, if any.
export const summaryOf = (w: Pick<Watch, 'kind' | 'tail'>) =>
  w.kind === 'terrakube' && /^(plan:|applied:|no changes)/.test(w.tail[0] ?? '') ? w.tail[0]! : null

// `jenkins.sh queue`: whether the item is still waiting, and why.
export function readQueue(queue: unknown, queueId: string): Reading | null {
  const items = (queue as { items?: { id?: unknown; why?: unknown }[] })?.items ?? []
  const item = items.find(one => String(one.id) === queueId)
  if (!item) return null
  return { status: 'queued', detail: typeof item.why === 'string' ? item.why : 'queued' }
}

// `jenkins.sh build-info <path> <build>`: Jenkins' own JSON. A running build
// is measured against `estimatedDuration` (ms, -1 when Jenkins has no history).
export function readJenkins(info: unknown, now: number): Reading {
  const build = info as { number?: number; building?: boolean; result?: string | null; url?: string; timestamp?: number; estimatedDuration?: number }
  const number = build.number === undefined ? '' : `#${build.number} `
  const reading = { url: build.url, build: build.number === undefined ? undefined : String(build.number) }
  if (build.building || !build.result) {
    const estimate = build.estimatedDuration ?? -1
    if (estimate > 0 && build.timestamp) {
      const ran = Math.max(0, now - build.timestamp)
      return { ...reading, status: 'running', detail: `${number}building`, progress: Math.min(0.99, ran / estimate), eta: Math.max(0, estimate - ran) }
    }
    return { ...reading, status: 'running', detail: `${number}building` }
  }
  return { ...reading, status: build.result === 'SUCCESS' ? 'passed' : 'failed', detail: `${number}${build.result}` }
}

// `gh pr checks <pr> --json name,bucket`: bucket is pass, fail, pending, skipping or cancel.
export function readChecks(checks: unknown): Reading & { failing: string[] } {
  const list = Array.isArray(checks) ? (checks as { name?: string; bucket?: string }[]) : []
  if (list.length === 0) return { status: 'queued', detail: 'waiting for checks', failing: [] }
  const count = (bucket: string) => list.filter(check => check.bucket === bucket).length
  const failing = list.filter(check => check.bucket === 'fail' || check.bucket === 'cancel').map(check => `✗ ${check.name}`)
  const pending = count('pending')
  const done = list.length - pending
  if (pending > 0) {
    const detail = `${done}/${list.length} checks${failing.length ? `, ${failing.length} failing` : ''}`
    return { status: 'running', detail, failing, progress: done / list.length }
  }
  if (failing.length) return { status: 'failed', detail: `${failing.length}/${list.length} checks failed`, failing }
  return { status: 'passed', detail: `${count('pass')}/${list.length} checks passed`, failing }
}

// `gh pr view <pr> --json state,title`: a merged or closed PR ends the watch,
// whatever its checks say.
export function readPr(view: unknown): { ended: Reading | null; title?: string } {
  const value = view as { state?: unknown; title?: unknown } | undefined
  const title = typeof value?.title === 'string' ? value.title : undefined
  if (value?.state === 'MERGED') return { ended: { status: 'passed', detail: 'merged' }, title }
  if (value?.state === 'CLOSED') return { ended: { status: 'failed', detail: 'closed without merging' }, title }
  return { ended: null, title }
}

type Step = { name?: string; conclusion?: string }
type Job = { name?: string; status?: string; conclusion?: string; steps?: Step[] }

const FAILED = new Set(['failure', 'cancelled', 'timed_out', 'startup_failure', 'action_required'])

// `gh run view <id> --json status,conclusion,jobs,displayTitle,workflowName,url,headBranch`.
export function readRun(view: unknown): Reading & { failing: string[] } {
  const run = view as {
    status?: string; conclusion?: string; jobs?: Job[]; displayTitle?: string; workflowName?: string; url?: string; headBranch?: string
  } | undefined
  const jobs = run?.jobs ?? []
  const done = jobs.filter(job => job.status === 'completed').length
  const failing = jobs
    .filter(job => FAILED.has(job.conclusion ?? ''))
    .flatMap(job => [`✗ ${job.name}`, ...(job.steps ?? []).filter(step => FAILED.has(step.conclusion ?? '')).map(step => `  › ${step.name}`)])
  const meta = {
    label: run?.workflowName || undefined,
    title: [run?.displayTitle, run?.headBranch].filter(Boolean).join(' · ') || undefined,
    url: run?.url,
    repo: run?.url ? (repoOf(run.url) ?? undefined) : undefined,
  }
  if (run?.status === 'completed') {
    const conclusion = run.conclusion || 'completed'
    const isFailed = FAILED.has(conclusion)
    return { ...meta, status: isFailed ? 'failed' : 'passed', detail: conclusion.replace(/_/g, ' '), failing }
  }
  if (run?.status === 'waiting') return { ...meta, status: 'waiting', detail: 'waiting for approval', failing }
  if (!run?.status || run.status === 'queued' || run.status === 'requested' || run.status === 'pending') {
    return { ...meta, status: 'queued', detail: 'queued', failing }
  }
  const detail = jobs.length ? `${done}/${jobs.length} jobs${failing.length ? `, ${failing.length} failing` : ''}` : 'in progress'
  return { ...meta, status: 'running', detail, failing, progress: jobs.length ? done / jobs.length : undefined }
}

export const lastLines = (text: string, n: number) =>
  text
    .replace(/\r/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .split('\n')
    .map(line => line.trimEnd())
    .filter(Boolean)
    .slice(-n)

export function elapsed(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

// Plugin cache folders are versions ("0.2.1"): the newest wins.
export function newestVersion(names: string[]) {
  const parts = (v: string) => v.split('.').map(n => Number.parseInt(n, 10) || 0)
  return [...names]
    .filter(name => /^\d+(\.\d+)*$/.test(name))
    .sort((a, b) => {
      const [pa, pb] = [parts(a), parts(b)]
      for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0)
        if (d) return d
      }
      return 0
    })
    .at(-1)
}

// Layout: text cut or padded to a column, and a progress bar's two halves.
export function fit(text: string, width: number) {
  if (width <= 0) return ''
  const chars = [...text]
  if (chars.length > width) return `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
  return text + ' '.repeat(width - chars.length)
}

export function bar(progress: number, width: number): [filled: string, empty: string] {
  const cells = Math.round(Math.max(0, Math.min(1, progress)) * width)
  return ['━'.repeat(cells), '─'.repeat(width - cells)]
}

// Watches from every project share the store: these say whose a watch is.
// One saved before projects were recorded counts as here.
export const isHere = (w: Pick<Watch, 'project'>, root: string) => !w.project || w.project === root

export const projectName = (path: string) => path.replace(/\/+$/, '').split('/').at(-1) || path

export const shown = <T extends Pick<Watch, 'project'>>(list: T[], show: 'all' | 'project', root: string) =>
  show === 'all' ? list : list.filter(w => isHere(w, root))

// At most `max` watches: every running one, then the most recently finished.
// A running one is never dropped, or nobody would poll it.
export function capped<T extends Pick<Watch, 'status' | 'startedAt' | 'endedAt' | 'checkedAt'>>(list: T[], max: number) {
  const active = list.filter(w => !isDone(w.status))
  const done = list
    .filter(w => isDone(w.status))
    .sort((a, b) => (b.endedAt ?? b.checkedAt) - (a.endedAt ?? a.checkedAt))
    .slice(0, Math.max(0, max - active.length))
  return [...active, ...done].sort((a, b) => a.startedAt - b.startedAt)
}

export const KIND_BADGE: Record<Watch['kind'], string> = { terrakube: 'tk', jenkins: 'jk', pr: 'pr', gha: 'gha' }

const KIND_NAME: Record<Watch['kind'], string> = { terrakube: 'Terrakube', jenkins: 'Jenkins', pr: 'PR', gha: 'GitHub Actions' }

// How a run is named in toasts, notifications and the prompt to Claude.
export const describe = (w: Pick<Watch, 'kind' | 'label' | 'title'>) =>
  `${KIND_NAME[w.kind]} ${w.label}${w.kind === 'terrakube' && w.title ? ` (${w.title})` : ''}`

// The status line under the prompt: what still runs, what waits on you, what failed.
export function statusLine(watches: Pick<Watch, 'status'>[]) {
  const count = (status: WatchStatus) => watches.filter(w => w.status === status).length
  const running = count('running') + count('queued')
  const parts = [
    running ? `⟳ ${running} running` : '',
    count('waiting') ? `‖ ${count('waiting')} waiting` : '',
    count('failed') ? `✗ ${count('failed')} failed` : '',
  ].filter(Boolean)
  return running || count('waiting') ? parts.join(' · ') : undefined
}
