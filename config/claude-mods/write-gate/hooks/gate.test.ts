import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { classify, type Context, decide, describeShell, NO_CONTEXT, REJECT } from './gate'
import { parseShell } from './shell'

const COMMENT = 'mcp__atlassian__addCommentToJiraIssue'

describe('classify', () => {
  test('gates Jira writes under any server spelling', () => {
    for (const tool of [COMMENT, 'mcp__claude_ai_Atlassian_Rovo__addCommentToJiraIssue']) {
      const gate = classify({ tool, tool_use_id: 't', cloudId: 'c', issueIdOrKey: 'CE-1234', commentBody: 'Done.' })
      expect(gate).toMatchObject({ tool, action: 'Jira comment', question: 'Post a Jira comment on CE-1234?', approve: 'Post comment', target: 'CE-1234', body: 'Done.' })
      expect(gate?.meta).not.toContain('cloudId')
    }
  })

  test('lets reads, Confluence and Lucid through', () => {
    expect(classify({ tool: 'mcp__atlassian__getJiraIssue', issueIdOrKey: 'CE-1' })).toBeNull()
    expect(classify({ tool: 'mcp__atlassian__createConfluencePage', spaceId: '42', title: 'T' })).toBeNull()
    expect(classify({ tool: 'mcp__claude_ai_Lucid__post_document_thread_comment', document_id: 'd1' })).toBeNull()
    expect(classify({ tool: 'Read', file_path: '/x' })).toBeNull()
  })

  test('gates gh pr ready, not --undo or other git and gh', () => {
    expect(classify({ tool: 'Bash', command: 'gh pr ready 12' })?.action).toBe('gh pr ready')
    expect(classify({ tool: 'Bash', command: `bash -c 'gh pr ready'` })?.action).toBe('gh pr ready')
    expect(classify({ tool: 'Bash', command: 'gh pr ready 12 --undo' })).toBeNull()
    expect(classify({ tool: 'Bash', command: 'git push -u origin feat/x && gh pr create --draft --title t' })).toBeNull()
    expect(classify({ tool: 'Bash', command: 'gh pr merge 12 --squash' })).toBeNull()
  })
})

describe('describeShell', () => {
  const at = (c: Partial<Context>): Context => ({ ...NO_CONTEXT, dir: '/h/Dev/tools', ...c })
  const pr = { number: 271, title: 'fix(runwatch): detect indirect runs', head: 'fix/x', base: 'main', isDraft: true }

  test('names the PR, its repo and branch', () => {
    const writes = parseShell('cd ~/Dev/tools && gh pr ready 271')
    expect(describeShell(writes, [at({ repo: 'giant-eagle/GE.CloudOps.Platform.Tools', pr })], '/h')).toEqual({
      question: 'Mark PR #271 in GE.CloudOps.Platform.Tools ready for review?',
      approve: 'Mark ready',
      target: 'giant-eagle/GE.CloudOps.Platform.Tools',
      rows: [
        ['Folder', '~/Dev/tools'],
        ['Repo', 'giant-eagle/GE.CloudOps.Platform.Tools'],
        ['PR', 'PR #271: fix(runwatch): detect indirect runs'],
        ['Branch', 'fix/x → main'],
      ],
      body: '',
      meta: '',
      metaLabel: '',
    })
  })

  test('says so when the PR is already ready', () => {
    const described = describeShell(parseShell('gh pr ready'), [at({ pr: { ...pr, isDraft: false } })], '/h')
    expect(described?.rows).toContainEqual(['Note', 'already ready for review'])
  })

  test('falls back to what the command gives', () => {
    const described = describeShell(parseShell('cd "$R" && gh pr ready'), [NO_CONTEXT], '/h')
    expect(described?.question).toBe("Mark this branch's PR ready for review?")
    expect(described?.rows[0]).toEqual(['Folder', 'set by a variable, not checked'])
    expect(describeShell(parseShell('gh pr ready -R o/r 12'), [NO_CONTEXT], '/h')?.question).toBe('Mark PR #12 in r ready for review?')
  })

  test('nothing parsed, nothing described', () => {
    expect(describeShell([], [], '/h')).toBeNull()
    expect(describeShell(parseShell('gh pr ready --undo'), [NO_CONTEXT], '/h')).toBeNull()
  })
})

