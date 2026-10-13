import type { Row } from '../types'

// Says what a Jira write will do: a question naming its target, the fields
// that matter as rows, and the text it posts. The keys a describer reads are
// listed in `used`; the rest are shown as JSON.

type Args = Record<string, unknown>

// What the gate looked up before asking: the status a transition moves to.
export type Lookup = { transitionName?: string }

type Described = { question: string; target: string; rows: Row[]; body: string; used: string[] }

export type McpWrite = {
  // Short name for the log and the deny message.
  action: string
  // The label of the option that sends it.
  approve: string
  describe: (args: Args, lookup: Lookup) => Described
}

const text = (value: unknown): string => {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(text).join(', ')
  if (typeof value === 'object') {
    // A Jira field value: a user, option, version or issue reads by its name.
    const named = value as Record<string, unknown>
    for (const key of ['name', 'value', 'key', 'displayName', 'accountId', 'id']) {
      if (typeof named[key] === 'string' || typeof named[key] === 'number') return String(named[key])
    }
  }
  const json = JSON.stringify(value)
  return json.length > 200 ? `${json.slice(0, 199)}…` : json
}

// The text a comment or description will carry, ADF shown as JSON.
const body = (value: unknown) => (typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value, null, 2))

// Rows for the fields a Jira edit or transition sets; a description is the body.
function fieldRows(fields: unknown): { rows: Row[]; body: string } {
  if (!fields || typeof fields !== 'object') return { rows: [], body: '' }
  const entries = Object.entries(fields as Args)
  return {
    rows: entries.filter(([name]) => name !== 'description').map(([name, value]): Row => [name, text(value) || '(cleared)']),
    body: body((fields as Args).description),
  }
}

const write = (action: string, approve: string, describe: McpWrite['describe']): McpWrite => ({ action, approve, describe })

export const JIRA = new Map(Object.entries({
  addCommentToJiraIssue: write('Jira comment', 'Post comment', a => ({
    question: a.commentId ? `Edit comment ${text(a.commentId)} on ${text(a.issueIdOrKey)}?` : `Post a Jira comment on ${text(a.issueIdOrKey)}?`,
    target: text(a.issueIdOrKey),
    rows: a.commentVisibility ? [['Visible to', text(a.commentVisibility)]] : [],
    body: body(a.commentBody),
    used: ['issueIdOrKey', 'commentBody', 'commentId', 'commentVisibility'],
  })),

  addWorklogToJiraIssue: write('Jira worklog', 'Log work', a => ({
    question: a.worklogId
      ? `Change worklog ${text(a.worklogId)} on ${text(a.issueIdOrKey)} to ${text(a.timeSpent)}?`
      : `Log ${text(a.timeSpent)} on ${text(a.issueIdOrKey)}?`,
    target: text(a.issueIdOrKey),
    rows: [['Started', text(a.started) || 'now'], ['Visible to', text(a.visibility)]],
    body: body(a.commentBody),
    used: ['issueIdOrKey', 'timeSpent', 'worklogId', 'started', 'visibility', 'commentBody'],
  })),

  createJiraIssue: write('new Jira issue', 'Create issue', a => ({
    question: `Create a ${text(a.issueTypeName) || 'Jira issue'} in ${text(a.projectKey)}?`,
    target: text(a.projectKey),
    rows: [
      ['Summary', text(a.summary)],
      ['Type', text(a.issueTypeName)],
      ['Parent', text(a.parent)],
      ['Assignee', text(a.assignee_account_id)],
      ['Transition', text(a.transition)],
    ],
    body: body(a.description),
    used: ['projectKey', 'issueTypeName', 'summary', 'description', 'parent', 'assignee_account_id', 'transition'],
  })),

  editJiraIssue: write('Jira edit', 'Save edit', a => {
    const fields = fieldRows(a.fields)
    const names = Object.keys((a.fields as Args | undefined) ?? {})
    return {
      question: `Edit ${text(a.issueIdOrKey)}${names.length ? `: ${names.join(', ')}` : ''}?`,
      target: text(a.issueIdOrKey),
      rows: fields.rows,
      body: fields.body,
      used: ['issueIdOrKey', 'fields'],
    }
  }),

  transitionJiraIssue: write('Jira transition', 'Move it', (a, lookup) => {
    const fields = fieldRows(a.fields)
    const id = text(a.transition)
    return {
      question: lookup.transitionName
        ? `Move ${text(a.issueIdOrKey)} to ${lookup.transitionName}?`
        : `Move ${text(a.issueIdOrKey)} (transition ${id}, name not found)?`,
      target: text(a.issueIdOrKey),
      rows: [['Transition', lookup.transitionName ? `${lookup.transitionName} (id ${id})` : `id ${id}`], ...fields.rows],
      body: fields.body,
      used: ['issueIdOrKey', 'transition', 'fields'],
    }
  }),

  // Which side reads "blocks" and which "is blocked by" is the link type's,
  // so the question names both issues and the type without a direction.
  createIssueLink: write('Jira issue link', 'Link them', a => ({
    question: `Link ${text(a.inwardIssue)} and ${text(a.outwardIssue)}${a.type ? ` as "${text(a.type)}"` : ''}?`,
    target: text(a.inwardIssue),
    rows: [['Inward', text(a.inwardIssue)], ['Outward', text(a.outwardIssue)], ['Type', text(a.type)]],
    body: body(a.comment),
    used: ['inwardIssue', 'outwardIssue', 'type', 'comment'],
  })),
}))

// The write a tool name makes, or null for a tool that is not gated. The
// server part varies (atlassian, claude_ai_Atlassian_Rovo, ...), so it is
// matched loosely and the tool part exactly.
export function mcpWrite(tool: string): McpWrite | null {
  const match = /^mcp__(.+)__([^_].*)$/.exec(tool)
  if (!match) return null
  const [, server = '', name = ''] = match
  return /atlassian|rovo/i.test(server) ? (JIRA.get(name) ?? null) : null
}

// The transition's status name in a getTransitionsForJiraIssue answer: Jira's
// JSON, `{ transitions: [{ id, name, to: { name } }] }`, or that list alone.
export function transitionName(answer: string, id: string): string {
  try {
    const parsed = JSON.parse(answer) as unknown
    const list = Array.isArray(parsed) ? parsed : ((parsed as { transitions?: unknown[] } | null)?.transitions ?? [])
    const found = (list as { id?: unknown; name?: unknown; to?: { name?: unknown } }[]).find(t => String(t.id) === id)
    const name = found?.to?.name ?? found?.name
    return typeof name === 'string' ? name : ''
  } catch {
    return ''
  }
}
