import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Doc, Theme } from '../types'

const PANE = 'preview'
// A Markdown element takes at most 10000 characters.
const CHUNK_MAX = 9000

const doc = atom({ plugin: 'preview', key: 'doc' } as const, null)
const theme = atom({ plugin: 'preview', key: 'theme' } as const, 'dark')

let home: string | null = null

async function readTheme($: EngineInterface): Promise<Theme> {
  if (home === null) home = (await $.process.run(['printenv', 'HOME'])).stdout.trim()
  const text = await $.fs.read(THEME_FILE.replace('~', home)).catch(() => '')
  return text.includes('one-light') ? 'light' : 'dark'
}

// Named terminal colors, so the pane follows the terminal's light/dark theme.
const ACCENT = 'cyan'
const MUTED = 'gray'
const BAR_BG = 'blackBright'
// glow's theme follows bin/toggle-theme, which copies the live theme here.
const THEME_FILE = '~/.dotfiles/config/alacritty/theme-current.toml'
const THEME_POLL_MS = 3000
// glow styles shipped with the mod, built from the One Dark / One Light palettes.
const GLOW_STYLE = { dark: 'styles/one-dark.json', light: 'styles/one-light.json' } as const

async function load(path: string, readFile: (path: string) => Promise<string>): Promise<Doc> {
  return readFile(path)
    .then(text => ({ path, text }))
    .catch(() => ({ path, error: `Could not read ${path}` }))
}

const basename = (path: string) => path.split('/').pop() || path
// The folder, kept short for the header: its last two parts when it is long.
function dirname(path: string) {
  const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.'
  if (dir.length <= 32) return dir
  return `…/${dir.split('/').slice(-2).join('/')}`
}

type Segment = { kind: 'markdown'; text: string } | { kind: 'mermaid'; source: string }

// Mermaid fences become their own segments; the markdown between them is cut
// at blank lines outside code fences so no block is split in half.
function segment(text: string) {
  const segments: Segment[] = []
  let current = ''
  let fence: 'mermaid' | 'code' | null = null
  let mermaid = ''

  const flush = () => {
    if (current.trim()) segments.push({ kind: 'markdown', text: current.slice(0, CHUNK_MAX) })
    current = ''
  }

  for (const line of text.split('\n')) {
    const isFence = /^\s*(```|~~~)/.test(line)
    if (fence === null && isFence && /^\s*(```|~~~)\s*mermaid\b/.test(line)) {
      flush()
      fence = 'mermaid'
      mermaid = ''
      continue
    }
    if (fence === 'mermaid') {
      if (isFence) {
        segments.push({ kind: 'mermaid', source: mermaid })
        fence = null
      } else {
        mermaid += `${line}\n`
      }
      continue
    }
    if (isFence) fence = fence === null ? 'code' : null
    if (fence === null && line.trim() === '' && current.length > CHUNK_MAX * 0.8) flush()
    current += `${line}\n`
  }
  flush()
  return segments
}

// Rendered diagrams by width and source: termaid is a process, run once each.
const diagrams = new Map<string, string | null>()

async function diagram($: EngineInterface, source: string, width: number) {
  const key = `${width}\n${source}`
  if (!diagrams.has(key)) {
    const { exitCode, stdout } = await $.process
      .run(['termaid', '--width', String(width), '--gap', '2', '--padding-y', '1'], {
        stdin: source,
        timeoutMs: 10_000,
      })
      .catch(() => ({ exitCode: 1, stdout: '' }))
    diagrams.set(key, exitCode === 0 && stdout.trim() ? stdout.replace(/\n+$/, '') : null)
  }
  return diagrams.get(key) ?? null
}

// glow prints ANSI escapes, which Text refuses: parse its SGR codes into
// styled spans and drop the rest (OSC 8 links and other sequences).
type Span = { text: string; color?: string; backgroundColor?: string; bold?: boolean; italic?: boolean; underline?: boolean }

const NAMED = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']

