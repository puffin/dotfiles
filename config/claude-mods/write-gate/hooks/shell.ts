// Reads just enough of a shell command to say what a git push or gh pr call in
// it will do: the folder it runs in and its flags. Anything it cannot follow
// (a variable, a command substitution) is marked unknown rather than guessed.

export type Word = { text: string; isDynamic: boolean }
type Segment = { words: Word[]; heredoc: string | null; output: string | null }

// A folder from `cd` or `git -C`; null when a variable sets it.
export type Dir = string | null

export type Push = {
  kind: 'push'
  dirs: Dir[]
  remote: string
  refs: string[]
  isForce: boolean
  isDelete: boolean
  isUpstream: boolean
  isTags: boolean
}

export type PrCreate = {
  kind: 'pr create'
  dirs: Dir[]
  repo: string
  base: string
  head: string
  title: string
  // The description given inline (a heredoc is unwrapped), null when absent.
  body: string | null
  bodyFile: string
  isDraft: boolean
  isFill: boolean
  reviewers: string[]
  labels: string[]
}

export type PrMerge = {
  kind: 'pr merge'
  dirs: Dir[]
  repo: string
  pr: string
  method: string
  isDeleteBranch: boolean
  isAuto: boolean
}

export type Write = Push | PrCreate | PrMerge

// The writes in a command, and files it fills from a heredoc first
// (`cat > body.md <<EOF`), so a --body-file the command writes can be shown.
export type Shell = { writes: Write[]; files: Record<string, string> }

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
  const list = (name: string) => (values.get(name) ?? []).flatMap(w => w.text.split(',')).filter(Boolean)
  return { has: (name: string) => values.has(name), text, list, last: (name: string) => values.get(name)?.at(-1), positionals }
}

function spec(spellings: Record<string, string>, valued: string[]): Spec {
  return { spellings, valued: new Set(valued) }
}

const PUSH = spec(
  {
    '-u': 'upstream', '--set-upstream': 'upstream',
    '-f': 'force', '--force': 'force', '--force-with-lease': 'force',
    '-d': 'delete', '--delete': 'delete',
    '--tags': 'tags', '--follow-tags': 'tags',
    '--repo': 'repo', '-o': 'option', '--push-option': 'option', '--receive-pack': 'pack', '--exec': 'pack',
  },
  ['repo', 'option', 'pack'],
)

const CREATE = spec(
  {
    '-B': 'base', '--base': 'base', '-H': 'head', '--head': 'head',
    '-t': 'title', '--title': 'title', '-b': 'body', '--body': 'body', '-F': 'bodyFile', '--body-file': 'bodyFile',
    '-r': 'reviewer', '--reviewer': 'reviewer', '-l': 'label', '--label': 'label',
    '-a': 'assignee', '--assignee': 'assignee', '-m': 'milestone', '--milestone': 'milestone',
    '-p': 'project', '--project': 'project', '-T': 'template', '--template': 'template', '--recover': 'recover',
    '-R': 'repo', '--repo': 'repo',
    '-d': 'draft', '--draft': 'draft', '-f': 'fill', '--fill': 'fill', '--fill-first': 'fill', '--fill-verbose': 'fill',
  },
  ['base', 'head', 'title', 'body', 'bodyFile', 'reviewer', 'label', 'assignee', 'milestone', 'project', 'template', 'recover', 'repo'],
)

const MERGE = spec(
  {
    '-R': 'repo', '--repo': 'repo',
    '-s': 'squash', '--squash': 'squash', '-m': 'merge', '--merge': 'merge', '-r': 'rebase', '--rebase': 'rebase',
    '-d': 'deleteBranch', '--delete-branch': 'deleteBranch', '--auto': 'auto',
    '-t': 'subject', '--subject': 'subject', '-b': 'body', '--body': 'body', '-F': 'bodyFile', '--body-file': 'bodyFile',
    '-A': 'author', '--author-email': 'author', '--match-head-commit': 'sha',
  },
  ['repo', 'subject', 'body', 'bodyFile', 'author', 'sha'],
)

// The text of a `$(cat <<'EOF' ... EOF)` argument, or the argument as given.
export function unwrapHeredoc(text: string): string {
  const match = /^\$\(\s*cat\s*<<-?\s*(['"]?)([^'"\s)]+)\1[ \t]*\n([\s\S]*?)\n[ \t]*\2[ \t]*\n?\s*\)$/.exec(text)
  return match ? match[3]! : text
}

function push(words: Word[], dirs: Dir[]): Push {
  const flags = readFlags(words, PUSH)
  const [remote, ...refs] = flags.positionals.map(w => w.text)
  return {
    kind: 'push',
    dirs,
    remote: flags.text('repo') || remote || '',
    refs: refs.map(ref => ref.replace(/^\+/, '')),
    isForce: flags.has('force') || refs.some(ref => ref.startsWith('+')),
    isDelete: flags.has('delete'),
    isUpstream: flags.has('upstream'),
    isTags: flags.has('tags'),
  }
}

function prCreate(words: Word[], dirs: Dir[]): PrCreate {
  const flags = readFlags(words, CREATE)
  const body = flags.last('body')
  return {
    kind: 'pr create',
    dirs,
    repo: flags.text('repo'),
    base: flags.text('base'),
    head: flags.text('head'),
    title: flags.text('title'),
    body: body ? unwrapHeredoc(body.text) : null,
    bodyFile: flags.text('bodyFile'),
    isDraft: flags.has('draft'),
    isFill: flags.has('fill'),
    reviewers: flags.list('reviewer'),
    labels: flags.list('label'),
  }
}

function prMerge(words: Word[], dirs: Dir[]): PrMerge {
  const flags = readFlags(words, MERGE)
  return {
    kind: 'pr merge',
    dirs,
    repo: flags.text('repo'),
    pr: flags.positionals[0]?.text ?? '',
    method: ['squash', 'merge', 'rebase'].find(m => flags.has(m)) ?? '',
    isDeleteBranch: flags.has('deleteBranch'),
    isAuto: flags.has('auto'),
  }
}

const PREFIXES = new Set(['command', 'env', 'exec', 'sudo', 'time', 'nohup'])

// The writes in `command`, each with the cd and -C folders it runs under.
export function parseShell(command: string): Shell {
  const writes: Write[] = []
  const files: Record<string, string> = {}
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

    if (head.text === 'cat' && segment.heredoc !== null && segment.output) files[segment.output] = segment.heredoc
    if (head.text === 'cd') {
      const to = args.find(w => !w.text.startsWith('-') || w.text === '-')
      dirs.push(!to ? '~' : to.isDynamic || to.text === '-' ? null : to.text)
    }
    if (head.text === 'git') {
      const here = [...dirs]
      let k = 0
      while (k < args.length && args[k]!.text.startsWith('-')) {
        const flag = args[k]!.text
        if (flag === '-C') {
          const to = args[k + 1]
          here.push(!to || to.isDynamic ? null : to.text)
          k += 2
        } else if (['-c', '--git-dir', '--work-tree', '--namespace'].includes(flag)) {
          k += 2
        } else {
          k++
        }
      }
      if (args[k]?.text === 'push') writes.push(push(args.slice(k + 1), here))
    }
    if (head.text === 'gh' && args[0]?.text === 'pr') {
      if (args[1]?.text === 'create') writes.push(prCreate(args.slice(2), [...dirs]))
      if (args[1]?.text === 'merge') writes.push(prMerge(args.slice(2), [...dirs]))
    }
  }
  return { writes, files }
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
