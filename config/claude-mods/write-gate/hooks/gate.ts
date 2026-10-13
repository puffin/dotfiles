import type { Pending, Row } from '../types'
import { type Lookup, mcpWrite } from './mcp'
import { parseShell, type Write } from './shell'

const READY = /\bgh\s+pr\s+ready\b/

// Keys the engine adds to a tool call's input, or that only set its format;
// never shown as the write's own arguments.
const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent', 'cloudId', 'contentFormat', 'responseContentFormat', 'actionSource'])

// The write this call would make, or null when the call is not gated. A shell
// command gets a plain question here; describeShell fills it in once the
// repository has been looked at. A command that only runs `gh pr ready --undo`
// passes; one the parser cannot follow is gated.
export function classify(e: { tool: string; [key: string]: unknown }, lookup: Lookup = {}): Pending | null {
  if (e.tool === 'Bash') {
    const command = typeof e.command === 'string' ? e.command : ''
    if (!READY.test(command)) return null
    const writes = parseShell(command)
    if (writes.length && writes.every(write => write.isUndo)) return null
    const action = 'gh pr ready'
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
  repo: string
  pr: { number: number; title: string; head: string; base: string; isDraft: boolean } | null
}

export const NO_CONTEXT: Context = { dir: null, repo: '', pr: null }

const short = (repo: string) => repo.split('/').pop() ?? repo
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const tilde = (path: string, home: string) => (home && path.startsWith(home) ? `~${path.slice(home.length)}` : path)

type Described = Pick<Pending, 'question' | 'approve' | 'target' | 'rows' | 'body' | 'meta' | 'metaLabel'>

// The question, option label and summary rows for the writes in a command,
// null when there are none to describe.
export function describeShell(writes: Write[], contexts: Context[], home: string): Described | null {
  const marked = writes.flatMap((write, k) => (write.isUndo ? [] : [{ write, c: contexts[k] ?? NO_CONTEXT }]))
  if (!marked.length) return null
  const clauses: string[] = []
  const rows: Row[] = []
  const row = (label: string, value: string) => {
    if (value && !rows.some(([l, v]) => l === label && v === value)) rows.push([label, value])
  }

  for (const { write, c } of marked) {
    const repo = write.repo || c.repo
    const name = c.pr ? `PR #${c.pr.number}` : /^\d+$/.test(write.pr) ? `PR #${write.pr}` : write.pr ? `PR ${write.pr}` : "this branch's PR"
    clauses.push(`mark ${name}${repo ? ` in ${short(repo)}` : ''} ready for review`)
    row('Folder', c.dir === null ? 'set by a variable, not checked' : tilde(c.dir, home))
    row('Repo', repo)
    row('PR', c.pr ? `${name}: ${c.pr.title}` : name)
    if (c.pr) row('Branch', `${c.pr.head} → ${c.pr.base}`)
    if (c.pr && !c.pr.isDraft) row('Note', 'already ready for review')
  }

  return {
    question: `${upperFirst(clauses.join(' and '))}?`,
    approve: 'Mark ready',
    target: marked.map(({ write, c }) => write.repo || c.repo).find(Boolean) ?? '',
    rows,
    body: '',
    meta: '',
    metaLabel: '',
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
