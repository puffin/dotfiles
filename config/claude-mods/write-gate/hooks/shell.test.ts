import { describe, expect, test } from 'claude-code/testing'

import { lex, parseShell, repoFromUrl, resolveDir, unwrapHeredoc } from './shell'

const words = (command: string) => lex(command).map(s => s.words.map(w => w.text))

describe('lex', () => {
  test('splits at operators and drops redirections', () => {
    expect(words('cd ~/a && git push -u origin x 2>&1 | tail -4; echo "a b" >out.txt')).toEqual([
      ['cd', '~/a'], ['git', 'push', '-u', 'origin', 'x'], ['tail', '-4'], ['echo', 'a b'],
    ])
  })

  test('keeps a command substitution with a heredoc as one word', () => {
    const command = `gh pr create --title t --body "$(cat <<'EOF'\n## Why\nIt (finally) works.\nEOF\n)" --draft`
    expect(words(command)).toEqual([['gh', 'pr', 'create', '--title', 't', '--body', `$(cat <<'EOF'\n## Why\nIt (finally) works.\nEOF\n)`, '--draft']])
  })

  test('reads a top-level heredoc and its output file', () => {
    const [cat, gh] = lex(`cat > /tmp/b.md <<'EOF'\nhello\n&& not a command\nEOF\ngh pr create -F /tmp/b.md`)
    expect(cat).toEqual({ words: [{ text: 'cat', isDynamic: false }], heredoc: 'hello\n&& not a command', output: '/tmp/b.md' })
    expect(gh?.words.map(w => w.text)).toEqual(['gh', 'pr', 'create', '-F', '/tmp/b.md'])
  })
})

describe('parseShell', () => {
  test('the push-then-PR command from the CE-3554 screenshot', () => {
    const command =
      'cd ~/Dev/GE.Shared.CloudOps.Infra.CE-3554 && git push -u origin CE-3554-add-codeowners 2>&1 | tail -4 && ' +
      'gh pr create --draft --base main --head CE-3554-add-codeowners --title "CE-3554: add CODEOWNERS for cloud review teams" ' +
      '--body-file /private/tmp/pr-body.md 2>&1 | tail -3'
    const { writes } = parseShell(command)
    expect(writes).toEqual([
      { kind: 'push', dirs: ['~/Dev/GE.Shared.CloudOps.Infra.CE-3554'], remote: 'origin', refs: ['CE-3554-add-codeowners'], isForce: false, isDelete: false, isUpstream: true, isTags: false },
      {
        kind: 'pr create', dirs: ['~/Dev/GE.Shared.CloudOps.Infra.CE-3554'], repo: '', base: 'main', head: 'CE-3554-add-codeowners',
        title: 'CE-3554: add CODEOWNERS for cloud review teams', body: null, bodyFile: '/private/tmp/pr-body.md',
        isDraft: true, isFill: false, reviewers: [], labels: [],
      },
    ])
  })

  test('git -C, force and refspecs', () => {
    const [push] = parseShell('git -C ~/Dev/repo push --force-with-lease origin +HEAD:feat').writes
    expect(push).toMatchObject({ dirs: ['~/Dev/repo'], remote: 'origin', refs: ['HEAD:feat'], isForce: true })
  })

  test('a folder set by a variable is unknown', () => {
    expect(parseShell('cd "$REPO" && git push').writes[0]?.dirs).toEqual([null])
  })

  test('an inline heredoc body is unwrapped, short flags and -R read', () => {
    const [pr] = parseShell(`gh pr create -R giant-eagle/x -B main -t "T" -r a,b -r c --body "$(cat <<'EOF'\nbody\nEOF\n)"`).writes
    expect(pr).toMatchObject({ repo: 'giant-eagle/x', base: 'main', title: 'T', reviewers: ['a', 'b', 'c'], body: 'body' })
  })

  test('gh pr merge', () => {
    expect(parseShell('gh pr merge 12 --squash -d').writes[0]).toMatchObject({ kind: 'pr merge', pr: '12', method: 'squash', isDeleteBranch: true })
  })

  test('a file the command writes first is remembered', () => {
    expect(parseShell(`cat > b.md <<EOF\nhi\nEOF\ngh pr create -F b.md`).files).toEqual({ 'b.md': 'hi' })
  })

  test('nothing to describe in an unparseable wrapper', () => {
    expect(parseShell(`bash -c 'git push'`).writes).toEqual([])
  })
})

describe('helpers', () => {
  test('resolveDir follows cd from the session folder', () => {
    expect(resolveDir([], '/w', '/h')).toBe('/w')
    expect(resolveDir(['~/Dev', 'repo'], '/w', '/h')).toBe('/h/Dev/repo')
    expect(resolveDir(['sub', '/abs'], '/w', '/h')).toBe('/abs')
    expect(resolveDir(['sub', null], '/w', '/h')).toBeNull()
  })

  test('repoFromUrl reads https and ssh remotes', () => {
    expect(repoFromUrl('https://github.com/giant-eagle/GE.Shared.CloudOps.Infra.git')).toBe('giant-eagle/GE.Shared.CloudOps.Infra')
    expect(repoFromUrl('git@github.com:puffin/dotfiles.git')).toBe('puffin/dotfiles')
  })

  test('unwrapHeredoc leaves other text alone', () => {
    expect(unwrapHeredoc('plain')).toBe('plain')
  })
})
