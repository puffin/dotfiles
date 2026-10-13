import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import type { Watch } from '../types'
import {
  bar,
  capped,
  detect,
  elapsed,
  fit,
  isPush,
  newestRun,
  newestVersion,
  parseRun,
  planSummary,
  readChecks,
  readJenkins,
  readPr,
  readQueue,
  readRun,
  readTerrakube,
  repoOf,
  statusLine,
  terrakubeTail,
} from './watch'

// What `terrakube.sh step-log` prints for a plan step.
const PLAN = [
  '===== step 100 (step-1) =====',
  'Refreshing state...',
  'Terraform will perform the following actions:',
  '  # azurerm_storage_account.logs will be created',
  '  # azurerm_key_vault.this will be updated in-place',
  '  # azurerm_subnet.old will be destroyed',
  'Plan: 2 to add, 0 to change, 1 to destroy.',
  '│ Warning: Argument is deprecated',
].join('\n')
const RUN_URL = 'https://terrakube-main.example/organizations/org-1/workspaces/ws-1/runs/job-1'
const GHA_URL = 'https://github.com/puffin/dotfiles/actions/runs/123456'

describe('detect', () => {
  test('a confirmed terrakube run, named after its workspace and template', () => {
    const stdout = [
      'Workspace : alz-connectivity-prod (ws-1)',
      'Template  : plan-and-apply (tpl-1)',
      '{ "id": "a1b2c3d4-0000", "status": "pending" }',
    ].join('\n')
    const seed = detect('~/.claude/plugins/cache/ge-cloudops/terrakube/0.2.1/scripts/terrakube.sh run org-1 ws-1 tpl-1 main --confirm', stdout, '/repo')
    expect(seed).toEqual({
      id: 'tk:a1b2c3d4-0000',
      kind: 'terrakube',
      label: 'alz-connectivity-prod',
      title: 'plan-and-apply',
      org: 'org-1',
      job: 'a1b2c3d4-0000',
      wake: false,
    })
  })

  test('a terrakube run without the preview lines is named by its job', () => {
    expect(detect('terrakube.sh run org-1 ws-1 tpl-1 main --confirm', '{"id":"a1b2c3d4-0000"}', '/repo')?.label).toBe('job a1b2c3d4')
  })

  test('a terrakube preview is not a run', () => {
    expect(detect('terrakube.sh run org-1 ws-1 tpl-1 main', 'Preview only.', '/repo')).toBeNull()
  })

  test('a jenkins trigger, by its queue item', () => {
    const headers = 'HTTP/2 201\r\nlocation: https://jenkins.example/queue/item/4711/\r\n'
    expect(detect('jenkins.sh trigger "Platform/deploy" ENV=dev', headers, '/repo')).toMatchObject({ kind: 'jenkins', label: 'Platform/deploy', queueId: '4711' })
  })

  test('gh pr create, by the URL it prints', () => {
    const seed = detect('gh pr create --draft --title x', 'https://github.com/giant-eagle/GE.CloudOps.ALZ.Vending/pull/42\n', '/repo')
    expect(seed).toMatchObject({ kind: 'pr', label: 'GE.CloudOps.ALZ.Vending#42', pr: 'https://github.com/giant-eagle/GE.CloudOps.ALZ.Vending/pull/42' })
  })

  test('gh workflow run and gh run rerun', () => {
    expect(detect('gh workflow run ci.yml', `✓ Created workflow_dispatch event for ci.yml at main\n${GHA_URL}\n`, '/repo')).toMatchObject({
      id: 'gha:puffin/dotfiles:123456',
      kind: 'gha',
      repo: 'puffin/dotfiles',
      run: '123456',
      url: GHA_URL,
    })
    const rerun = '✓ Requested rerun (failed jobs) of run 99'
    expect(detect('gh run rerun 99 -R o/r --failed', rerun, '/repo')).toMatchObject({ id: 'gha:o/r:99', repo: 'o/r', run: '99' })
    expect(detect('gh run rerun 99', rerun, '/repo')).toMatchObject({ id: 'gha:/repo:99', run: '99', cwd: '/repo' })
    // Mentioned, not run: no confirmation from gh.
    expect(detect("cat <<'EOF'\ngh run rerun 99 -R o/r\nEOF", 'gh run rerun 99 -R o/r', '/repo')).toBeNull()
    expect(detect('echo gh workflow run ci.yml', 'gh workflow run ci.yml', '/repo')).toBeNull()
    expect(detect('gh run list', '', '/repo')).toBeNull()
  })

  test('git push is looked up separately', () => {
    expect(isPush('git push -u origin feat/x')).toBe(true)
    expect(isPush('git -C ~/repo push')).toBe(true)
    expect(isPush('git pull')).toBe(false)
    expect(detect('git push', '', '/repo')).toBeNull()
  })

  test('gh workflow run without a run URL is found by its workflow', () => {
    const seed = detect('gh workflow run deploy.yml -f env=dev --ref main -R o/r', '✓ Created workflow_dispatch event for deploy.yml at main', '/repo')
    expect(seed).toMatchObject({ id: 'gha:o/r:wf:deploy.yml', kind: 'gha', label: 'deploy.yml', workflow: 'deploy.yml', repo: 'o/r' })
    expect(seed?.run).toBeUndefined()
    expect(detect('gh workflow run -f env=dev deploy.yml', '✓ Created workflow_dispatch event', '/repo')).toMatchObject({ id: 'gha:/repo:wf:deploy.yml' })
  })

  test('a rerun, and only a rerun, waits out the previous attempt', () => {
    expect(detect('gh run rerun 99 --failed', '✓ Requested rerun of run 99', '/repo')?.settle).toBe(true)
    expect(detect('gh workflow run ci.yml', `✓ Created workflow_dispatch event\n${GHA_URL}`, '/repo')?.settle).toBeUndefined()
  })

  test('repos from URLs and remotes', () => {
    expect(repoOf('https://github.com/o/r/pull/7')).toBe('o/r')
    expect(repoOf(GHA_URL)).toBe('puffin/dotfiles')
    expect(repoOf('git@github.com:giant-eagle/GE.CloudOps.ALZ.Vending.git')).toBe('giant-eagle/GE.CloudOps.ALZ.Vending')
    expect(repoOf('git@github.com-private:puffin/dotfiles.git')).toBe('puffin/dotfiles')
    expect(repoOf('https://github.com/o/r.git')).toBe('o/r')
    expect(repoOf('ssh://git@github.com/o/r')).toBe('o/r')
    expect(repoOf('https://gitlab.com/o/r')).toBeNull()
  })

  test('a run asked for by id or URL', () => {
    expect(parseRun(GHA_URL)).toEqual({ repo: 'puffin/dotfiles', run: '123456' })
    expect(parseRun('42')).toEqual({ repo: null, run: '42' })
    expect(parseRun('main')).toBeNull()
  })
})