function color256(n: number) {
  // The 16 base colors stay named, so they follow the terminal's theme.
  if (n < 8) return NAMED[n]
  if (n < 16) return `${NAMED[n - 8]}Bright`
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  if (n >= 232) {
    const v = 8 + (n - 232) * 10
    return `#${hex(v)}${hex(v)}${hex(v)}`
  }
  const c = n - 16
  const level = (v: number) => (v === 0 ? 0 : 55 + v * 40)
  return `#${hex(level(Math.floor(c / 36)))}${hex(level(Math.floor(c / 6) % 6))}${hex(level(c % 6))}`
}

function applySgr(style: Omit<Span, 'text'>, params: string) {
  const codes = params === '' ? [0] : params.split(';').map(Number)
  let next = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]
    if (code === 0) next = {}
    else if (code === 1) next.bold = true
    else if (code === 3) next.italic = true
    else if (code === 4) next.underline = true
    else if (code === 22) next.bold = false
    else if (code === 23) next.italic = false
    else if (code === 24) next.underline = false
    else if (code === 39) next.color = undefined
    else if (code === 49) next.backgroundColor = undefined
    else if (code >= 30 && code <= 37) next.color = NAMED[code - 30]
    else if (code >= 90 && code <= 97) next.color = `${NAMED[code - 90]}Bright`
    else if (code >= 40 && code <= 47) next.backgroundColor = NAMED[code - 40]
    else if ((code === 38 || code === 48) && codes[i + 1] === 5) {
      const value = color256(codes[i + 2])
      if (code === 38) next.color = value
      else next.backgroundColor = value
      i += 2
    } else if ((code === 38 || code === 48) && codes[i + 1] === 2) {
      const hex = (v: number) => (v || 0).toString(16).padStart(2, '0')
      const value = `#${hex(codes[i + 2])}${hex(codes[i + 3])}${hex(codes[i + 4])}`
      if (code === 38) next.color = value
      else next.backgroundColor = value
      i += 4
    }
  }
  return next
}

const sameStyle = (a: Omit<Span, 'text'>, b: Omit<Span, 'text'>) =>
  a.color === b.color && a.backgroundColor === b.backgroundColor && !!a.bold === !!b.bold &&
  !!a.italic === !!b.italic && !!a.underline === !!b.underline

