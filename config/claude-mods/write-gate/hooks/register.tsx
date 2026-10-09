import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Pending } from '../types'
import { APPROVE, classify, decide, REJECT } from './gate'

const PANE = 'write-gate'
const LOG = '.claude/write-gate.log'

const ACCENT = 'yellow'
const MUTED = 'gray'
const BAR_BG = 'blackBright'

const pending = atom({ plugin: 'write-gate', key: 'pending' } as const, null)

async function git($: EngineInterface, args: string[]) {
  const { exitCode, stdout } = await $.process
    .run(['git', ...args], { cwd: await $.session.cwd(), timeoutMs: 5000 })
    .catch(() => ({ exitCode: 1, stdout: '' }))
  return exitCode === 0 ? stdout.trim() : null
}

// For git push and gh pr: the branch, and the commits no remote has yet.
async function withGitContext($: EngineInterface, gate: Pending): Promise<Pending> {
  if (gate.tool !== 'Bash') return gate
  const branch = (await git($, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? ''
  const commits =
    (await git($, ['log', '--oneline', '@{u}..HEAD'])) ??
    (await git($, ['log', '--oneline', '-n', '20', 'HEAD', '--not', '--remotes'])) ??
    ''
  return { ...gate, target: branch, meta: commits ? `Commits not on the remote:\n${commits}` : '' }
}

async function audit($: EngineInterface, gate: Pending, outcome: string) {
  const home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  const line = JSON.stringify({ at: new Date().toISOString(), outcome, ...gate }) + '\n'
  await $.process.run(['sh', '-c', 'cat >> "$0"', `${home}/${LOG}`], { stdin: line }).catch(() => undefined)
}

async function ask($: EngineInterface, gate: Pending, isShown: boolean) {
  // The pane did not fit: put the payload in the transcript (never sent to the model).
  if (!isShown) $.ui.log([`write-gate · ${gate.action} ${gate.target}`, gate.body, gate.meta].filter(Boolean).join('\n\n'))
  const where = gate.target ? ` to ${gate.target}` : ''
  // Reject first, so a default or idle pick never sends anything.
  const answer = await $.ui.ask(`Send this ${gate.action}${where}? (payload in the write-gate pane)`, {
    header: 'write-gate',
    options: [REJECT, APPROVE],
  })
  return decide(answer)
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    const found = classify(e)
    if (!found) return next(e)

    const gate = await withGitContext($, found)
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

    const isCommand = gate.tool === 'Bash'
    return (
      <Box flexDirection="column">
        <Box backgroundColor={BAR_BG} paddingX={1} gap={1} width={e.props.bodyColumns}>
          <Text color={ACCENT} bold>
            ⏸ {gate.action}
          </Text>
          {gate.target && <Text color={MUTED}>→ {gate.target}</Text>}
        </Box>
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          {gate.body === '' ? (
            <Text dimColor>(no body)</Text>
          ) : isCommand ? (
            <Code source={gate.body} language="bash" />
          ) : (
            <Markdown text={gate.body.slice(0, 9000)} />
          )}
          {gate.meta && (
            <Box flexDirection="column" marginTop={1}>
              <Text color={MUTED}>{isCommand ? 'git' : 'other arguments'}</Text>
              <Code source={gate.meta} language={isCommand ? 'text' : 'json'} />
            </Box>
          )}
        </Box>
        <Box paddingX={1} marginTop={1}>
          <Text color={MUTED}>Answer in the dialog: {APPROVE} or {REJECT}</Text>
        </Box>
      </Box>
    )
  })
}
