import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pending } from '../types'
import { classify, type Context, decide, describeShell, NO_CONTEXT, REJECT } from './gate'
import { transitionName } from './mcp'
import { parseShell, repoFromUrl, resolveDir, type Write } from './shell'

const PANE = 'write-gate'
const LOG = '.claude/write-gate.log'

const ACCENT = 'yellow'
const MUTED = 'gray'
const BAR_BG = 'blackBright'
const LABEL_WIDTH = 10

const pending = atom({ plugin: 'write-gate', key: 'pending' } as const, null)

async function run($: EngineInterface, argv: string[], cwd: string, timeoutMs = 5000) {
  const { exitCode, stdout } = await $.process.run(argv, { cwd, timeoutMs }).catch(() => ({ exitCode: 1, stdout: '' }))
  return exitCode === 0 ? stdout.trim() : null
}

async function home($: EngineInterface) {
  return (await $.process.run(['printenv', 'HOME']).catch(() => ({ stdout: '' }))).stdout.trim()
}

// Looks at the repository a write runs in: its branch, remote, and the commits
// it would send. Reads the PR description from --body-file, or from the file
// a heredoc earlier in the command writes.
async function context($: EngineInterface, write: Write, files: Record<string, string>, cwd: string, home: string): Promise<Context> {
  const dir = resolveDir(write.dirs, cwd, home)
  if (dir === null) return NO_CONTEXT
  const git = (...args: string[]) => run($, ['git', ...args], dir)

  const branch = (await git('rev-parse', '--abbrev-ref', 'HEAD')) ?? ''
  const upstream = (await git('rev-parse', '--abbrev-ref', '@{u}')) ?? ''
  const remote = (write.kind === 'push' && write.remote) || upstream.split('/')[0] || 'origin'
  const repo = repoFromUrl((await git('remote', 'get-url', remote)) ?? '')
  const found: Context = { ...NO_CONTEXT, dir, branch, remote, repo }

  if (write.kind === 'push') {
    const ref = write.refs[0]?.split(':')[0] || 'HEAD'
    const isCurrent = ref === 'HEAD' || ref === branch
    found.commits =
      (isCurrent ? await git('log', '--oneline', '@{u}..HEAD') : await git('log', '--oneline', `${remote}/${ref}..${ref}`)) ??
      (await git('log', '--oneline', '-n', '20', ref, '--not', '--remotes')) ??
      ''
  }

  if (write.kind === 'pr create') {
    found.defaultBranch = ((await git('symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`)) ?? '').replace(`${remote}/`, '')
    const head = (write.head || branch).replace(/^[^:]+:/, '')
    const base = write.base || found.defaultBranch
    if (head && base) found.commits = (await git('log', '--oneline', '-n', '50', `${remote}/${base}..${head}`)) ?? ''
    if (write.bodyFile && write.bodyFile !== '-') {
      const path = resolveDir([write.bodyFile], dir, home) ?? write.bodyFile
      found.body = files[write.bodyFile] ?? (await $.fs.read(path).catch(() => null))
    }
  }

  if (write.kind === 'pr merge') {
    const args = ['gh', 'pr', 'view', ...(write.pr ? [write.pr] : []), '--json', 'number,title,headRefName,baseRefName']
    const json = await run($, [...args, ...(write.repo ? ['-R', write.repo] : [])], dir, 8000)
    try {
      const pr = json ? (JSON.parse(json) as { number: number; title: string; headRefName: string; baseRefName: string }) : null
      if (pr) found.pr = { number: pr.number, title: pr.title, head: pr.headRefName, base: pr.baseRefName }
    } catch {
      // gh printed something else; show the PR as given.
    }
  }
  return found
}

// For git push and gh pr: says what the command will do, from its flags and
// the repository it runs in. Left as classify made it when nothing parses.
async function explain($: EngineInterface, gate: Pending): Promise<Pending> {
  if (!gate.command) return gate
  const { writes, files } = parseShell(gate.command)
  const [cwd, homeDir] = await Promise.all([$.session.cwd(), home($)])
  const contexts = await Promise.all(writes.map(write => context($, write, files, cwd, homeDir).catch(() => NO_CONTEXT)))
  const described = describeShell(writes, contexts, homeDir)
  return described ? { ...gate, ...described } : gate
}

// For a Jira transition: the status it moves to, from the issue's
// transitions. Asked only when that read is already allowed, so it never
// raises a second dialog; the question says so when the name is not found.
async function lookUp($: EngineInterface, e: { tool: string; [key: string]: unknown }, gate: Pending): Promise<Pending> {
  if (!e.tool.endsWith('__transitionJiraIssue')) return gate
  const id = String((e.transition as { id?: unknown } | undefined)?.id ?? '')
  const tool = e.tool.replace(/transitionJiraIssue$/, 'getTransitionsForJiraIssue')
  const input = { cloudId: e.cloudId, issueIdOrKey: e.issueIdOrKey }
  const { decision } = await $.tool.check({ tool, input })
  if (decision !== 'allow') return gate
  const answer = await Promise.race([$.tool.call({ tool, ...input } as never), $.clock.sleep(8000).then(() => null)])
  if (!answer || answer.deny !== undefined || answer.isError) return gate
  const name = transitionName(answer.text ?? JSON.stringify(answer.result), id)
  return name ? (classify(e, { transitionName: name }) ?? gate) : gate
}

async function audit($: EngineInterface, gate: Pending, outcome: string) {
  const line = JSON.stringify({ at: new Date().toISOString(), outcome, ...gate }) + '\n'
  await $.process.run(['sh', '-c', 'cat >> "$0"', `${await home($)}/${LOG}`], { stdin: line }).catch(() => undefined)
}

async function ask($: EngineInterface, gate: Pending, isShown: boolean) {
  // The pane did not fit: put the payload in the transcript (never sent to the model).
  if (!isShown) {
    const rows = gate.rows.map(([label, value]) => `${label.padEnd(LABEL_WIDTH)}${value}`).join('\n')
    const meta = gate.meta && `${gate.metaLabel}:\n${gate.meta}`
    $.ui.log([`write-gate · ${gate.question}`, rows, gate.body, meta, gate.command].filter(Boolean).join('\n\n'))
  }
  // Reject first, so a default or idle pick never sends anything.
  const answer = await $.ui.ask(gate.question, { header: 'write-gate', options: [REJECT, gate.approve] })
  return decide(answer, gate.approve)
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const found = classify(e)
    if (!found) return next(e)

    const gate = await (found.command ? explain($, found) : lookUp($, e, found)).catch(() => found)
    await update($, pending, () => gate)
    const { isPlaced } = await $.ui
      .open({ id: PANE, title: `write-gate · ${gate.action}` })
      .catch(() => ({ isPlaced: false }))

    const decision = await ask($, gate, isPlaced).catch(() => ({ isApproved: false as const, reason: 'no one answered the approval dialog' }))
    await update($, pending, () => null)
    void $.ui.close({ id: PANE }).catch(() => undefined)
    await audit($, gate, decision.isApproved ? 'approved' : `rejected: ${decision.reason}`)

    if (decision.isApproved) return next(e)
    return { deny: `write-gate held this ${gate.action} for approval and ${decision.reason}. Nothing was sent.` }
  }).catch(($, e, next) =>
    // Fail closed: a gate that broke before passing the call on blocks it.
    next.called ? next(e) : { deny: 'write-gate could not ask for approval, so the write was blocked.' },
  )

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Code, Markdown, Text } = $.ui.resolve(e)
    const gate = await read($, pending)
    if (gate === null) return <Text dimColor>Nothing is waiting for approval.</Text>

    const isCommand = gate.command !== ''
    const section = (label: string) => <Text color={MUTED}>{label}</Text>
    return (
      <Box flexDirection="column">
        <Box backgroundColor={BAR_BG} paddingX={1} width={e.props.bodyColumns}>
          <Text color={ACCENT} bold>
            ⏸ {gate.question}
          </Text>
        </Box>
        {gate.rows.length > 0 && (
          <Box flexDirection="column" paddingX={1} marginTop={1}>
            {gate.rows.map(([label, value]) => (
              <Box key={`${label}:${value}`}>
                <Box width={LABEL_WIDTH} flexShrink={0}>
                  <Text color={MUTED}>{label}</Text>
                </Box>
                <Text>{value}</Text>
              </Box>
            ))}
          </Box>
        )}
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          {isCommand && gate.body !== '' && section('Description')}
          {gate.body !== '' ? (
            <Markdown text={gate.body.slice(0, 9000)} />
          ) : (
            !isCommand && <Text dimColor>(no body)</Text>
          )}
          {gate.meta && (
            <Box flexDirection="column" marginTop={gate.body === '' ? 0 : 1}>
              {section(gate.metaLabel)}
              <Code source={gate.meta} language={isCommand ? 'text' : 'json'} />
            </Box>
          )}
          {isCommand && (
            <Box flexDirection="column" marginTop={1}>
              {section('Command')}
              <Code source={gate.command} language="bash" />
            </Box>
          )}
        </Box>
        <Box paddingX={1} marginTop={1}>
          <Text color={MUTED}>
            Answer in the dialog: {gate.approve} or {REJECT}
          </Text>
        </Box>
      </Box>
    )
  })
}
