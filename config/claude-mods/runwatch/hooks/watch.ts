import type { Watch, WatchStatus } from '../types'

// Pure parsing and detection, kept apart from the engine so tests reach it.

export type Seed = Pick<Watch, 'id' | 'kind' | 'label' | 'wake'> &
  Partial<Pick<Watch, 'org' | 'job' | 'path' | 'build' | 'queueId' | 'pr' | 'cwd' | 'url'>>

export type Reading = Pick<Watch, 'status' | 'detail'> & Partial<Pick<Watch, 'url' | 'build' | 'queueId'>>

export const isDone = (status: WatchStatus) => status === 'passed' || status === 'failed'

export function newWatch(seed: Seed, now: number): Watch {
  return { ...seed, status: 'queued', detail: 'starting', tail: [], startedAt: now, checkedAt: now, misses: 0 }
}

const unquote = (s: string) => s.replace(/^['"]|['"]$/g, '')
const PR_URL = /https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/

export const prLabel = (url: string) => {
  const m = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/.exec(url)
  return m ? `PR ${m[1]}#${m[2]}` : 'PR checks'
}

export const isPush = (command: string) => /\bgit\b(\s+-[Cc]\s+\S+)*\s+push\b/.test(command)

function jsonId(text: string) {
  try {
    const value = JSON.parse(text) as { id?: unknown }
    return typeof value.id === 'string' ? value.id : null
  } catch {
    return /"id"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? null
  }
}

// The run a Bash call just started, from its command and output. A git push
// is not here: its PR is looked up with gh (isPush).
export function detect(command: string, stdout: string, cwd: string): Seed | null {
  const tk = /terrakube\.sh['"]?\s+run\s+(\S+)\s+\S+\s+\S+\s+\S+\s+--confirm\b/.exec(command)
  if (tk) {
    const job = jsonId(stdout)
    if (!job) return null
    const org = unquote(tk[1] ?? '')
    return { id: `tk:${job}`, kind: 'terrakube', label: `Terrakube job ${job.slice(0, 8)}`, org, job, wake: false }
  }

  const jk = /jenkins\.sh['"]?\s+trigger\s+(\S+)/.exec(command)
  if (jk) {
    const queueId = /^location:.*\/queue\/item\/(\d+)/im.exec(stdout)?.[1]
    if (!queueId) return null
    const path = unquote(jk[1] ?? '')
    return { id: `jk:${path}:q${queueId}`, kind: 'jenkins', label: `Jenkins ${path}`, path, queueId, wake: false }
  }

  if (/\bgh\s+pr\s+create\b/.test(command)) {
    const url = PR_URL.exec(stdout)?.[0]
    if (!url) return null
    return prSeed(url, cwd, false)
  }
  return null
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

// `terrakube.sh job <org> <id>`: { id, attributes: { status, ... }, ui_url? }. ui_url is the run's page in the web UI.
export function readTerrakube(job: unknown): Reading {
  const value = job as { attributes?: { status?: unknown }; ui_url?: unknown } | undefined
  const status = String(value?.attributes?.status ?? '')
  const url = typeof value?.ui_url === 'string' ? value.ui_url : undefined
  return { status: Object.hasOwn(TERRAKUBE, status) ? TERRAKUBE[status]! : 'running', detail: status || 'unknown', url }
}

// `terrakube.sh step-log <org> <id>`: the plain-text log of each step. The plan
// summary first, then which resources change, or the log's last lines when
// there are none (a failed run ends with its error).
export function terrakubeTail(log: string): string[] {
  const text = log.trim()
  if (!text) return []
  const summary = planSummary(text)
  const actions = lastLines(text, Number.MAX_SAFE_INTEGER).filter(line => /^\s*# \S.* (will be|must be) /.test(line))
  const body = actions.length ? actions.slice(0, 10).map(line => line.trim()) : lastLines(text, 10)
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

// `jenkins.sh queue`: whether the item is still waiting, and why.
export function readQueue(queue: unknown, queueId: string): Reading | null {
  const items = (queue as { items?: { id?: unknown; why?: unknown }[] })?.items ?? []
  const item = items.find(one => String(one.id) === queueId)
  if (!item) return null
  return { status: 'queued', detail: typeof item.why === 'string' ? item.why : 'queued' }
}

// `jenkins.sh build-info <path> <build>`: { number, building, result, url }
export function readJenkins(info: unknown): Reading {
  const build = info as { number?: number; building?: boolean; result?: string | null; url?: string }
  const number = build.number === undefined ? '' : `#${build.number} `
  const reading = { url: build.url, build: build.number === undefined ? undefined : String(build.number) }
  if (build.building || !build.result) return { ...reading, status: 'running', detail: `${number}building` }
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
  if (pending > 0) return { status: 'running', detail: `${done}/${list.length} checks done${failing.length ? `, ${failing.length} failing` : ''}`, failing }
  if (failing.length) return { status: 'failed', detail: `${failing.length}/${list.length} checks failed`, failing }
  return { status: 'passed', detail: `${count('pass')}/${list.length} checks passed`, failing }
}

// `gh pr view <pr> --json state`: a merged or closed PR ends the watch, whatever its checks say.
export function readPrState(view: unknown): Reading | null {
  const state = (view as { state?: unknown } | undefined)?.state
  if (state === 'MERGED') return { status: 'passed', detail: 'merged' }
  if (state === 'CLOSED') return { status: 'failed', detail: 'closed without merging' }
  return null
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