describe('decide', () => {
  test("only the write's own approve label passes", () => {
    expect(decide('Mark ready', 'Mark ready')).toEqual({ isApproved: true })
    expect(decide('Post comment', 'Mark ready').isApproved).toBe(false)
    expect(decide(REJECT, 'Mark ready')).toEqual({ isApproved: false, reason: 'the user rejected it' })
    expect(decide('', 'Mark ready').isApproved).toBe(false)
  })
  test('text typed under Other becomes the reason', () => {
    expect(decide('reword the second line', 'Post comment')).toEqual({ isApproved: false, reason: 'the user said: reword the second line' })
  })
})

// Stands in for the engine: the dialog answers `answer` and records the
// question, git and gh answer from `out`, and the gated tools record that they ran.
function engine(on: On, answer: string, ran: string[], asked: string[] = [], out: Record<string, string> = {}) {
  on('process.run', ($, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    const key = argv.join(' ')
    if (argv[0] === 'printenv') return { value: { exitCode: 0, stdout: '/h\n', stderr: '' } } as never
    return { value: key in out ? { exitCode: 0, stdout: out[key], stderr: '' } : { exitCode: 1, stdout: '', stderr: '' } } as never
  })
  on('session.cwd', () => ({ value: '/w' }) as never)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }) as never)
  on('ui.close', () => ({ value: undefined }) as never)
  on('ui.log', () => ({ value: undefined }) as never)
  on('tool.call', { tool: 'AskUserQuestion' }, ($, e) => {
    const question = (e as unknown as { questions: { question: string; options: { label: string }[] }[] }).questions[0]
    asked.push(`${question?.question} [${question?.options.map(o => o.label).join(' / ')}]`)
    return { result: { questions: [], answers: { [question?.question ?? '']: answer } } } as never
  })
  on('tool.call', { tool: COMMENT }, () => {
    ran.push('comment')
    return { result: 'posted' } as never
  })
  on('tool.call', { tool: 'Bash' }, () => {
    ran.push('bash')
    return { result: 'ok' } as never
  })
}

describe('gate', () => {
  const call = { tool: COMMENT, issueIdOrKey: 'CE-1234', commentBody: 'Merged.' } as never

  test('a rejected comment is denied and never reaches the tool', async ($, on) => {
    const ran: string[] = []
    engine(on, REJECT, ran)
    const result = await $.tool.call(call)
    expect(ran).toEqual([])
    expect(result.deny).toContain('the user rejected it')
  })

  test('an approved comment is sent unchanged', async ($, on) => {
    const ran: string[] = []
    engine(on, 'Post comment', ran)
    await $.tool.call(call)
    expect(ran).toEqual(['comment'])
  })

  test('gh pr ready in another folder is asked about from that folder', async ($, on) => {
    const ran: string[] = []
    const asked: string[] = []
    engine(on, 'Mark ready', ran, asked, {
      'git rev-parse --abbrev-ref @{u}': 'origin/fix/x',
      'git remote get-url origin': 'https://github.com/giant-eagle/GE.CloudOps.Platform.Tools.git',
      'gh pr view 271 --json number,title,headRefName,baseRefName,isDraft':
        JSON.stringify({ number: 271, title: 'fix(runwatch): detect indirect runs', headRefName: 'fix/x', baseRefName: 'main', isDraft: true }),
    })
    await $.tool.call({ tool: 'Bash', command: 'cd ~/Dev/GE.CloudOps.Platform.Tools && gh pr ready 271' } as never)
    expect(asked).toEqual(['Mark PR #271 in GE.CloudOps.Platform.Tools ready for review? [Reject / Mark ready]'])
    expect(ran).toEqual(['bash'])
  })

  test('a push runs without asking', async ($, on) => {
    const ran: string[] = []
    const asked: string[] = []
    engine(on, REJECT, ran, asked)
    await $.tool.call({ tool: 'Bash', command: 'git push -u origin feat' } as never)
    expect(asked).toEqual([])
    expect(ran).toEqual(['bash'])
  })
})
