import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Gauge } from '../types'

// Thresholds are a share of the model's context window, so they follow the
// model: a band from WARN_PCT, turning red from HOT_PCT.
const WARN_PCT = 50
const HOT_PCT = 75
const BAR_CELLS = 10

const gauge = atom({ plugin: 'context-gauge', key: 'gauge' } as const, null)
const isHidden = atom({ plugin: 'context-gauge', key: 'isHidden' } as const, false)
// Drawn at the end of the prompt's hint line: a $.ui.status entry would carry
// the plugin's name as a label.
const line = atom({ plugin: 'context-gauge', key: 'line' } as const, '')

const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

const bar = (percent: number) => {
  const filled = Math.min(BAR_CELLS, Math.round((percent / 100) * BAR_CELLS))
  return '▰'.repeat(filled) + '▱'.repeat(BAR_CELLS - filled)
}

async function refresh($: EngineInterface) {
  const usage = (await $.session.usage()).context
  if (usage.tokens === undefined) {
    await update($, gauge, () => null)
    await update($, line, () => '')
    return
  }
  const percent = usage.percent ?? Math.round((usage.tokens / usage.window) * 100)
  const next: Gauge = { tokens: usage.tokens, percent }
  await update($, gauge, () => next)
  await update($, line, () => `ctx ${bar(percent)} ${percent}% · ${fmt(usage.tokens)}`)

  if (percent < WARN_PCT) await update($, isHidden, () => false)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  // turn.step streams, so its hook is a generator; refresh after each main-thread response.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined) await refresh($)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    return result
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    const tail = await read($, line)
    return next(tail ? { ...e, props: { ...e.props, tail: `  ${tail}` } } : e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const g = await read($, gauge)
    if (e.props.hasSurvey || g === null || g.percent < WARN_PCT || (await read($, isHidden))) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const isHot = g.percent >= HOT_PCT

    return (
      <Box>
        <Text color={isHot ? 'red' : 'yellow'}>
          Context is {fmt(g.tokens)} ({g.percent}%). Switching tasks? /clear first.{' '}
        </Text>
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