describe('readers', () => {
  test('terrakube statuses', () => {
    expect(readTerrakube({ attributes: { status: 'running' } }).status).toBe('running')
    expect(readTerrakube({ attributes: { status: 'waitingApproval' } })).toMatchObject({ status: 'waiting', detail: 'waiting for approval' })
    expect(readTerrakube({ attributes: { status: 'completed' } }).status).toBe('passed')
    expect(readTerrakube({ attributes: { status: 'failed' } }).status).toBe('failed')
    expect(readTerrakube({ attributes: { status: 'constructor' } }).status).toBe('running')
    expect(readTerrakube({ attributes: { status: 'completed' }, ui_url: RUN_URL }).url).toBe(RUN_URL)
    expect(readTerrakube({ attributes: { status: 'completed' } }).url).toBeUndefined()
    expect(readTerrakube({ attributes: { status: 'running' }, relationships: { workspace: { data: { id: 'ws-9' } } } }).ws).toBe('ws-9')
  })

  test('terrakube log: the plan summary, then the resources that change', () => {
    expect(terrakubeTail(PLAN)).toEqual([
      'plan: +2 ~0 -1',
      '# azurerm_storage_account.logs will be created',
      '# azurerm_key_vault.this will be updated in-place',
      '# azurerm_subnet.old will be destroyed',
    ])
    // A failed run has no actions: its last lines carry the error.
    expect(terrakubeTail('Initializing...\n│ Error: Unsupported argument')).toEqual(['Initializing...', '│ Error: Unsupported argument'])
    expect(terrakubeTail('')).toEqual([])
    expect(planSummary('No changes. Your infrastructure matches.')).toBe('no changes')
  })

  test('jenkins queue and builds, with progress against its estimate', () => {
    expect(readQueue({ items: [{ id: 4711, why: 'Waiting for next available executor' }] }, '4711')?.detail).toBe('Waiting for next available executor')
    expect(readQueue({ items: [] }, '4711')).toBeNull()
    expect(readJenkins({ number: 41, building: true, result: null }, 0)).toMatchObject({ status: 'running', build: '41' })
    const halfway = readJenkins({ number: 41, building: true, result: null, timestamp: 1000, estimatedDuration: 600_000 }, 301_000)
    expect(halfway).toMatchObject({ progress: 0.5, eta: 300_000 })
    // Running past the estimate never shows a full bar.
    expect(readJenkins({ number: 41, building: true, timestamp: 1, estimatedDuration: 1000 }, 5000).progress).toBe(0.99)
    expect(readJenkins({ number: 41, building: false, result: 'SUCCESS', url: 'u' }, 0)).toMatchObject({ status: 'passed', detail: '#41 SUCCESS', url: 'u' })
    expect(readJenkins({ number: 41, building: false, result: 'UNSTABLE' }, 0).status).toBe('failed')
  })

  test('pr checks', () => {
    expect(readChecks([]).status).toBe('queued')
    expect(readChecks([{ name: 'plan', bucket: 'pass' }, { name: 'lint', bucket: 'pending' }])).toMatchObject({ status: 'running', detail: '1/2 checks', progress: 0.5 })
    expect(readChecks([{ name: 'plan', bucket: 'pass' }, { name: 'lint', bucket: 'fail' }])).toMatchObject({ status: 'failed', failing: ['✗ lint'] })
    expect(readChecks([{ name: 'plan', bucket: 'pass' }, { name: 'docs', bucket: 'skipping' }]).status).toBe('passed')
  })

  test('pr state', () => {
    expect(readPr({ state: 'MERGED', title: 'feat: x' })).toEqual({ ended: { status: 'passed', detail: 'merged' }, title: 'feat: x' })
    expect(readPr({ state: 'CLOSED' }).ended?.status).toBe('failed')
    expect(readPr({ state: 'OPEN', title: 't' })).toEqual({ ended: null, title: 't' })
    expect(readPr(undefined).ended).toBeNull()
  })

  test('actions runs', () => {
    const base = { workflowName: 'CI', displayTitle: 'feat: x', headBranch: 'feat/x', url: GHA_URL }
    const running = readRun({ ...base, status: 'in_progress', jobs: [{ name: 'lint', status: 'completed', conclusion: 'success' }, { name: 'plan', status: 'in_progress' }] })
    expect(running).toMatchObject({ status: 'running', detail: '1/2 jobs', progress: 0.5, label: 'CI', title: 'feat: x · feat/x', repo: 'puffin/dotfiles' })
    const failed = readRun({
      ...base,
      status: 'completed',
      conclusion: 'failure',
      jobs: [{ name: 'plan', status: 'completed', conclusion: 'failure', steps: [{ name: 'terraform plan', conclusion: 'failure' }] }],
    })
    expect(failed).toMatchObject({ status: 'failed', detail: 'failure', failing: ['✗ plan', '  › terraform plan'] })
    expect(readRun({ ...base, status: 'completed', conclusion: 'success', jobs: [] }).status).toBe('passed')
    expect(readRun({ ...base, status: 'waiting' }).status).toBe('waiting')
    expect(readRun({ ...base, status: 'queued' }).status).toBe('queued')
  })

  test('the newest dispatched run since the watch started', () => {
    const at = (iso: string) => Date.parse(iso)
    const runs = [
      { databaseId: 1, createdAt: '2026-10-13T10:00:00Z', url: 'https://github.com/o/r/actions/runs/1' },
      { databaseId: 2, createdAt: '2026-10-13T10:05:00Z', url: 'https://github.com/o/r/actions/runs/2' },
    ]
    expect(newestRun(runs, at('2026-10-13T10:05:30Z'))).toEqual({ run: '2', url: 'https://github.com/o/r/actions/runs/2' })
    expect(newestRun(runs, at('2026-10-13T10:10:00Z'))).toBeNull()
    expect(newestRun(undefined, 0)).toBeNull()
  })

  test('the cap drops finished runs, oldest first, never a running one', () => {
    type Row = Pick<Watch, 'status' | 'startedAt' | 'checkedAt' | 'endedAt'>
    const done: Row[] = Array.from({ length: 5 }, (_, i) => ({ status: 'passed', startedAt: 10 + i, checkedAt: 10 + i, endedAt: 10 + i }))
    const running: Row = { status: 'running', startedAt: 0, checkedAt: 0 }
    const kept = capped([running, ...done], 3)
    expect(kept).toHaveLength(3)
    expect(kept[0]).toBe(running)
    expect(kept.slice(1).map(w => w.endedAt)).toEqual([13, 14])
  })

  test('helpers', () => {
    expect(newestVersion(['0.1.9', '0.2.1', '0.10.0', 'tmp'])).toBe('0.10.0')
    expect(elapsed(75_000)).toBe('1m15s')
    expect(fit('abcdef', 4)).toBe('abc…')
    expect(fit('ab', 4)).toBe('ab  ')
    expect(bar(0.5, 4)).toEqual(['━━', '──'])
    expect(statusLine([{ status: 'running' }, { status: 'waiting' }, { status: 'failed' }])).toBe('⟳ 1 running · ‖ 1 waiting · ✗ 1 failed')
    expect(statusLine([{ status: 'passed' }, { status: 'failed' }])).toBeUndefined()
  })
})

