import type { Pending } from '../types'

// One-way writes to ticketing and diagram systems, by tool name. The server
// part of the name varies (atlassian, claude_ai_Atlassian_Rovo, ...), so it
// is matched loosely and the tool part exactly.
const ATLASSIAN = new Map(Object.entries({
  addCommentToJiraIssue: 'Jira comment',
  addWorklogToJiraIssue: 'Jira worklog',
  createJiraIssue: 'new Jira issue',
  editJiraIssue: 'Jira edit',
  transitionJiraIssue: 'Jira transition',
  createIssueLink: 'Jira issue link',
  createConfluencePage: 'new Confluence page',
  updateConfluencePage: 'Confluence page update',
  createConfluenceFooterComment: 'Confluence comment',
  createConfluenceInlineComment: 'Confluence inline comment',
}))

const LUCID = new Map(Object.entries({
  post_document_thread_comment: 'Lucid comment',
  share_document_with_collaborators: 'Lucid share',
  lucid_create_document_share_link: 'Lucid share link',
  lucid_update_document: 'Lucid document update',
}))

const PUSH = /\bgit\b(\s+-[Cc]\s+\S+)*\s+push\b/
const PR = /\bgh\s+pr\s+(create|merge)\b/

// Keys the engine adds to a tool call's input, never the tool's own.
const RESERVED = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta', 'consent', 'cloudId'])
const TARGET_KEYS = ['issueIdOrKey', 'issueKey', 'pageId', 'parentId', 'spaceId', 'documentId', 'projectKey']
const BODY_KEYS = ['commentBody', 'body', 'content', 'description', 'text', 'comment', 'message']

function mcpAction(tool: string) {
  const match = /^mcp__(.+)__([^_].*)$/.exec(tool)
  if (!match) return null
  const [, server = '', name = ''] = match
  if (/atlassian|rovo/i.test(server)) return ATLASSIAN.get(name) ?? null
  if (/lucid/i.test(server)) return LUCID.get(name) ?? null
  return null
}

const show = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value, null, 2))

// The write this call would make, or null when the call is not gated.
export function classify(e: { tool: string; [key: string]: unknown }): Pending | null {
  if (e.tool === 'Bash') {
    const command = typeof e.command === 'string' ? e.command : ''
    const pr = PR.exec(command)
    const action = pr ? `gh pr ${pr[1]}` : PUSH.test(command) ? 'git push' : null
    if (!action) return null
    return { tool: e.tool, action, target: '', body: command, meta: '' }
  }

  const action = mcpAction(e.tool)
  if (!action) return null

  const args = Object.fromEntries(Object.entries(e).filter(([key]) => !RESERVED.has(key)))
  const targetKey = TARGET_KEYS.find(key => args[key] !== undefined)
  const bodyKey = BODY_KEYS.find(key => args[key] !== undefined)
  const rest = Object.fromEntries(Object.entries(args).filter(([key]) => key !== bodyKey))

  return {
    tool: e.tool,
    action,
    target: targetKey ? String(args[targetKey]) : '',
    body: bodyKey ? show(args[bodyKey]) : '',
    meta: Object.keys(rest).length ? JSON.stringify(rest, null, 2) : '',
  }
}

export type Decision = { isApproved: true } | { isApproved: false; reason: string }

export const APPROVE = 'Post it'
export const REJECT = 'Reject'

// Reads the dialog's answer: only an explicit "Post it" approves. Anything
// typed under Other rejects and becomes the reason Claude reads.
export function decide(answer: string): Decision {
  if (answer === APPROVE) return { isApproved: true }
  if (answer === REJECT || answer.trim() === '') return { isApproved: false, reason: 'the user rejected it' }
  return { isApproved: false, reason: `the user said: ${answer}` }
}
