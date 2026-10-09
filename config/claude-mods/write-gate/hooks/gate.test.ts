import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { APPROVE, classify, decide, REJECT } from './gate'

const COMMENT = 'mcp__atlassian__addCommentToJiraIssue'

describe('classify', () => {
  test('gates Atlassian writes under any server spelling', () => {
    for (const tool of [COMMENT, 'mcp__claude_ai_Atlassian_Rovo__addCommentToJiraIssue']) {
      const gate = classify({ tool, tool_use_id: 't', cloudId: 'c', issueIdOrKey: 'CE-1234', commentBody: 'Done.' })
      expect(gate).toEqual({ tool, action: 'Jira comment', target: 'CE-1234', body: 'Done.', meta: expect.any(String) })
      expect(gate?.meta).not.toContain('cloudId')
    }
  })

  test('gates Lucid writes', () => {
    expect(classify({ tool: 'mcp__claude_ai_Lucid__post_document_thread_comment', documentId: 'd1', text: 'hi' })?.action).toBe('Lucid comment')
  })

  test('lets reads through', () => {
    expect(classify({ tool: 'mcp__atlassian__getJiraIssue', issueIdOrKey: 'CE-1' })).toBeNull()
    expect(classify({ tool: 'mcp__claude_ai_Lucid__lucid_search_document' })).toBeNull()
    expect(classify({ tool: 'Read', file_path: '/x' })).toBeNull()
  })

  test('gates git push and gh pr create/merge, not other git', () => {
    expect(classify({ tool: 'Bash', command: 'git push -u origin feat/x' })?.action).toBe('git push')
    expect(classify({ tool: 'Bash', command: 'git -C ~/Dev/repo push' })?.action).toBe('git push')
    expect(classify({ tool: 'Bash', command: 'gh pr create --draft --title t' })?.action).toBe('gh pr create')
    expect(classify({ tool: 'Bash', command: 'gh pr merge 12 --squash' })?.action).toBe('gh pr merge')
    expect(classify({ tool: 'Bash', command: 'git status && gh pr view' })).toBeNull()
    expect(classify({ tool: 'Bash', command: 'git pull --rebase' })).toBeNull()
  })
})

describe('decide', () => {
  test('only an explicit approval passes', () => {
    expect(decide(APPROVE)).toEqual({ isApproved: true })
    expect(decide(REJECT)).toEqual({ isApproved: false, reason: 'the user rejected it' })
    expect(decide('').isApproved).toBe(false)
  })
  test('text typed under Other becomes the reason', () => {
    expect(decide('reword the second line')).toEqual({ isApproved: false, reason: 'the user said: reword the second line' })
  })
})

// Stands in for the engine: the dialog answers `answer`, the Jira tool posts.
function engine(on: On, answer: string, posted: string[]) {
  on('process.run', () => ({ value: { exitCode: 0, stdout: '', stderr: '' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.log', () => ({ value: undefined }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = (e as unknown as { questions: { question: string }[] }).questions[0]?.question ?? ''
    return { result: { questions: [], answers: { [question]: answer } } } as never
  })
  on('tool.call', { tool: COMMENT }, () => {
    posted.push('comment')
    return { result: 'posted' } as never
  })
}

describe('gate', () => {
  const call = { tool: COMMENT, issueIdOrKey: 'CE-1234', commentBody: 'Merged.' } as never

  test('a rejected comment is denied and never reaches the tool', async ($, on) => {
    const posted: string[] = []
    engine(on, REJECT, posted)
    const ran = await $.tool.call(call)
    expect(posted).toEqual([])
    expect(ran.deny).toContain('the user rejected it')
  })

  test('an approved comment is sent unchanged', async ($, on) => {
    const posted: string[] = []
    engine(on, APPROVE, posted)
    await $.tool.call(call)
    expect(posted).toEqual(['comment'])
  })
})
