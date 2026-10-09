import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

import { detect, elapsed, isPush, newestVersion, planSummary, readChecks, readJenkins, readPrState, readQueue, readTerrakube, terrakubeTail } from './watch'

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

describe('detect', () => {
  test('a confirmed terrakube run', () => {
    const seed = detect(
      '~/.claude/plugins/cache/ge-cloudops/terrakube/0.2.1/scripts/terrakube.sh run org-1 ws-1 tpl-1 main --confirm',
      '{ "id": "a1b2c3d4-0000", "status": "pending" }',
      '/repo',
    )
    expect(seed).toEqual({ id: 'tk:a1b2c3d4-0000', kind: 'terrakube', label: 'Terrakube job a1b2c3d4', org: 'org-1', job: 'a1b2c3d4-0000', wake: false })
  })

  test('a terrakube preview is not a run', () => {
    expect(detect('terrakube.sh run org-1 ws-1 tpl-1 main', 'Preview only.', '/repo')).toBeNull()
  })

  test('a jenkins trigger, by its queue item', () => {
    const headers = 'HTTP/2 201\r\nlocation: https://jenkins.example/queue/item/4711/\r\n'
    expect(detect('jenkins.sh trigger "Platform/deploy" ENV=dev', headers, '/repo')).toMatchObject({ kind: 'jenkins', path: 'Platform/deploy', queueId: '4711' })
  })

  test('gh pr create, by the URL it prints', () => {
    const seed = detect('gh pr create --draft --title x', 'https://github.com/giant-eagle/GE.CloudOps.ALZ.Vending/pull/42\n', '/repo')
    expect(seed).toMatchObject({ kind: 'pr', label: 'PR GE.CloudOps.ALZ.Vending#42', pr: 'https://github.com/giant-eagle/GE.CloudOps.ALZ.Vending/pull/42' })
  })

  test('git push is looked up separately', () => {
    expect(isPush('git push -u origin feat/x')).toBe(true)
    expect(isPush('git pull')).toBe(false)
    expect(detect('git push', '', '/repo')).toBeNull()
  })
})