type Seen = {
  toasts: string[]
  prompts: string[]
  notified: string[]
  sounds: string[]
  statuses: (string | undefined)[]
  store: Map<string, unknown>
  isPaneShown: boolean
  polled: string[]
  opened: number
  // The terrakube/jenkins skill version in the plugin cache.
  version: string
  scripts?: string[]
  // Answers a command before the default host does: argv in, stdout (or a full result) out.
  respond?: (argv: string[]) => string | { exitCode: number; stdout: string; stderr: string } | undefined | Promise<string | undefined>
}

const seen = (): Seen => ({ toasts: [], prompts: [], notified: [], sounds: [], statuses: [], store: new Map(), isPaneShown: false, polled: [], opened: 0, version: '0.2.1' })

// Stands in for the host: a terrakube job that runs once, then completes,
// and a jenkins wrapper with no credentials.
function host(on: On, saw: Seen) {
  let polls = 0
  const arg = <T>(e: unknown) => e as T
  on('process.run', ($, e) => {
    const argv = arg<{ argv: string[] }>(e).argv
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    const answer = saw.respond?.(argv)
    if (answer !== undefined) {
      return Promise.resolve(answer).then(a => (typeof a === 'string' || a === undefined ? out(a ?? '') : ({ value: a } as never)))
    }
    if (argv[0] === 'printenv') return out('/home/me')
    if (argv[1] === 'build-info') return { value: { exitCode: 1, stdout: '', stderr: 'Error: credentials file not found\n' } } as never
    if (argv[1] === 'job') {
      saw.polled.push(argv[3] ?? '')
      saw.scripts?.push(argv[0] ?? '')
      return out(JSON.stringify({ id: argv[3], attributes: { status: polls++ === 0 ? 'running' : 'completed' }, ui_url: RUN_URL }))
    }
    if (argv[1] === 'step-log') return out(PLAN)
    if (argv[0] === 'gh' && argv[1] === 'auth') return { value: { exitCode: 1, stdout: '', stderr: 'no account' } } as never
    if (argv[0] === 'gh' && argv[2] === 'view') return out(JSON.stringify({ state: 'MERGED', title: 'feat: x' }))
    if (argv[0] === 'gh' && argv[2] === 'checks') return { value: { exitCode: 1, stdout: '', stderr: 'no checks reported' } } as never
    return { value: { exitCode: 1, stdout: '', stderr: 'unexpected' } } as never
  })
  on('fs.list', ($, e) => {
    const path = arg<{ path: string }>(e).path
    const name = path.endsWith('/cache') ? 'ge-cloudops' : saw.version
    return { value: [{ name, kind: 'directory', size: 0, mtimeMs: 0, isLink: false }] } as never
  })
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('session.root', () => ({ value: '/repo' }) as never)
  on('session.id', () => ({ value: 'me' }) as never)
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__runwatch__watch' } }) as never)
  on('ui.open', () => {
    saw.opened++
    return { value: { isPlaced: false, reason: 'test' } } as never
  })
  on('ui.invalidate', () => ({ value: undefined }) as never)
  on('ui.panes', () => ({ value: [{ id: 'runwatch', title: 'runwatch', isShown: true, isFocused: false, isPlaced: saw.isPaneShown }] }) as never)
  on('ui.status', ($, e) => {
    saw.statuses.push(arg<{ text: string | undefined }>(e).text)
    return { value: undefined } as never
  })
  on('ui.toast', ($, e) => {
    saw.toasts.push(arg<{ text: string }>(e).text)
    return { value: undefined } as never
  })
  on('ui.notify', ($, e) => {
    saw.notified.push(arg<{ text: string }>(e).text)
    return { value: { isDelivered: true } } as never
  })
  on('audio.play', ($, e) => {
    saw.sounds.push(arg<{ clip: { asset: string } }>(e).clip.asset)
    return { value: undefined } as never
  })
  on('prompt.submit', ($, e) => {
    saw.prompts.push(arg<{ text: string }>(e).text)
    return { drop: 'test' } as never
  })
  on('store.keys', () => ({ value: [...saw.store.keys()] }) as never)
  on('store.get', ($, e) => ({ value: saw.store.get(arg<{ key: string }>(e).key) }) as never)
  on('store.set', ($, e) => {
    const { key, value } = arg<{ key: string; value: unknown }>(e)
    saw.store.set(key, value)
    return { value: undefined } as never
  })
  on('store.delete', ($, e) => {
    saw.store.delete(arg<{ key: string }>(e).key)
    return { value: undefined } as never
  })
}

