import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { classify, REJECT } from './gate'
import { transitionName } from './mcp'

const jira = (name: string, args: Record<string, unknown>) => classify({ tool: `mcp__atlassian__${name}`, cloudId: 'c', ...args })

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

  test('a new issue shows its summary, type and extra fields as rows', () => {
    const gate = jira('createJiraIssue', { projectKey: 'CE', issueTypeName: 'Task', summary: 'Do X', description: 'Body', additional_fields: { priority: { name: 'High' } } })
    expect(gate?.question).toBe('Create a Task in CE?')
    expect(gate?.rows).toEqual([['Summary', 'Do X'], ['Type', 'Task'], ['priority', 'High']])
    expect(gate?.body).toBe('Body')
    expect(gate?.meta).toBe('')
  })

  test('a link names both issues and the type, a worklog its time', () => {
    expect(jira('createIssueLink', { inwardIssue: 'CE-1', outwardIssue: 'CE-2', type: 'Blocks' })?.question).toBe('Link CE-1 and CE-2 as "Blocks"?')
    expect(jira('addWorklogToJiraIssue', { issueIdOrKey: 'CE-1', timeSpent: '2h' })?.question).toBe('Log 2h on CE-1?')
  })
})

const v2 = (name: string, args: Record<string, unknown>) => classify({ tool: `mcp__claude_ai_Atlassian_MCP__${name}`, cloudId: 'c', ...args })

