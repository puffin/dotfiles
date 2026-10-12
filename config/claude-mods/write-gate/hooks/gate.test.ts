import { describe, expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { classify, type Context, decide, describeShell, NO_CONTEXT, REJECT } from './gate'
import { parseShell } from './shell'

const COMMENT = 'mcp__atlassian__addCommentToJiraIssue'

describe('classify', () => {
  test('gates Atlassian writes under any server spelling', () => {
    for (const tool of [COMMENT, 'mcp__claude_ai_Atlassian_Rovo__addCommentToJiraIssue']) {
      const gate = classify({ tool, tool_use_id: 't', cloudId: 'c', issueIdOrKey: 'CE-1234', commentBody: 'Done.' })
      expect(gate).toMatchObject({ tool, action: 'Jira comment', question: 'Post a Jira comment on CE-1234?', approve: 'Post comment', target: 'CE-1234', body: 'Done.' })
      expect(gate?.meta).not.toContain('cloudId')
    }
  })

  test('a write with no target asks without one', () => {
    expect(classify({ tool: 'mcp__atlassian__createIssueLink', inwardIssue: 'CE-1', outwardIssue: 'CE-2' })?.question).toBe('Link Jira issues?')
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

describe('describeShell', () => {
  const at = (c: Partial<Context>): Context => ({ ...NO_CONTEXT, dir: '/h/Dev/infra', ...c })

  test('push then draft PR reads as one plain question', () => {
    const { writes } = parseShell('cd ~/Dev/infra && git push -u origin feat && gh pr create --draft --base main --head feat --title "T" -F b.md')
    const repo = 'giant-eagle/GE.Shared.CloudOps.Infra'
    const described = describeShell(writes, [at({ repo, commits: 'a1 one\nb2 two' }), at({ repo, commits: 'a1 one\nb2 two', body: '## Why' })], '/h')
    expect(described).toEqual({
      question: 'Push feat to origin (2 commits) and open a draft PR in GE.Shared.CloudOps.Infra: feat → main?',
      approve: 'Push and open draft PR',
      target: repo,
      rows: [['Folder', '~/Dev/infra'], ['Repo', repo], ['Push', 'feat → origin'], ['Options', 'sets upstream'], ['Branch', 'feat → main'], ['Title', 'T']],
      body: '## Why',
      meta: 'a1 one\nb2 two',
      metaLabel: 'Commits in this PR',
    })
  })

  test('falls back to the branch and default branch it found', () => {
    const [pr] = parseShell('gh pr create --title T').writes
    expect(describeShell([pr!], [at({ branch: 'fix/x', defaultBranch: 'master' })], '/h')?.question).toBe('Open a PR: fix/x → master?')
  })

  test('says so when the folder is unknown', () => {
    const described = describeShell(parseShell('cd "$R" && git push -f').writes, [NO_CONTEXT], '/h')
    expect(described?.question).toBe('Force-push the current branch to its remote?')
    expect(described?.approve).toBe('Force-push')
    expect(described?.rows[0]).toEqual(['Folder', 'set by a variable, not checked'])
  })

  test('merge names the PR', () => {
    const pr = { number: 12, title: 'Add X', head: 'x', base: 'main' }
    const described = describeShell(parseShell('gh pr merge 12 --squash').writes, [at({ repo: 'o/r', pr })], '/h')
    expect(described?.question).toBe('Merge PR #12 in r (squash)?')
    expect(described?.approve).toBe('Merge PR')
  })

  test('nothing parsed, nothing described', () => {
    expect(describeShell([], [], '/h')).toBeNull()
  })
})

describe('decide', () => {
  test("only the write's own approve label passes", () => {
    expect(decide('Push', 'Push')).toEqual({ isApproved: true })
    expect(decide('Post comment', 'Push').isApproved).toBe(false)
    expect(decide(REJECT, 'Push')).toEqual({ isApproved: false, reason: 'the user rejected it' })
    expect(decide('', 'Push').isApproved).toBe(false)
  })
  test('text typed under Other becomes the reason', () => {
    expect(decide('reword the second line', 'Push')).toEqual({ isApproved: false, reason: 'the user said: reword the second line' })
  })
})

// Stands in for the engine: the dialog answers `answer` and records the
// question, git answers from `git`, and the gated tools record that they ran.
function engine(on: On, answer: string, ran: string[], asked: string[] = [], git: Record<string, string> = {}) {
  on('process.run', ($, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    const key = argv.slice(1).join(' ')
    if (argv[0] === 'printenv') return { value: { exitCode: 0, stdout: '/h\n', stderr: '' } } as never
    if (argv[0] === 'git') return { value: key in git ? { exitCode: 0, stdout: git[key], stderr: '' } : { exitCode: 1, stdout: '', stderr: '' } } as never
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('session.cwd', () => ({ value: '/w' }) as never)
  on('fs.read', () =>({ value: '## Why\nReviews go to the cloud team.' }) as never)
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

  test('push and PR in another folder are asked about from that folder', async ($, on) => {
    const ran: string[] = []
    const asked: string[] = []
    engine(on, 'Push and open draft PR', ran, asked, {
      'rev-parse --abbrev-ref HEAD': 'CE-3554-add-codeowners',
      'remote get-url origin': 'https://github.com/giant-eagle/GE.Shared.CloudOps.Infra.git',
      'log --oneline -n 20 CE-3554-add-codeowners --not --remotes': 'abc1234 feat(codeowners): add cloud review teams',
      'log --oneline -n 50 origin/main..CE-3554-add-codeowners': 'abc1234 feat(codeowners): add cloud review teams',
    })
    const command =
      'cd ~/Dev/GE.Shared.CloudOps.Infra.CE-3554 && git push -u origin CE-3554-add-codeowners 2>&1 | tail -4 && ' +
      'gh pr create --draft --base main --head CE-3554-add-codeowners --title "CE-3554: add CODEOWNERS" --body-file /tmp/pr-body.md'
    await $.tool.call({ tool: 'Bash', command } as never)
    expect(asked).toEqual([
      'Push CE-3554-add-codeowners to origin (1 commit) and open a draft PR in GE.Shared.CloudOps.Infra: CE-3554-add-codeowners → main? [Reject / Push and open draft PR]',
    ])
    expect(ran).toEqual(['bash'])
  })
})