function parseAnsi(output: string) {
  const clean = output
    .replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, '') // OSC: hyperlinks, titles
    .replace(/\r/g, '')
  return clean.split('\n').map(line => {
    const spans: Span[] = []
    let style: Omit<Span, 'text'> = {}
    const parts = line.split(/(\x1b\[[0-9;]*[A-Za-z])/)
    for (const part of parts) {
      const sgr = /^\x1b\[([0-9;]*)m$/.exec(part)
      if (sgr) {
        style = applySgr(style, sgr[1])
        continue
      }
      if (part.startsWith('\x1b') || part === '') continue
      const text = part.replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
      const last = spans[spans.length - 1]
      if (last && sameStyle(last, style)) last.text += text
      else spans.push({ ...style, text })
    }
    return spans
  })
}

// Rendered markdown by width and text: glow is a process, run once each.
const rendered = new Map<string, Span[][] | null>()

async function glow($: EngineInterface, text: string, width: number, style: Theme) {
  const key = `${style}\n${width}\n${text}`
  if (!rendered.has(key)) {
    const { exitCode, stdout } = await $.process
      .run(['glow', '-s', `${$.plugin.root}/${GLOW_STYLE[style]}`, '-w', String(width), '-'], {
        stdin: text,
        env: { CLICOLOR_FORCE: '1' },
        timeoutMs: 10_000,
      })
      .catch(() => ({ exitCode: 1, stdout: '' }))
    rendered.set(key, exitCode === 0 && stdout.trim() ? parseAnsi(stdout.replace(/\n+$/, '')) : null)
  }
  return rendered.get(key) ?? null
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'preview',
      description: 'Render a markdown file in a side pane (default README.md)',
    })
    const sync = async () => {
      const now = await readTheme($)
      // Writing only on a change keeps the pane from redrawing every poll.
      if (now !== (await read($, theme))) await update($, theme, () => now)
    }
    await sync()
    $.clock.every(THEME_POLL_MS, () => void sync())
    return next(e)
  })

  on('command.run', { command: 'preview' }, async ($, e) => {
    // Resolved once against the session's folder, so reload reads the same file
    // even if the folder changes, and an error names the full path.
    const arg = e.args.trim() || 'README.md'
    const path = arg.startsWith('/') ? arg : `${await $.session.cwd()}/${arg}`
    const loaded = await load(path, p => $.fs.read(p))
    await update($, doc, () => loaded)
    // The frame draws its own close button; Escape closes it too while it has the keys.
    await $.ui.open({ id: PANE, title: basename(path), closeOnEscape: true })

    return { text: `Previewing ${arg}.` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const current = await read($, doc)

    if (current === null) return <Text dimColor>Run /preview &lt;file.md&gt;</Text>

    const columns = e.props.bodyColumns
    const style = await read($, theme)
    const reload = async () => {
      const fresh = await load(current.path, p => $.fs.read(p))
      await update($, doc, () => fresh)
    }

    const header = (
      <Box key="header" backgroundColor={BAR_BG} paddingX={1} justifyContent="space-between" width={columns}>
        <Box gap={1}>
          <Text color={ACCENT} bold>
            ◆ {basename(current.path)}
          </Text>
          <Text color={MUTED} wrap="truncate-start">
            {dirname(current.path)}
          </Text>
        </Box>
        <Box gap={2}>
          <Button key="reload" label="↻ reload" hotkey="r" plain onPress={reload} />
          <Button key="close" label="close" hotkey="c" plain onPress={() => $.ui.close({ id: PANE })} />
        </Box>
      </Box>
    )

    const footer = (
      <Box key="footer" paddingX={1} marginTop={1}>
        <Text color={MUTED}>ctrl+x tab to focus · r reload · c or esc close</Text>
      </Box>
    )

    if ('error' in current) {
      return (
        <Box flexDirection="column">
          {header}
          <Box paddingX={2} marginTop={1}>
            <Text color="red">{current.error}</Text>
          </Box>
          {footer}
        </Box>
      )
    }

    // Body sits inside 2 columns of padding each side; a card adds a border and 1 of padding.
    const cardWidth = Math.max(20, columns - 8)
    const blocks = await Promise.all(
      segment(current.text).map(async (part, i) => {
        if (part.kind === 'markdown') {
          const lines = await glow($, part.text, columns - 2, style)
          // glow missing or failed: Claude Code's own renderer.
          if (lines === null) return <Markdown key={`m${i}`} text={part.text} />

          return (
            <Box key={`g${i}`} flexDirection="column">
              {lines.map((spans, j) => (
                <Text key={`g${i}-${j}`} wrap="truncate-end">
                  {spans.length === 0 ? ' ' : spans.map(({ text, ...style }) => <Text {...style}>{text}</Text>)}
                </Text>
              ))}
            </Box>
          )
        }

        const art = await diagram($, part.source, cardWidth)
        // termaid cannot draw it (type unsupported, or not installed): show the source.
        if (art === null) return <Markdown key={`m${i}`} text={`\`\`\`mermaid\n${part.source}\`\`\``} />

        return (
          <Box key={`d${i}`} flexDirection="column" marginY={1}>
            <Text color={MUTED}> mermaid</Text>
            <Box flexDirection="column" borderStyle="round" borderColor={MUTED} paddingX={1}>
              {art.split('\n').map((line, j) => (
                <Text key={`d${i}-${j}`} wrap="truncate-end">
                  {line}
                </Text>
              ))}
            </Box>
          </Box>
        )
      }),
    )

    return (
      <Box flexDirection="column">
        {header}
        <Box flexDirection="column" paddingX={1} marginTop={1}>
          {blocks}
        </Box>
        {footer}
      </Box>
    )
  })
}
