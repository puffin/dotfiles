import type { Pending, Row } from '../types'
import { type Lookup, mcpWrite } from './mcp'
import type { Write } from './shell'

const PUSH = /\bgit\b(\s+-[Cc]\s+\S+)*\s+push\b/
const PR = /\bgh\s+pr\s+(create|merge)\b/

// Keys the engine adds to a tool call's input, or that only set its format;
// never shown as the write's own arguments.
const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent', 'cloudId', 'contentFormat', 'responseContentFormat', 'actionSource'])

// The write this call would make, or null when the call is not gated. A shell
// command gets a plain question here; describeShell fills it in once the
// repository has been looked at.
export function classify(e: { tool: string; [key: string]: unknown }, lookup: Lookup = {}): Pending | null {
  if (e.tool === 'Bash') {
    const command = typeof e.command === 'string' ? e.command : ''
    const pr = PR.exec(command)
    const action = pr ? `gh pr ${pr[1]}` : PUSH.test(command) ? 'git push' : null
    if (!action) return null
    return { tool: e.tool, action, question: `Run this ${action}?`, approve: 'Run it', target: '', rows: [], body: '', meta: '', metaLabel: '', command }
  }

  const found = mcpWrite(e.tool)
  if (!found) return null

  const args = Object.fromEntries(Object.entries(e).filter(([key]) => !RESERVED.has(key)))
  const described = found.describe(args, lookup)
  const rest = Object.fromEntries(Object.entries(args).filter(([key]) => !described.used.includes(key)))

  return {
    tool: e.tool,
    action: found.action,
    question: described.question,
    approve: found.approve,
    target: described.target,
    rows: described.rows.filter(([, value]) => value !== ''),
    body: described.body,
    meta: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '',
    metaLabel: 'other arguments',
    command: '',
  }
}

// What looking at the repository found for one write; '' where it found nothing.
export type Context = {
  // The folder the write runs in, null when a variable sets it.
  dir: string | null
  branch: string
  remote: string
  repo: string
  defaultBranch: string
  commits: string
  // The PR description read from --body-file, null when not read.
  body: string | null
  pr: { number: number; title: string; head: string; base: string } | null
}

export const NO_CONTEXT: Context = { dir: null, branch: '', remote: '', repo: '', defaultBranch: '', commits: '', body: null, pr: null }

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const lines = (text: string) => (text ? text.split('\n').length : 0)
const short = (repo: string) => repo.split('/').pop() ?? repo
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const tilde = (path: string, home: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path)

type Described = Pick<Pending, 'question' | 'approve' | 'target' | 'rows' | 'body' | 'meta' | 'metaLabel'>

// The question, option label and summary rows for the writes in a command,
// null when there are none to describe.
export function describeShell(writes: Write[], contexts: Context[], home: string): Described | null {
  if (!writes.length) return null
  const clauses: string[] = []
  const labels: string[] = []
  const rows: Row[] = []
  const row = (label: string, value: string) => {
    if (value && !rows.some(([l, v]) => l === label && v === value)) rows.push([label, value])
  }
  let body = ''
  let pushed = ''
  let proposed = ''

  writes.forEach((write, k) => {
    const c = contexts[k] ?? NO_CONTEXT
    row('Folder', c.dir === null ? 'set by a variable, not checked' : tilde(c.dir, home))

    if (write.kind === 'push') {
      const branch = write.refs.join(', ') || c.branch || 'the current branch'
      const remote = write.remote || c.remote || 'its remote'
      const n = lines(c.commits)
      const verb = write.isForce ? 'force-push' : 'push'
      clauses.push(write.isDelete ? `delete ${branch} on ${remote}` : `${verb} ${branch} to ${remote}${n ? ` (${plural(n, 'commit')})` : ''}`)
      labels.push(write.isDelete ? 'Delete branch' : write.isForce ? 'Force-push' : 'Push')
      row('Repo', c.repo)
      row('Push', `${branch} → ${remote}`)
      const options = [write.isForce && 'force', write.isUpstream && 'sets upstream', write.isTags && 'tags'].filter(Boolean)
      if (options.length) row('Options', options.join(', '))
      pushed ||= c.commits
    }

    if (write.kind === 'pr create') {
      const repo = write.repo || c.repo
      const head = write.head || c.branch || 'the current branch'
      const base = write.base || c.defaultBranch || 'the default branch'
      clauses.push(`open a ${write.isDraft ? 'draft ' : ''}PR${repo ? ` in ${short(repo)}` : ''}: ${head} → ${base}`)
      labels.push(write.isDraft ? 'Open draft PR' : 'Open PR')
      row('Repo', repo)
      row('Branch', `${head} → ${base}`)
      row('Title', write.title || (write.isFill ? 'from the commits' : '(none given)'))
      row('Reviewers', write.reviewers.join(', '))
      row('Labels', write.labels.join(', '))
      body =
        write.body ?? c.body ??
        (write.bodyFile ? `_(could not read ${write.bodyFile})_` : write.isFill ? '_(filled from the commits)_' : '')
      proposed ||= c.commits
    }

    if (write.kind === 'pr merge') {
      const repo = write.repo || c.repo
      const name = c.pr ? `PR #${c.pr.number}` : /^\d+$/.test(write.pr) ? `PR #${write.pr}` : write.pr ? `PR ${write.pr}` : "this branch's PR"
      clauses.push(`${write.isAuto ? 'auto-merge' : 'merge'} ${name}${repo ? ` in ${short(repo)}` : ''}${write.method ? ` (${write.method})` : ''}`)
      labels.push('Merge PR')
      row('Repo', repo)
      row('PR', c.pr ? `${name}: ${c.pr.title}` : name)
      if (c.pr) row('Branch', `${c.pr.head} → ${c.pr.base}`)
      row('Method', write.method || "the repo's default")
      if (write.isDeleteBranch) row('Then', 'deletes the branch')
    }
  })

  return {
    question: `${upperFirst(clauses.join(' and '))}?`,
    approve: labels.map((label, k) => (k ? lowerFirst(label) : label)).join(' and '),
    target: contexts.find(c => c.repo)?.repo ?? '',
    rows,
    body,
    meta: proposed || pushed,
    metaLabel: proposed ? 'Commits in this PR' : 'Commits not on the remote',
  }
}

export type Decision = { isApproved: true } | { isApproved: false; reason: string }

export const REJECT = 'Reject'

// Reads the dialog's answer: only the write's own approve label sends it.
// Anything typed under Other rejects and becomes the reason Claude reads.
export function decide(answer: string, approve: string): Decision {
  if (answer === approve) return { isApproved: true }
  if (answer === REJECT || answer.trim() === '') return { isApproved: false, reason: 'the user rejected it' }
  return { isApproved: false, reason: `the user said: ${answer}` }
}