const stored = (over: Partial<Watch>): Watch => ({
  id: 'tk:job-9',
  kind: 'terrakube',
  label: 'alz-mgmt',
  org: 'org-1',
  job: 'job-9',
  status: 'running',
  detail: 'running',
  tail: [],
  startedAt: 0,
  // Last checked long ago: its session went quiet.
  checkedAt: -3_600_000,
  wake: true,
  owner: 'other',
  origin: 'other',
  project: '/repo',
  misses: 0,
  ...over,
})

describe('runwatch', () => {
  test('a handed-off job announces once, everywhere, and wakes Claude', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)

    const ran = await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    expect(String(ran.result)).toContain('Watching Terrakube job job-1')
    await clock.advance(0)
    expect(saw.toasts).toEqual([])
    expect(saw.store.has('watch:tk:job-1')).toBe(true)

    await clock.advance(20_000)
    await clock.advance(20_000)
    expect(saw.toasts).toEqual(['✓ Terrakube job job-1: completed · plan: +2 ~0 -1'])
    expect(saw.notified).toEqual(['Terrakube job job-1: completed · plan: +2 ~0 -1'])
    expect(saw.sounds).toEqual(['sounds/done.wav'])
    expect(saw.prompts).toHaveLength(1)
    expect(saw.prompts[0]).toContain('[runwatch] Terrakube job job-1 finished: passed')
    expect(saw.prompts[0]).toContain(`Run: ${RUN_URL}`)
    expect(saw.prompts[0]).toContain('# azurerm_key_vault.this will be updated in-place')
    expect((saw.store.get('watch:tk:job-1') as Watch).status).toBe('passed')
  })

  test('each channel announces at its own level', { options: { toast: 'failures', notify: 'off', sound: 'failures' } }, async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)

    // A pass: quiet on every failures-only channel, but Claude still hears of its run.
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    await clock.advance(0)
    await clock.advance(20_000)
    expect(saw.prompts).toHaveLength(1)
    expect([saw.toasts, saw.notified, saw.sounds]).toEqual([[], [], []])

    // A failure (Jenkins out of reach six times): toast and chime, no notification.
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'jenkins', path: 'Platform/deploy', build: '41' } as never)
    for (let i = 0; i < 6; i++) await clock.advance(20_000)
    expect(saw.toasts).toHaveLength(1)
    expect(saw.toasts[0]).toContain('✗ Jenkins Platform/deploy: lost contact')
    expect(saw.sounds).toEqual(['sounds/fail.wav'])
    expect(saw.notified).toEqual([])
  })

  test('a merged PR with no checks finishes on the first poll, with its title', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)

    const ran = await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'pr', pr: 'https://github.com/o/r/pull/7' } as never)
    expect(String(ran.result)).toContain('Watching PR r#7')
    await clock.advance(0)
    await clock.advance(20_000)
    expect(saw.toasts).toEqual(['✓ PR r#7: merged'])
    expect((saw.store.get('watch:pr:https://github.com/o/r/pull/7') as Watch).title).toBe('feat: x')
  })

  test('a quiet session’s watch is adopted, without waking Claude here', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    saw.store.set('watch:tk:job-9', stored({}))
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    await clock.advance(20_000)

    expect(saw.polled).toContain('job-9')
    const w = saw.store.get('watch:tk:job-9') as Watch
    expect(w).toMatchObject({ owner: 'me', origin: 'other', status: 'passed' })
    expect(saw.toasts).toHaveLength(1)
    expect(saw.prompts).toEqual([])
  })

  test('a live session’s watch is shown here but not polled', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    saw.store.set('watch:tk:job-9', stored({ checkedAt: 1e15 }))
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    expect(saw.polled).toEqual([])
    expect(saw.statuses.at(-1)).toBe('⟳ 1 running')
  })

  test('finished watches past keepDoneHours leave the store', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    saw.store.set('watch:tk:job-9', stored({ status: 'passed', endedAt: -25 * 3_600_000 }))
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    expect(saw.store.has('watch:tk:job-9')).toBe(false)
  })

  test('the pane: a row per run, its link and actions', async ($, on) => {
    const clock = mock.clock(on)
    host(on, seen())
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    await clock.advance(0)
    await clock.advance(20_000)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'runwatch', surface, component: 'Pane', requestId: 'runwatch', props: { bodyColumns: 100 } } as never)
      const row = await ui.find({ key: 'row:tk:job-1' })
      expect(row?.text).toContain('job job-1')
      expect(row?.text).toContain('completed')
      expect(await ui.find({ key: 'act-clear' })).toBeTruthy()
      // Enter on the row opens its details, with the link.
      expect(await ui.find({ type: 'Link' })).toBeFalsy()
      await ui.press({ key: 'row:tk:job-1' })
      expect((await ui.find({ type: 'Link' }))?.props).toMatchObject({ href: RUN_URL })
      await ui.press({ key: 'row:tk:job-1' })
      await ui.unmount()
    }
  })

  test("another project's run is tagged with its folder, and opens no pane", async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    saw.store.set('watch:tk:job-9', stored({ checkedAt: 1e15, project: '/work/GE.CloudOps.ALZ.Vending' }))
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    expect(saw.opened).toBe(0)
    expect(saw.statuses.at(-1)).toBe('⟳ 1 running')

    const ui = await $.ui.mount({ plugin: 'runwatch', surface: 'terminal', component: 'Pane', requestId: 'runwatch', props: { bodyColumns: 120 } } as never)
    expect((await ui.find({ key: 'row:tk:job-9' }))?.text).toContain('alz-mgmt · GE.CloudOps.ALZ.Vending')
    await ui.unmount()
  })

  test('show: project hides, and leaves alone, the runs of other projects', { options: { show: 'project' } }, async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    // Gone quiet in its own session, but not this project's to adopt.
    saw.store.set('watch:tk:job-9', stored({ project: '/elsewhere' }))
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    await clock.advance(20_000)
    expect(saw.polled).toEqual([])
    expect(saw.statuses.at(-1)).toBeUndefined()

    const ui = await $.ui.mount({ plugin: 'runwatch', surface: 'terminal', component: 'Pane', requestId: 'runwatch', props: { bodyColumns: 120 } } as never)
    expect(await ui.find({ key: 'row:tk:job-9' })).toBeFalsy()
    await ui.unmount()
  })

  test('a watch removed in another session while it is polled stays removed', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    saw.respond = argv => {
      if (argv[1] !== 'job') return undefined
      saw.store.delete('watch:tk:job-1')
      return JSON.stringify({ attributes: { status: 'completed' } })
    }
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    await clock.advance(0)
    await clock.advance(20_000)
    expect(saw.store.has('watch:tk:job-1')).toBe(false)
    expect(saw.toasts).toEqual([])
    expect(saw.prompts).toEqual([])
  })

  test('the session that started a watch takes it back from one that took it over', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    // Checked just now by the session that took it over: not quiet, so only origin explains the takeback.
    saw.store.set('watch:tk:job-9', stored({ owner: 'other', origin: 'me', checkedAt: 0 }))
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await clock.advance(0)
    await clock.advance(20_000)
    expect((saw.store.get('watch:tk:job-9') as Watch).owner).toBe('me')
    expect(saw.polled).toContain('job-9')
  })

  test('a run that finished in the session that took it over wakes the Claude that asked', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    saw.respond = argv => (argv[1] === 'job' ? JSON.stringify({ attributes: { status: 'running' } }) : undefined)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    await clock.advance(0)

    const mine = saw.store.get('watch:tk:job-1') as Watch
    saw.store.set('watch:tk:job-1', { ...mine, owner: 'other', status: 'passed', detail: 'completed', checkedAt: 1e15, endedAt: 1e15 })
    await clock.advance(20_000)
    expect(saw.prompts).toHaveLength(1)
    expect(saw.prompts[0]).toContain('[runwatch] Terrakube job job-1 finished: passed')
    // The session that saw it finish told the person; this one only tells Claude.
    expect(saw.toasts).toEqual([])
  })

  test("a rerun doesn't finish on the previous attempt's result", async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '✓ Requested rerun of run 99', stderr: '', interrupted: false, isImage: false } }) as never)
    saw.respond = argv =>
      argv[0] === 'gh' && argv[2] === 'view'
        ? JSON.stringify({ status: 'completed', conclusion: 'failure', workflowName: 'CI', url: 'https://github.com/o/r/actions/runs/99', jobs: [] })
        : undefined
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'Bash', command: 'gh run rerun 99 -R o/r' } as never)
    await clock.advance(0)
    expect((saw.store.get('watch:gha:o/r:99') as Watch).detail).toBe('starting')
    await clock.advance(20_000)
    expect(saw.toasts).toEqual([])
    await clock.advance(20_000)
    expect(saw.toasts).toEqual(['✗ GitHub Actions CI: failure'])
  })

  test('a dispatched workflow is matched to its run', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '✓ Created workflow_dispatch event', stderr: '', interrupted: false, isImage: false } }) as never)
    const url = 'https://github.com/o/r/actions/runs/555'
    saw.respond = argv => {
      if (argv[0] !== 'gh') return undefined
      if (argv[2] === 'list') return JSON.stringify([{ databaseId: 555, createdAt: new Date(0).toISOString(), url }])
      if (argv[2] === 'view' && argv[3] === '555') {
        return JSON.stringify({ status: 'in_progress', workflowName: 'Deploy', url, jobs: [{ name: 'plan', status: 'in_progress' }] })
      }
      return undefined
    }
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'Bash', command: 'gh workflow run deploy.yml -R o/r' } as never)
    await clock.advance(0)
    expect(saw.store.get('watch:gha:o/r:wf:deploy.yml')).toMatchObject({ run: '555', url, label: 'Deploy', status: 'running' })
  })

  test('a skill update that prunes the cached script is picked up on the next poll', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    saw.scripts = []
    host(on, saw)
    saw.respond = argv => {
      if (argv[1] !== 'job') return undefined
      saw.polled.push(argv[3] ?? '')
      saw.scripts?.push(argv[0] ?? '')
      if (argv[0]?.includes('/0.2.1/')) {
        saw.version = '0.2.2'
        return { exitCode: 127, stdout: '', stderr: 'no such file' }
      }
      return JSON.stringify({ attributes: { status: 'running' } })
    }
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    await clock.advance(0)
    await clock.advance(20_000)
    expect(saw.scripts.at(-1)).toContain('/terrakube/0.2.2/scripts/terrakube.sh')
    expect((saw.store.get('watch:tk:job-1') as Watch).misses).toBe(0)
  })

  test("a Jenkins estimate that goes away takes its ETA with it", async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    let calls = 0
    saw.respond = argv => {
      if (argv[1] !== 'build-info') return undefined
      const estimate = calls++ === 0 ? { timestamp: 1, estimatedDuration: 600_000 } : {}
      return JSON.stringify({ number: 41, building: true, result: null, ...estimate })
    }
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'jenkins', path: 'Platform/deploy', build: '41' } as never)
    await clock.advance(0)
    expect((saw.store.get('watch:jk:Platform/deploy:41') as Watch).eta).toBeGreaterThan(0)
    await clock.advance(20_000)
    expect((saw.store.get('watch:jk:Platform/deploy:41') as Watch).eta).toBeUndefined()
  })

  test('the status line counts runs only while the pane is off screen', async ($, on) => {
    const clock = mock.clock(on)
    const saw = seen()
    host(on, saw)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    await clock.advance(0)
    expect(saw.statuses.at(-1)).toBe('⟳ 1 running')

    saw.isPaneShown = true
    await $.command.run({ command: 'watch', args: '' } as never)
    expect(saw.statuses.at(-1)).toBeUndefined()
  })

  test("a service it can't reach says why, before the watch gives up", async ($, on) => {
    const clock = mock.clock(on)
    host(on, seen())
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'jenkins', path: 'grocery-site-qa-reset', build: '114882' } as never)
    await clock.advance(0)
    await clock.advance(20_000)

    const ui = await $.ui.mount({ plugin: 'runwatch', surface: 'terminal', component: 'Pane', requestId: 'runwatch', props: { bodyColumns: 100 } } as never)
    const pane = await ui.find({ type: 'Box' })
    expect(pane?.text).toMatch(/can't reach it \([1-5]\/6\): Error: credentials file not found/)
    await ui.unmount()
  })
})
