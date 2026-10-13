// Reads just enough of a shell command to say what a `gh pr ready` in it will
// do: the folder it runs in and the PR it names. Anything it cannot follow
// (a variable, a command substitution) is marked unknown rather than guessed.

export type Word = { text: string; isDynamic: boolean }
type Segment = { words: Word[]; heredoc: string | null; output: string | null }

// A folder from `cd`; null when a variable sets it.
export type Dir = string | null

export type PrReady = {
  kind: 'pr ready'
  dirs: Dir[]
  repo: string
  pr: string
  // --undo turns the PR back into a draft, which is not gated.
  isUndo: boolean
}

export type Write = PrReady

const OPERATORS = ';&|()'
const DELIMITER_END = /[\s;&|<>()]/

// The index just past a `$(...)` starting at `i`, skipping quotes and heredocs
// inside it.
function substitutionEnd(source: string, i: number): number {
  let depth = 0
  const heredocs: { delimiter: string; isTabStripped: boolean }[] = []
  while (i < source.length) {
    const c = source[i]
    if (c === '\\') {
      i += 2
    } else if (c === "'") {
      const end = source.indexOf("'", i + 1)
      i = end < 0 ? source.length : end + 1
    } else if (c === '"') {
      i = quoteEnd(source, i)
    } else if (c === '<' && source[i + 1] === '<' && source[i + 2] !== '<') {
      i += 2
      const isTabStripped = source[i] === '-'
      if (isTabStripped) i++
      while (source[i] === ' ' || source[i] === '\t') i++
      let delimiter = ''
      while (i < source.length && !DELIMITER_END.test(source[i]!)) {
        if (!`'"\\`.includes(source[i]!)) delimiter += source[i]
        i++
      }
      heredocs.push({ delimiter, isTabStripped })
    } else if (c === '\n' && heredocs.length) {
      i = skipHeredocs(source, i + 1, heredocs.splice(0)).end
    } else {
      if (c === '(') depth++
      if (c === ')' && --depth === 0) return i + 1
      i++
    }
  }
  return source.length
}

// The index just past a double-quoted string starting at `i`.
function quoteEnd(source: string, i: number): number {
  i++
  while (i < source.length) {
    const c = source[i]
    if (c === '\\') i += 2
    else if (c === '$' && source[i + 1] === '(') i = substitutionEnd(source, i)
    else if (c === '"') return i + 1
    else i++
  }
  return source.length
}

// Reads heredoc bodies starting at line `i`, one per delimiter, in order.
function skipHeredocs(source: string, i: number, heredocs: { delimiter: string; isTabStripped: boolean }[]) {
  const bodies: string[] = []
  for (const { delimiter, isTabStripped } of heredocs) {
    const lines: string[] = []
    while (i < source.length) {
      let end = source.indexOf('\n', i)
      if (end < 0) end = source.length
      const raw = source.slice(i, end)
      const line = isTabStripped ? raw.replace(/^\t+/, '') : raw
      i = end + 1
      if (line === delimiter) break
      lines.push(line)
    }
    bodies.push(lines.join('\n'))
  }
  return { end: i, bodies }
}

