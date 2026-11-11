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

// v1 and v2 of the Atlassian server name some arguments differently; each
// describer reads both spellings.

const comment = write('Jira comment', 'Post comment', a => ({
  question: a.commentId ? `Edit comment ${text(a.commentId)} on ${text(a.issueIdOrKey)}?` : `Post a Jira comment on ${text(a.issueIdOrKey)}?`,
  target: text(a.issueIdOrKey),
  rows: [['Visible to', text(a.commentVisibility)], ['JSM type', text(a.jsmCommentType)]],
  body: body(a.commentBody),
  used: ['issueIdOrKey', 'commentBody', 'commentId', 'commentVisibility', 'jsmCommentType'],
}))

const worklog = write('Jira worklog', 'Log work', a => ({
  question: a.worklogId
    ? `Change worklog ${text(a.worklogId)} on ${text(a.issueIdOrKey)} to ${text(a.timeSpent)}?`
    : `Log ${text(a.timeSpent)} on ${text(a.issueIdOrKey)}?`,
  target: text(a.issueIdOrKey),
  rows: [['Started', text(a.started) || 'now'], ['Visible to', text(a.visibility)]],
  body: body(a.commentBody ?? a.comment),
  used: ['issueIdOrKey', 'timeSpent', 'worklogId', 'started', 'visibility', 'commentBody', 'comment'],
}))

// Which side reads "blocks" and which "is blocked by" is the link type's,
// so the question names both issues and the type without a direction.
const link = write('Jira issue link', 'Link them', a => {
  const type = text(a.linkType ?? a.type)
  return {
    question: `Link ${text(a.inwardIssue)} and ${text(a.outwardIssue)}${type ? ` as "${type}"` : ''}?`,
    target: text(a.inwardIssue),
    rows: [['Inward', text(a.inwardIssue)], ['Outward', text(a.outwardIssue)], ['Type', type]],
    body: body(a.comment),
    used: ['inwardIssue', 'outwardIssue', 'type', 'linkType', 'comment'],
  }
})

export const JIRA = new Map(Object.entries({
  addCommentToJiraIssue: comment,
  addOrEditJiraIssueComment: comment,
  addWorklogToJiraIssue: worklog,
  createIssueLink: link,

  createJiraIssue: write('new Jira issue', 'Create issue', a => {
    const type = text(a.issueTypeName ?? a.issueType)
    const extra = fieldRows(a.additional_fields)
    return {
      question: `Create a ${type || 'Jira issue'} in ${text(a.projectKey)}?`,
      target: text(a.projectKey),
      rows: [
        ['Summary', text(a.summary)],
        ['Type', type],
        ['Parent', text(a.parent)],
        ['Assignee', text(a.assignee_account_id ?? a.assignee)],
        ['Priority', text(a.priority)],
        ['Labels', text(a.labels)],
        ['Sprint', text(a.assignToSprint)],
        ['Transition', text(a.transition)],
        ...extra.rows,
      ],
      body: body(a.description) || extra.body,
      used: ['projectKey', 'issueTypeName', 'issueType', 'summary', 'description', 'parent', 'assignee_account_id', 'assignee', 'priority', 'labels', 'assignToSprint', 'transition', 'additional_fields'],
    }
  }),

  editJiraIssue: write('Jira edit', 'Save edit', a => {
    const fields = fieldRows(a.fields)
    const extra = fieldRows(a.additional_fields)
    const names = [...Object.keys((a.fields as Args | undefined) ?? {}), ...Object.keys((a.additional_fields as Args | undefined) ?? {})]
    return {
      question: `Edit ${text(a.issueIdOrKey)}${names.length ? `: ${names.join(', ')}` : ''}?`,
      target: text(a.issueIdOrKey),
      rows: [...fields.rows, ...extra.rows, ['Rank before', text(a.rankBeforeIssue)], ['Rank after', text(a.rankAfterIssue)]],
      body: fields.body || extra.body,
      used: ['issueIdOrKey', 'fields', 'additional_fields', 'rankBeforeIssue', 'rankAfterIssue'],
    }
  }),

  // v1 passes `transition: { id }`; v2 passes `transitionId` or the
  // transition's own `transitionName`, and can also move it to a sprint.
  transitionJiraIssue: write('Jira transition', 'Move it', (a, lookup) => {
    const fields = fieldRows(a.fields)
    const id = transitionId(a)
    const own = text(a.transitionName)
    const issue = text(a.issueIdOrKey)
    const sprint = a.sprintId !== undefined ? `sprint ${text(a.sprintId)}` : a.assignToBacklog ? 'the backlog' : ''
    const question = lookup.transitionName
      ? `Move ${issue} to ${lookup.transitionName}?`
      : own
        ? `Move ${issue} by transition "${own}"?`
        : id
          ? `Move ${issue} (transition ${id}, name not found)?`
          : `Move ${issue} to ${sprint || 'an unnamed place'}?`
    const transition = lookup.transitionName ? `${lookup.transitionName} (id ${id})` : own ? own : id ? `id ${id}` : ''
    return {
      question,
      target: issue,
      rows: [['Transition', transition], ['Sprint', sprint], ...fields.rows],
      body: fields.body,
      used: ['issueIdOrKey', 'transition', 'transitionId', 'transitionName', 'sprintId', 'assignToBacklog', 'fields'],
    }
  }),
}))

