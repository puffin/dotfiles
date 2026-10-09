import type { EngineInterface, Register } from 'claude-code'

// PR checks and reviews change on GitHub with nothing happening here, so poll.
const PR_POLL_MS = 60_000

let home: string | null = null
let location = ''
let pr = ''
let prBranch: string | null = null

function draw($: EngineInterface) {
  const text = [location, pr].filter(Boolean).join('  ·  ')
  $.ui.status(text || undefined)
}

async function git($: EngineInterface, args: string[]) {
  const { exitCode, stdout } = await $.process.run(['git', ...args], { timeoutMs: 5000 })
  return exitCode === 0 ? stdout.trim() : null
}

async function refreshLocation($: EngineInterface) {
  if (home === null) {
    const { stdout } = await $.process.run(['printenv', 'HOME'])
    home = stdout.trim()
  }
  const cwd = await $.session.cwd()
  const dir = home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd

  // Detached HEAD reports "HEAD": fall back to the short sha.
  let branch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'HEAD') branch = await git($, ['rev-parse', '--short', 'HEAD'])

  location = branch ? `${dir}  ⎇ ${branch}` : dir
  draw($)

  if (branch !== prBranch) await refreshPr($)
}

type Check = { status?: string; conclusion?: string; state?: string }
type PrView = {
  number: number
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  reviewDecision: '' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REVIEW_REQUIRED'
  statusCheckRollup: Check[]
}

const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const FAILED = new Set(['FAILURE', 'ERROR', 'TIMED_OUT', 'CANCELLED', 'ACTION_REQUIRED', 'STARTUP_FAILURE'])
const REVIEW = { APPROVED: 'approved', CHANGES_REQUESTED: 'changes requested', REVIEW_REQUIRED: 'review pending' }

function formatPr(view: PrView) {
  if (view.state !== 'OPEN') return `#${view.number} ${view.state.toLowerCase()}`

  // A check run reports conclusion once completed; a commit status reports state.
  let passed = 0
  let failed = 0
  let pending = 0
  for (const check of view.statusCheckRollup) {
    const result = check.conclusion || check.state || ''
    if (PASSED.has(result)) passed += 1
    else if (FAILED.has(result)) failed += 1
    else pending += 1
  }
  const checks = [passed && `✓${passed}`, failed && `✗${failed}`, pending && `●${pending}`].filter(Boolean).join(' ')
  const review = view.isDraft ? 'draft' : view.reviewDecision ? REVIEW[view.reviewDecision] : ''

  return [`#${view.number}`, checks, review].filter(Boolean).join(' ')
}

async function refreshPr($: EngineInterface) {
  prBranch = await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])
  // No branch, no gh, or no PR for this branch: show nothing.
  const { exitCode, stdout } = await $.process.run(
    ['gh', 'pr', 'view', '--json', 'number,state,isDraft,reviewDecision,statusCheckRollup'],
    { timeoutMs: 15_000 },
  ).catch(() => ({ exitCode: 1, stdout: '' }))
  pr = prBranch && exitCode === 0 ? formatPr(JSON.parse(stdout) as PrView) : ''
  draw($)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refreshLocation($)
    $.clock.every(PR_POLL_MS, () => void refreshPr($))
    return result
  })

  // A Bash call is what moves the branch (checkout, switch, rebase) or the cwd,
  // and what pushes or opens a PR.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const result = await next(e)
    await refreshLocation($)
    if (/\bgh\s+pr\b|\bgit\s+push\b/.test(e.command)) await refreshPr($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refreshLocation($)
    return result
  })
}
