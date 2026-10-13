import { describe, expect, test } from 'claude-code/testing'

import { lex, parseShell, repoFromUrl, resolveDir } from './shell'

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
  test('gh pr ready with the folder it runs in', () => {
    expect(parseShell('cd ~/Dev/GE.CloudOps.Platform.Tools && gh pr ready 271 2>&1 | tail -2')).toEqual([
      { kind: 'pr ready', dirs: ['~/Dev/GE.CloudOps.Platform.Tools'], repo: '', pr: '271', isUndo: false },
    ])
  })

  test('-R, --repo= and --undo', () => {
    expect(parseShell('gh pr ready -R giant-eagle/x').at(0)).toMatchObject({ repo: 'giant-eagle/x', pr: '' })
    expect(parseShell('gh pr ready --repo=o/r 12 --undo').at(0)).toMatchObject({ repo: 'o/r', pr: '12', isUndo: true })
  })

  test('a folder set by a variable is unknown', () => {
    expect(parseShell('cd "$REPO" && gh pr ready').at(0)?.dirs).toEqual([null])
  })

  test('other gh pr commands and unparseable wrappers are not writes', () => {
    expect(parseShell('gh pr view 12 && gh pr create --draft && git push')).toEqual([])
    expect(parseShell(`bash -c 'gh pr ready'`)).toEqual([])
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
})