// The transition id a call names, '' when it names one by name or none.
export function transitionId(a: Args): string {
  return text(a.transitionId) || text((a.transition as { id?: unknown } | undefined)?.id)
}

// Operations v2 runs through executeWrite, by the operation's name.
const OPERATIONS = new Map(Object.entries({
  createJiraIssueLink: link,
  addOrEditJiraIssueWorklog: worklog,
  createJiraIssueRemoteIssueLink: write('Jira web link', 'Add link', a => ({
    question: `Add a web link to ${text(a.issueIdOrKey)}?`,
    target: text(a.issueIdOrKey),
    rows: [['URL', text(a.url)], ['Title', text(a.title)], ['Relation', text(a.relationship)]],
    body: body(a.summary),
    used: ['issueIdOrKey', 'url', 'title', 'relationship', 'summary'],
  })),
}))

// The text a generic operation carries: a Jira body, or Confluence's
// `{ format, value }`.
const payload = (a: Args) => {
  for (const key of ['commentBody', 'comment', 'body', 'description']) {
    const value = a[key]
    if (value && typeof value === 'object' && typeof (value as Args).value === 'string') return { key, text: (value as Args).value as string }
    if (value !== undefined) return { key, text: body(value) }
  }
  return { key: '', text: '' }
}

// Any other operation run through executeWrite or executeDestructive: its
// name and inputs as they are.
function generic(op: string, isDestructive: boolean): McpWrite {
  const kind = isDestructive ? 'destructive Atlassian operation' : 'Atlassian write'
  return write(kind, isDestructive ? 'Run destructive' : 'Run it', a => {
    const { key, text: shown } = payload(a)
    const scalars = Object.entries(a).filter(([name, value]) => name !== key && (value === null || typeof value !== 'object'))
    return {
      question: `${isDestructive ? 'Run destructive' : 'Run'} ${op || 'an unnamed operation'} on Atlassian?`,
      target: text(a.issueIdOrKey ?? a.contentId ?? a.pageId ?? a.projectKey),
      rows: [['Operation', op], ...scalars.map(([name, value]): Row => [name, text(value)])],
      body: shown,
      used: [key, ...scalars.map(([name]) => name)],
    }
  })
}

const EXECUTE = new Set(['executeWrite', 'executeDestructive'])

// The write a tool call makes and the arguments that describe it, or null
// for a call that is not gated. The server part varies (atlassian,
// claude_ai_Atlassian_MCP, ...), so it is matched loosely and the tool part
// exactly. v2's generic runners are gated by the operation they run, every
// one of them, so nothing reaches Atlassian through them unasked.
export function mcpWrite(tool: string, args: Args = {}): { write: McpWrite; args: Args } | null {
  const match = /^mcp__(.+)__([^_].*)$/.exec(tool)
  if (!match) return null
  const [, server = '', name = ''] = match
  if (!/atlassian|rovo/i.test(server)) return null
  if (EXECUTE.has(name)) {
    const op = text(args.name)
    const inputs = args.inputs && typeof args.inputs === 'object' ? (args.inputs as Args) : {}
    const known = name === 'executeWrite' ? OPERATIONS.get(op) : undefined
    return { write: known ?? generic(op, name === 'executeDestructive'), args: inputs }
  }
  const found = JIRA.get(name)
  return found ? { write: found, args } : null
}

// The transition's status name in a transitions answer: Jira's JSON,
// `{ transitions: [{ id, name, to: { name } }] }`, v2's `{ data: { transitions } }`,
// or that list alone.
export function transitionName(answer: string, id: string): string {
  try {
    const parsed = JSON.parse(answer) as unknown
    const root = (parsed as { data?: unknown } | null)?.data ?? parsed
    const list = Array.isArray(root) ? root : ((root as { transitions?: unknown[] } | null)?.transitions ?? [])
    const found = (list as { id?: unknown; name?: unknown; to?: { name?: unknown } }[]).find(t => String(t.id) === id)
    const name = found?.to?.name ?? found?.name
    return typeof name === 'string' ? name : ''
  } catch {
    return ''
  }
}