describe('Jira v2', () => {
  test('a comment, and an edit of one', () => {
    expect(v2('addOrEditJiraIssueComment', { issueIdOrKey: 'CE-1', commentBody: '<p>Done.</p>', contentFormat: 'html' })).toMatchObject({
      action: 'Jira comment', question: 'Post a Jira comment on CE-1?', body: '<p>Done.</p>', meta: '',
    })
    expect(v2('addOrEditJiraIssueComment', { issueIdOrKey: 'CE-1', commentBody: 'x', commentId: '9' })?.question).toBe('Edit comment 9 on CE-1?')
  })

  test('a new issue reads issueType, assignee and priority', () => {
    const gate = v2('createJiraIssue', { projectKey: 'CE', issueType: 'Task', summary: 'Do X', assignee: 'u1', priority: 'High', labels: ['a'] })
    expect(gate?.question).toBe('Create a Task in CE?')
    expect(gate?.rows).toEqual([['Summary', 'Do X'], ['Type', 'Task'], ['Assignee', 'u1'], ['Priority', 'High'], ['Labels', 'a']])
    expect(gate?.meta).toBe('')
  })

  test('an edit lists fields and additional_fields', () => {
    const gate = v2('editJiraIssue', { issueIdOrKey: 'CE-1', fields: { summary: 'T' }, additional_fields: { 'Story Points': 3 } })
    expect(gate).toMatchObject({ question: 'Edit CE-1: summary, Story Points?', rows: [['summary', 'T'], ['Story Points', '3']], meta: '' })
  })

  test('a transition by id, by name, and to a sprint', () => {
    expect(v2('transitionJiraIssue', { issueIdOrKey: 'CE-1', transitionId: '141' })?.question).toBe('Move CE-1 (transition 141, name not found)?')
    expect(classify({ tool: 'mcp__claude_ai_Atlassian_MCP__transitionJiraIssue', issueIdOrKey: 'CE-1', transitionId: '141' }, { transitionName: 'PR Review' })?.question).toBe('Move CE-1 to PR Review?')
    expect(v2('transitionJiraIssue', { issueIdOrKey: 'CE-1', transitionName: 'Review' })?.question).toBe('Move CE-1 by transition "Review"?')
    expect(v2('transitionJiraIssue', { issueIdOrKey: 'CE-1', sprintId: 7 })?.question).toBe('Move CE-1 to sprint 7?')
  })

  test('executeWrite is gated by the operation it runs', () => {
    const run = (name: string, inputs: Record<string, unknown>) => v2('executeWrite', { name, inputs: { cloudId: 'c', ...inputs }, responseFields: ['id'] })
    expect(run('createJiraIssueLink', { inwardIssue: 'CE-1', outwardIssue: 'CE-2', linkType: 'Blocks' })).toMatchObject({
      action: 'Jira issue link', question: 'Link CE-1 and CE-2 as "Blocks"?', meta: '',
    })
    expect(run('addOrEditJiraIssueWorklog', { issueIdOrKey: 'CE-1', timeSpent: '1h', comment: 'pairing' })).toMatchObject({ question: 'Log 1h on CE-1?', body: 'pairing' })
    expect(run('createJiraIssueRemoteIssueLink', { issueIdOrKey: 'CE-1', url: 'https://x' })?.rows).toContainEqual(['URL', 'https://x'])
  })

  test('any other executeWrite or executeDestructive is gated as it is', () => {
    const gate = v2('executeWrite', { name: 'watchJiraIssue', inputs: { cloudId: 'c', issueIdOrKey: 'CE-1', action: 'watch' } })
    expect(gate).toMatchObject({ action: 'Atlassian write', question: 'Run watchJiraIssue on Atlassian?', approve: 'Run it', target: 'CE-1' })
    expect(gate?.rows).toEqual([['Operation', 'watchJiraIssue'], ['issueIdOrKey', 'CE-1'], ['action', 'watch']])

    const page = v2('executeWrite', { name: 'someConfluenceWrite', inputs: { pageId: '5', body: { format: 'html', value: '<p>Hi</p>' }, labels: ['a'] } })
    expect(page).toMatchObject({ body: '<p>Hi</p>', target: '5' })
    expect(JSON.parse(page?.meta ?? '{}')).toEqual({ labels: ['a'] })

    expect(v2('executeDestructive', { name: 'deleteJiraIssue', inputs: { issueIdOrKey: 'CE-1' } })).toMatchObject({
      action: 'destructive Atlassian operation', question: 'Run destructive deleteJiraIssue on Atlassian?', approve: 'Run destructive',
    })
    expect(v2('executeWrite', {})?.question).toBe('Run an unnamed operation on Atlassian?')
  })

  test('reads stay ungated', () => {
    expect(v2('executeRead', { name: 'listJiraIssueTransitions', inputs: { issueIdOrKey: 'CE-1' } })).toBeNull()
    expect(v2('getJiraIssue', { issueIdOrKey: 'CE-1' })).toBeNull()
    expect(v2('discover', { query: 'x' })).toBeNull()
  })
})

describe('transitionName', () => {
  test("reads Jira's answer or a bare list", () => {
    expect(transitionName(JSON.stringify({ transitions: [{ id: '31', name: 'Review', to: { name: 'PR Review' } }] }), '31')).toBe('PR Review')
    expect(transitionName(JSON.stringify([{ id: 41, name: 'Done' }]), '41')).toBe('Done')
    expect(transitionName(JSON.stringify({ data: { transitions: [{ id: '141', name: 'PR Review', to: { name: 'PR Review' } }] } }), '141')).toBe('PR Review')
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

  test('v2 names the status through executeRead', async ($, on) => {
    const asked: string[] = []
    const reads: string[] = []
    engine(on, true, asked, reads)
    on('tool.call', { tool: /^mcp__claude_ai_Atlassian_MCP__executeRead$/ }, ($, e) => {
      reads.push(String((e as unknown as { name: string }).name))
      return { result: 'r', text: JSON.stringify({ data: { transitions: [{ id: '141', to: { name: 'PR Review' } }] } }) } as never
    })
    await $.tool.call({ tool: 'mcp__claude_ai_Atlassian_MCP__transitionJiraIssue', cloudId: 'c', issueIdOrKey: 'CE-1', transitionId: '141' } as never)
    expect(reads).toEqual(['listJiraIssueTransitions'])
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