describe('readers', () => {
  test('terrakube statuses', () => {
    expect(readTerrakube({ attributes: { status: 'running' } }).status).toBe('running')
    expect(readTerrakube({ attributes: { status: 'waitingApproval' } }).status).toBe('waiting')
    expect(readTerrakube({ attributes: { status: 'completed' } }).status).toBe('passed')
    expect(readTerrakube({ attributes: { status: 'failed' } }).status).toBe('failed')
    expect(readTerrakube({ attributes: { status: 'constructor' } }).status).toBe('running')
    expect(readTerrakube({ attributes: { status: 'completed' }, ui_url: RUN_URL }).url).toBe(RUN_URL)
    expect(readTerrakube({ attributes: { status: 'completed' } }).url).toBeUndefined()
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

  test('jenkins queue and builds', () => {
    expect(readQueue({ items: [{ id: 4711, why: 'Waiting for next available executor' }] }, '4711')?.detail).toBe('Waiting for next available executor')
    expect(readQueue({ items: [] }, '4711')).toBeNull()
    expect(readJenkins({ number: 41, building: true, result: null })).toMatchObject({ status: 'running', build: '41' })
    expect(readJenkins({ number: 41, building: false, result: 'SUCCESS', url: 'u' })).toMatchObject({ status: 'passed', detail: '#41 SUCCESS', url: 'u' })
    expect(readJenkins({ number: 41, building: false, result: 'UNSTABLE' }).status).toBe('failed')
  })

  test('pr checks', () => {
    expect(readChecks([]).status).toBe('queued')
    expect(readChecks([{ name: 'plan', bucket: 'pass' }, { name: 'lint', bucket: 'pending' }])).toMatchObject({ status: 'running', detail: '1/2 checks done' })
    expect(readChecks([{ name: 'plan', bucket: 'pass' }, { name: 'lint', bucket: 'fail' }])).toMatchObject({ status: 'failed', failing: ['✗ lint'] })
    expect(readChecks([{ name: 'plan', bucket: 'pass' }, { name: 'docs', bucket: 'skipping' }]).status).toBe('passed')
  })

  test('pr state', () => {
    expect(readPrState({ state: 'MERGED' })).toEqual({ status: 'passed', detail: 'merged' })
    expect(readPrState({ state: 'CLOSED' })).toEqual({ status: 'failed', detail: 'closed without merging' })
    expect(readPrState({ state: 'OPEN' })).toBeNull()
    expect(readPrState(undefined)).toBeNull()
  })

  test('helpers', () => {
    expect(newestVersion(['0.1.9', '0.2.1', '0.10.0', 'tmp'])).toBe('0.10.0')
    expect(elapsed(75_000)).toBe('1m15s')
  })
})

// Stands in for the host: a terrakube job that runs once, then completes.
function host(on: On, seen: { toasts: string[]; prompts: string[] }) {
  let polls = 0
  on('process.run', ($, e) => {
    const argv = (e as unknown as { argv: string[] }).argv
    const out = (stdout: string) => ({ value: { exitCode: 0, stdout, stderr: '' } }) as never
    if (argv[0] === 'printenv') return out('/home/me')
    if (argv[1] === 'job') return out(JSON.stringify({ id: 'job-1', attributes: { status: polls++ === 0 ? 'running' : 'completed' }, ui_url: RUN_URL }))
    if (argv[1] === 'step-log') return out(PLAN)
    if (argv[0] === 'gh' && argv[2] === 'view') return out(JSON.stringify({ state: 'MERGED' }))
    if (argv[0] === 'gh' && argv[2] === 'checks') return { value: { exitCode: 1, stdout: '', stderr: 'no checks reported' } } as never
    return { value: { exitCode: 1, stdout: '', stderr: 'unexpected' } } as never
  })
  on('fs.list', () => ({ value: [{ name: '0.2.1', kind: 'directory', size: 0, mtimeMs: 0, isLink: false }] }) as never)
  on('session.cwd', () => ({ value: '/repo' }) as never)
  on('session.start', () => ({ cwd: '/repo' }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('tool.register', () => ({ value: { tool: 'mcp__runwatch__watch' } }) as never)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }) as never)
  on('ui.status', () => ({ value: undefined }) as never)
  on('ui.toast', ($, e) => {
    seen.toasts.push((e as unknown as { text: string }).text)
    return { value: undefined } as never
  })
  on('prompt.submit', ($, e) => {
    seen.prompts.push((e as unknown as { text: string }).text)
    return { drop: 'test' } as never
  })
}

describe('runwatch', () => {
  test('a handed-off job toasts once and wakes Claude when it finishes', async ($, on) => {
    const clock = mock.clock(on)
    const seen = { toasts: [] as string[], prompts: [] as string[] }
    host(on, seen)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)

    const ran = await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    expect(String(ran.result)).toContain('Watching Terrakube job job-1')
    await clock.advance(0)
    expect(seen.toasts).toEqual([])

    await clock.advance(20_000)
    await clock.advance(20_000)
    expect(seen.toasts).toEqual(['✓ Terrakube job job-1: completed · plan: +2 ~0 -1'])
    expect(seen.prompts).toHaveLength(1)
    expect(seen.prompts[0]).toContain('[runwatch] Terrakube job job-1 finished: passed')
    expect(seen.prompts[0]).toContain(`Run: ${RUN_URL}`)
    expect(seen.prompts[0]).toContain('# azurerm_key_vault.this will be updated in-place')
    expect(seen.prompts[0]).not.toContain('log: ')
  })

  test('a merged PR with no checks finishes on the first poll', async ($, on) => {
    const clock = mock.clock(on)
    const seen = { toasts: [] as string[], prompts: [] as string[] }
    host(on, seen)
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)

    const ran = await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'pr', pr: 'https://github.com/o/r/pull/7' } as never)
    expect(String(ran.result)).toContain('Watching PR r#7')
    await clock.advance(0)
    await clock.advance(20_000)
    expect(seen.toasts).toEqual(['✓ PR r#7: merged'])
  })

  test('a long run link gets its own line, so the header keeps the status', async ($, on) => {
    const clock = mock.clock(on)
    host(on, { toasts: [], prompts: [] })
    await $.session.start({ source: 'startup', cwd: '/repo' } as never)
    await $.tool.call({ tool: 'mcp__runwatch__watch', kind: 'terrakube', org: 'alz-platform', job: 'job-1' } as never)
    await clock.advance(0)
    await clock.advance(20_000)

    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'runwatch', surface, component: 'Pane', requestId: 'runwatch', props: {} } as never)
      const head = await ui.find({ key: 'head-tk:job-1' })
      expect(head?.text).toContain('Terrakube job job-1')
      expect(JSON.stringify(head?.children)).not.toContain(RUN_URL)
      expect((await ui.find({ type: 'Link' }))?.props).toEqual({ href: RUN_URL, label: 'open' })
      await ui.unmount()
    }
  })
})
