import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { classify, REJECT } from './gate'
import { transitionName } from './mcp'

const jira = (name: string, args: Record<string, unknown>) => classify({ tool: `mcp__atlassian__${name}`, cloudId: 'c', ...args })
const lucid = (name: string, args: Record<string, unknown>) => classify({ tool: `mcp__claude_ai_Lucid__${name}`, ...args })

describe('Jira', () => {
  test('a comment, and an edit of one', () => {
    expect(jira('addCommentToJiraIssue', { issueIdOrKey: 'CE-1', commentBody: 'Done.', contentFormat: 'markdown' })).toMatchObject({
      question: 'Post a Jira comment on CE-1?', approve: 'Post comment', body: 'Done.', meta: '',
    })
    expect(jira('addCommentToJiraIssue', { issueIdOrKey: 'CE-1', commentBody: 'x', commentId: '9' })?.question).toBe('Edit comment 9 on CE-1?')
  })

  test('a transition names its status once looked up', () => {
    const args = { issueIdOrKey: 'CE-1', transition: { id: '31' } }
    expect(jira('transitionJiraIssue', args)?.question).toBe('Move CE-1 (transition 31, name not found)?')
    expect(classify({ tool: 'mcp__atlassian__transitionJiraIssue', ...args }, { transitionName: 'PR Review' })).toMatchObject({
      question: 'Move CE-1 to PR Review?', approve: 'Move it', rows: [['Transition', 'PR Review (id 31)']],
    })
  })

  test('an edit lists the fields it sets as rows', () => {
    const gate = jira('editJiraIssue', {
      issueIdOrKey: 'CE-1',
      fields: { summary: 'New title', labels: ['a', 'b'], assignee: { accountId: 'u1' }, description: '## Why' },
    })
    expect(gate).toMatchObject({
      question: 'Edit CE-1: summary, labels, assignee, description?',
      rows: [['summary', 'New title'], ['labels', 'a, b'], ['assignee', 'u1']],
      body: '## Why',
      meta: '',
    })
  })

  test('a new issue shows its summary and type, extra fields as JSON', () => {
    const gate = jira('createJiraIssue', { projectKey: 'CE', issueTypeName: 'Task', summary: 'Do X', description: 'Body', additional_fields: { priority: { name: 'High' } } })
    expect(gate?.question).toBe('Create a Task in CE?')
    expect(gate?.rows).toEqual([['Summary', 'Do X'], ['Type', 'Task']])
    expect(gate?.body).toBe('Body')
    expect(JSON.parse(gate?.meta ?? '{}')).toEqual({ additional_fields: { priority: { name: 'High' } } })
  })

  test('a link names both issues and the type, a worklog its time', () => {
    expect(jira('createIssueLink', { inwardIssue: 'CE-1', outwardIssue: 'CE-2', type: 'Blocks' })?.question).toBe('Link CE-1 and CE-2 as "Blocks"?')
    expect(jira('addWorklogToJiraIssue', { issueIdOrKey: 'CE-1', timeSpent: '2h' })?.question).toBe('Log 2h on CE-1?')
  })
})

describe('Confluence', () => {
  test('pages and comments', () => {
    expect(jira('createConfluencePage', { spaceId: '42', title: 'Runbook', body: 'b', status: 'draft' })?.question).toBe('Create a draft Confluence page "Runbook" in space 42?')
    expect(jira('updateConfluencePage', { pageId: '7', title: 'Runbook', body: 'b', versionMessage: 'typo' })?.rows).toEqual([['Title', 'Runbook'], ['Note', 'typo']])
    expect(jira('createConfluenceFooterComment', { parentCommentId: '5', body: 'b' })?.question).toBe('Reply to Confluence comment 5?')
    expect(jira('createConfluenceInlineComment', { pageId: '7', body: 'b', inlineCommentProperties: { textSelection: 'foo' } })?.rows).toEqual([['On text', '"foo"']])
  })
})

describe('Lucid', () => {
  test('reads document_id as the target', () => {
    expect(lucid('post_document_thread_comment', { document_id: 'd1', thread_id: 't1', content: 'hi' })).toMatchObject({
      question: 'Post a Lucid comment on document d1?', target: 'd1', body: 'hi',
    })
  })

  test('says who a share reaches', () => {
    expect(lucid('share_document_with_collaborators', { document_id: 'd1', emails: ['a@x.com'], role: 'editor' })?.question).toBe('Share Lucid document d1 with a@x.com as editor?')
    expect(lucid('share_document_with_collaborators', { document_id: 'd1', emails: ['a@x.com', 'b@x.com'] })?.question).toBe('Share Lucid document d1 with 2 people?')
    expect(lucid('lucid_create_document_share_link', { document_id: 'd1', role: 'viewer', allow_anonymous: true })?.question).toBe('Create a viewer share link for Lucid document d1 that anyone can open?')
  })
})

describe('transitionName', () => {
  test("reads Jira's answer or a bare list", () => {
    expect(transitionName(JSON.stringify({ transitions: [{ id: '31', name: 'Review', to: { name: 'PR Review' } }] }), '31')).toBe('PR Review')
    expect(transitionName(JSON.stringify([{ id: 41, name: 'Done' }]), '41')).toBe('Done')
    expect(transitionName('not json', '31')).toBe('')
  })
})

// The engine beneath: the transitions read is `allowed` or asked, and the
// dialog records its question and rejects.
function engine(on: On, allowed: boolean, asked: string[], reads: string[]) {
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.log', () => ({ value: undefined }) as never)
  // The 8-second limit on the read never runs out here.
  on('clock.sleep', () => new Promise(() => undefined) as never)
  on('tool.check', () => ({ decision: allowed ? 'allow' : 'ask' }) as never)
  on('tool.call', { tool: 'mcp__atlassian__getTransitionsForJiraIssue' }, () => {
    reads.push('transitions')
    return { result: 'r', text: JSON.stringify({ transitions: [{ id: '31', to: { name: 'PR Review' } }] }) } as never
  })
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = (e as unknown as { questions: { question: string }[] }).questions[0]?.question ?? ''
    asked.push(question)
    return { result: { questions: [], answers: { [question]: REJECT } } } as never
  })
}

describe('transition gate', () => {
  const call = { tool: 'mcp__atlassian__transitionJiraIssue', cloudId: 'c', issueIdOrKey: 'CE-1', transition: { id: '31' } } as never

  test('names the status when the read is allowed', async ($, on) => {
    const asked: string[] = []
    const reads: string[] = []
    engine(on, true, asked, reads)
    await $.tool.call(call)
    expect(asked).toEqual(['Move CE-1 to PR Review?'])
  })

  test('never raises a second dialog for the read', async ($, on) => {
    const asked: string[] = []
    const reads: string[] = []
    engine(on, false, asked, reads)
    await $.tool.call(call)
    expect(reads).toEqual([])
    expect(asked).toEqual(['Move CE-1 (transition 31, name not found)?'])
  })
})