// Splits a command into simple commands at ; && || | ( ) and newlines, each
// with its words unquoted, its heredoc body and its stdout redirect.
export function lex(source: string): Segment[] {
  const segments: Segment[] = []
  const heredocs: { delimiter: string; isTabStripped: boolean; segment: Segment }[] = []
  let segment: Segment = { words: [], heredoc: null, output: null }
  let text: string | null = null
  let isDynamic = false
  let redirect: 'output' | 'skip' | null = null
  let i = 0

  const append = (s: string) => {
    text = (text ?? '') + s
  }
  const endWord = () => {
    if (text === null) return
    if (redirect === 'output') segment.output = text
    else if (redirect !== 'skip') segment.words.push({ text, isDynamic })
    redirect = null
    text = null
    isDynamic = false
  }
  const endSegment = () => {
    endWord()
    if (segment.words.length) segments.push(segment)
    segment = { words: [], heredoc: null, output: null }
  }
  const substitution = () => {
    const end = substitutionEnd(source, i)
    append(source.slice(i, end))
    isDynamic = true
    i = end
  }
  const backtick = () => {
    const end = source.indexOf('`', i + 1)
    const stop = end < 0 ? source.length : end + 1
    append(source.slice(i, stop))
    isDynamic = true
    i = stop
  }

  while (i < source.length) {
    const c = source[i]!
    const next = source[i + 1]
    if (c === ' ' || c === '\t') {
      endWord()
      i++
    } else if (c === '\n') {
      endSegment()
      i++
      if (heredocs.length) {
        const pending = heredocs.splice(0)
        const { end, bodies } = skipHeredocs(source, i, pending)
        pending.forEach((h, k) => (h.segment.heredoc = bodies[k] ?? ''))
        i = end
      }
    } else if (c === '#' && text === null) {
      while (i < source.length && source[i] !== '\n') i++
    } else if (c === '\\') {
      if (next !== '\n') append(next ?? '')
      i += 2
    } else if (c === "'") {
      const end = source.indexOf("'", i + 1)
      const stop = end < 0 ? source.length : end
      append(source.slice(i + 1, stop))
      i = stop + 1
    } else if (c === '"') {
      append('')
      i++
      while (i < source.length && source[i] !== '"') {
        const d = source[i]!
        if (d === '\\' && '"\\$`\n'.includes(source[i + 1] ?? '')) {
          if (source[i + 1] !== '\n') append(source[i + 1]!)
          i += 2
        } else if (d === '$' && source[i + 1] === '(') {
          substitution()
        } else if (d === '`') {
          backtick()
        } else {
          if (d === '$' && /[\w{]/.test(source[i + 1] ?? '')) isDynamic = true
          append(d)
          i++
        }
      }
      i++
    } else if (c === '$' && next === '(') {
      substitution()
    } else if (c === '`') {
      backtick()
    } else if (c === '>' || c === '<' || (c === '&' && next === '>')) {
      // A file descriptor written right before belongs to the redirection.
      if (text !== null && /^\d+$/.test(text)) {
        text = null
        isDynamic = false
      } else {
        endWord()
      }
      if (c === '<' && next === '<' && source[i + 2] === '<') {
        i += 3
        redirect = 'skip'
      } else if (c === '<' && next === '<') {
        i += 2
        const isTabStripped = source[i] === '-'
        if (isTabStripped) i++
        while (source[i] === ' ' || source[i] === '\t') i++
        let delimiter = ''
        while (i < source.length && !DELIMITER_END.test(source[i]!)) {
          if (!`'"\\`.includes(source[i]!)) delimiter += source[i]
          i++
        }
        heredocs.push({ delimiter, isTabStripped, segment })
      } else {
        if (c === '&') i++
        const isOutput = source[i] === '>'
        i++
        if (source[i] === '>' || source[i] === '|') i++
        if (source[i] === '&' && /[\d-]/.test(source[i + 1] ?? '')) {
          i++
          while (/[\d-]/.test(source[i] ?? '')) i++
        } else {
          if (source[i] === '&') i++
          redirect = isOutput ? 'output' : 'skip'
        }
      }
    } else if (OPERATORS.includes(c)) {
      endSegment()
      i++
      if ((c === '&' || c === '|') && (source[i] === c || (c === '|' && source[i] === '&'))) i++
    } else {
      if (c === '$') isDynamic = true
      append(c)
      i++
    }
  }
  endSegment()
  return segments
}

// Flag spellings to a name; `valued` names take the next word (or =value).
type Spec = { spellings: Record<string, string>; valued: ReadonlySet<string> }

function readFlags(words: Word[], { spellings, valued }: Spec) {
  const values = new Map<string, Word[]>()
  const positionals: Word[] = []
  const add = (name: string, word: Word) => values.set(name, [...(values.get(name) ?? []), word])
  for (let k = 0; k < words.length; k++) {
    const word = words[k]!
    const raw = word.text
    if (raw === '--') {
      positionals.push(...words.slice(k + 1))
      break
    }
    if (!raw.startsWith('-') || raw === '-') {
      positionals.push(word)
      continue
    }
    const eq = raw.startsWith('--') ? raw.indexOf('=') : -1
    const name = spellings[eq > 0 ? raw.slice(0, eq) : raw]
    const attached = spellings[raw.slice(0, 2)]
    if (name && valued.has(name)) {
      if (eq > 0) add(name, { ...word, text: raw.slice(eq + 1) })
      else add(name, words[++k] ?? { text: '', isDynamic: false })
    } else if (name) {
      add(name, word)
    } else if (!raw.startsWith('--') && attached && valued.has(attached)) {
      add(attached, { ...word, text: raw.slice(2) })
    } else if (/^-[a-zA-Z]{2,}$/.test(raw)) {
      for (const letter of raw.slice(1)) {
        const short = spellings[`-${letter}`]
        if (short) add(short, word)
      }
    }
  }
  const text = (name: string) => values.get(name)?.at(-1)?.text ?? ''
  return { has: (name: string) => values.has(name), text, positionals }
}

function spec(spellings: Record<string, string>, valued: string[]): Spec {
  return { spellings, valued: new Set(valued) }
}

const READY = spec({ '-R': 'repo', '--repo': 'repo', '--undo': 'undo' }, ['repo'])

function prReady(words: Word[], dirs: Dir[]): PrReady {
  const flags = readFlags(words, READY)
  return { kind: 'pr ready', dirs, repo: flags.text('repo'), pr: flags.positionals[0]?.text ?? '', isUndo: flags.has('undo') }
}

const PREFIXES = new Set(['command', 'env', 'exec', 'sudo', 'time', 'nohup'])

// The writes in `command`, each with the cd folders it runs under.
export function parseShell(command: string): Write[] {
  const writes: Write[] = []
  const dirs: Dir[] = []
  for (const segment of lex(command)) {
    let start = 0
    while (start < segment.words.length) {
      const text = segment.words[start]!.text
      if (!PREFIXES.has(text) && !/^[A-Za-z_]\w*=/.test(text)) break
      start++
    }
    const [head, ...args] = segment.words.slice(start)
    if (!head) continue

    if (head.text === 'cd') {
      const to = args.find(w => !w.text.startsWith('-') || w.text === '-')
      dirs.push(!to ? '~' : to.isDynamic || to.text === '-' ? null : to.text)
    }
    if (head.text === 'gh' && args[0]?.text === 'pr' && args[1]?.text === 'ready') writes.push(prReady(args.slice(2), [...dirs]))
  }
  return writes
}

// Follows the folders from `cwd`: ~ is `home`, a relative one joins the last.
// Null when a variable set one of them.
export function resolveDir(dirs: Dir[], cwd: string, home: string): string | null {
  let at = cwd
  for (const dir of dirs) {
    if (dir === null) return null
    const expanded = dir === '~' ? home : dir.startsWith('~/') ? home + dir.slice(1) : dir
    at = expanded.startsWith('/') ? expanded : `${at.replace(/\/$/, '')}/${expanded}`
  }
  return at
}

// owner/name from a git remote URL (https or ssh), '' when it does not look like one.
export function repoFromUrl(url: string): string {
  const match = /[:/]([^/:]+\/[^/]+?)(?:\.git)?\/?$/.exec(url.trim())
  return match ? match[1]! : ''
}
