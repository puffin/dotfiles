import type { Bucket, Item, Queue, Shared } from '../types'

const DAY_MS = 86_400_000

// The part of the dock's section contract this mod fills (the dock mod's
// types/index.d.ts). The dock is optional, not a dependency, so it is spelled here.
export type DockRow = {
  key: string
  icon?: string
  iconColor?: string
  label: string
  aside?: string
  detail?: string
  meta?: string
  href?: string
  title?: string
  lines?: { text: string; color?: string }[]
}
export type DockGroup = { key: string; title: string; rows: DockRow[]; isFolded?: boolean }
export type DockAction = { id: string; label: string; hotkey?: string; scope: 'row' | 'section' }
export type DockSection = {
  id: string
  title: string
  order?: number
  badge?: string
  attention?: number
  groups: DockGroup[]
  actions?: DockAction[]
  footer?: string
  error?: string
}

// Both searches in one request. `@me` is whoever the token belongs to;
// `$login` names the same account for the reviews filter. `review-requested:@me`
// also matches a request to any team you are on: your teams, and who each PR
// still asks, tell the two apart.
export const QUERY = `
query($requested: String!, $reviewed: String!, $login: String!) {
  viewer { organizations(first: 20) { nodes { teams(first: 100, userLogins: [$login]) { nodes { slug } } } } }
  requested: search(query: $requested, type: ISSUE, first: 50) { nodes { ...pr } }
  reviewed: search(query: $reviewed, type: ISSUE, first: 50) { nodes { ...pr } }
}
fragment pr on PullRequest {
  number title url isDraft createdAt updatedAt headRefOid
  repository { nameWithOwner }
  author { __typename login }
  reviewRequests(first: 20) {
    nodes { requestedReviewer { __typename ... on User { login } ... on Team { slug } } }
  }
  reviews(author: $login, last: 1, states: [APPROVED, CHANGES_REQUESTED, COMMENTED, DISMISSED]) {
    nodes { state submittedAt commit { oid } }
  }
  commits(last: 1) { nodes { commit { committedDate } } }
  timelineItems(last: 20, itemTypes: [REVIEW_REQUESTED_EVENT]) {
    nodes { ... on ReviewRequestedEvent { createdAt requestedReviewer { __typename ... on User { login } } } }
  }
}`

export function searches(org: string) {
  const scope = `is:pr is:open archived:false sort:updated-desc${org ? ` org:${org}` : ''}`
  return { requested: `${scope} review-requested:@me`, reviewed: `${scope} reviewed-by:@me -author:@me` }
}

type ReviewState = 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED'
export type PrNode = {
  number: number
  title: string
  url: string
  isDraft: boolean
  createdAt: string
  updatedAt: string
  headRefOid: string
  repository: { nameWithOwner: string }
  author: { __typename: string; login: string } | null
  reviewRequests: { nodes: ({ requestedReviewer: { __typename: string; login?: string; slug?: string } | null } | null)[] }
  reviews:{ nodes: { state: ReviewState; submittedAt: string; commit: { oid: string } | null }[] }
  commits: { nodes: { commit: { committedDate: string } }[] }
  timelineItems: { nodes: ({ createdAt?: string; requestedReviewer?: { __typename: string; login?: string } | null } | null)[] }
}
type Teams = { organizations: { nodes: ({ teams: { nodes: ({ slug: string } | null)[] } } | null)[] } }
export type SearchResult = {
  data?: { viewer?: Teams; requested: { nodes: (PrNode | null)[] }; reviewed: { nodes: (PrNode | null)[] } }
  errors?: { message: string }[]
}

export type Settings = { login: string; staleDays: number; skipAuthors: RegExp | null }

const time = (iso: string | undefined) => (iso ? Date.parse(iso) : 0)

// When you were last asked: a request naming you, else one naming a team you
// may be on, else the PR's opening.
function requestedAt(pr: PrNode, login: string) {
  const events = pr.timelineItems.nodes.filter(n => n?.createdAt)
  const mine = events.filter(n => n?.requestedReviewer?.login === login)
  const pick = (mine.length ? mine : events.filter(n => n?.requestedReviewer?.__typename === 'Team')).at(-1)
  return time(pick?.createdAt) || time(pr.createdAt)
}

// The teams a PR still asks for you through, when it does not name you: yours
// among them, else every team it asks. Undefined when it names you, or no team.
function viaTeams(pr: PrNode, login: string, mine: ReadonlySet<string>) {
  const asked = pr.reviewRequests.nodes.map(n => n?.requestedReviewer).filter(r => !!r)
  if (asked.some(r => r.login === login)) return undefined
  const teams = asked.filter(r => r.__typename === 'Team' && r.slug).map(r => r.slug!)
  const ours = teams.filter(team => mine.has(team))
  return ours.length ? ours : teams.length ? teams : undefined
}

function isSkipped(pr: PrNode, s: Settings) {
  const author = pr.author
  if (pr.isDraft || !author) return true
  if (author.__typename === 'Bot') return true
  if (author.login === s.login) return true
  return s.skipAuthors?.test(author.login) ?? false
}

// Which bucket a PR is in for you, and since when; undefined when it needs
// nothing from you (you approved it, or it is a draft, a bot's, your own).
// A first request that reaches you only through a team is a Team request.
type Where = Pick<Item, 'bucket' | 'reason' | 'since' | 'reviewedCommit'>

export function classify(pr: PrNode, isRequested: boolean, s: Settings, teams: ReadonlySet<string> = new Set()): Where | undefined {
  if (isSkipped(pr, s)) return undefined
  const mine = pr.reviews.nodes.at(-1)
  const reviewedCommit = mine?.commit?.oid
  if (isRequested) {
    const via = viaTeams(pr, s.login, teams)
    const how = via ? ` via ${via.join(', ')}` : ''
    if (mine) return { bucket: 'rereview', reason: `re-requested${how}`, since: requestedAt(pr, s.login), reviewedCommit }
    return { bucket: via ? 'team' : 'review', reason: `requested${how}`, since: requestedAt(pr, s.login) }
  }
  if (!mine || mine.state === 'APPROVED') return undefined
  // Commit dates lie after a rebase; whether your review sat on today's head does not.
  if (reviewedCommit !== pr.headRefOid) {
    const pushed = time(pr.commits.nodes.at(-1)?.commit.committedDate)
    return { bucket: 'rereview', reason: 'new commits', since: Math.max(pushed, time(mine.submittedAt)), reviewedCommit }
  }
  const reason = mine.state === 'CHANGES_REQUESTED' ? 'changes requested' : mine.state === 'COMMENTED' ? 'commented' : 'dismissed'
  return { bucket: 'waiting', reason, since: time(mine.submittedAt), reviewedCommit }
}

export function toQueue(result: SearchResult, s: Settings, now: number): Queue {
  const data = result.data
  if (!data) return { items: [], stale: 0, fetchedAt: now, error: result.errors?.[0]?.message ?? 'no data' }
  const requested = new Set(data.requested.nodes.filter(Boolean).map(pr => pr!.url))
  const teams = new Set(data.viewer?.organizations.nodes.flatMap(org => org?.teams.nodes.map(team => team?.slug ?? '') ?? []).filter(Boolean))
  const seen = new Map<string, PrNode>()
  for (const pr of [...data.requested.nodes, ...data.reviewed.nodes]) if (pr && !seen.has(pr.url)) seen.set(pr.url, pr)

  const items: Item[] = []
  let stale = 0
  for (const pr of seen.values()) {
    const where = classify(pr, requested.has(pr.url), s, teams)
    if (!where) continue
    // A request stands until someone acts on the PR; a re-review or a wait is as
    // old as the push or review behind it, whatever has touched the PR since.
    const lastMoved = where.bucket === 'review' || where.bucket === 'team' ? time(pr.updatedAt) : where.since
    if (now - lastMoved > s.staleDays * DAY_MS) {
      stale += 1
      continue
    }
    // Left out rather than undefined: the item is stored as plain JSON.
    const { reviewedCommit, ...rest } = where
    items.push({
      url: pr.url,
      repo: pr.repository.nameWithOwner,
      number: pr.number,
      title: pr.title.trim(),
      author: pr.author?.login ?? '?',
      ...rest,
      ...(reviewedCommit ? { reviewedCommit } : {}),
    })
  }
  items.sort((a, b) => b.since - a.since)
  return { items, stale, fetchedAt: now }
}

export function byBucket(queue: Queue, bucket: Bucket) {
  return queue.items.filter(item => item.bucket === bucket)
}

export function age(ms: number) {
  if (ms < 3_600_000) return `${Math.max(1, Math.round(ms / 60_000))}m`
  if (ms < DAY_MS) return `${Math.round(ms / 3_600_000)}h`
  return `${Math.round(ms / DAY_MS)}d`
}

// Each bucket's look, as runwatch gives each status an icon and a color.
const GROUPS: { bucket: Bucket; title: string; icon: string; color: string; isFolded?: boolean }[] = [
  { bucket: 'rereview', title: 'Re-review', icon: '⟲', color: 'yellow' },
  { bucket: 'review', title: 'Review', icon: '○', color: 'cyan' },
  { bucket: 'team', title: 'Team request', icon: '◌', color: 'blue', isFolded: true },
  { bucket: 'waiting', title: 'Waiting on author', icon: '‖', color: 'gray', isFolded: true },
]

// `⟲ 2 re-review · 8 review`, as runwatch's `⟳ 1 running`.
export function badge(queue: Queue) {
  const re = byBucket(queue, 'rereview').length
  const asked = byBucket(queue, 'review').length
  const parts = [re && `${re} re-review`, asked && `${asked} review`].filter(Boolean)
  return parts.length ? `${re ? '⟲' : '○'} ${parts.join(' · ')}` : ''
}

// `giant-eagle/GE.Corporate.CloudOps.Infra` reads as `Corporate.Infra`: the org,
// the `GE.` lead and the `CloudOps.` every infra repo carries say nothing here.
export const shortRepo = (repo: string) =>
  (repo.split('/').pop() ?? repo).replace(/^GE\./, '').replace(/(^|\.)CloudOps\./, '$1') || repo

function clockTime(ms: number) {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const ACTIONS: NonNullable<DockSection['actions']> = [
  { id: 'ask', label: 'ask Claude', hotkey: 'a', scope: 'row' },
  { id: 'refresh', label: 'refresh', hotkey: 'r', scope: 'section' },
]

export function toSection(queue: Queue, now: number): DockSection {
  const footer = [`updated ${clockTime(queue.fetchedAt)}`, queue.stale && `${queue.stale} stale hidden`].filter(Boolean).join(' · ')
  return {
    id: 'reviews',
    title: 'Reviews',
    order: 10,
    badge: badge(queue),
    attention: byBucket(queue, 'rereview').length,
    groups: GROUPS.map(g => ({
      key: g.bucket,
      title: g.title,
      isFolded: g.isFolded,
      rows: byBucket(queue, g.bucket).map(item => ({
        key: item.url,
        icon: g.icon,
        iconColor: g.color,
        label: `${shortRepo(item.repo)}#${item.number}`,
        aside: item.author,
        detail: item.title,
        meta: age(now - item.since),
        href: item.url,
        title: item.title,
        lines: [
          { text: `${item.repo}#${item.number} by ${item.author}` },
          { text: `${item.reason} ${age(now - item.since)} ago`, color: g.color },
          ...(item.reviewedCommit ? [{ text: `you last reviewed ${item.reviewedCommit.slice(0, 7)}` }] : []),
        ],
      })),
    })),
    actions: ACTIONS,
    footer,
    error: queue.error,
  }
}

// What "ask Claude" sends: the PR, where it stands for you, and what to look
// at. Nothing is posted: the review stays yours to write.
export function askText(item: Item) {
  const pr = `${item.url} (${item.repo}#${item.number} "${item.title}" by ${item.author})`
  const since = item.reviewedCommit ? ` I last reviewed commit ${item.reviewedCommit.slice(0, 7)}.` : ''
  const ask =
    item.bucket === 'rereview'
      ? `Re-review ${pr}: ${item.reason}.${since} Look at what changed since my last review, check whether my earlier comments were addressed, and tell me what is still open.`
      : item.bucket === 'review'
        ? `Review ${pr}: my review was requested. Summarize what it changes and flag anything I should raise.`
        : item.bucket === 'team'
          ? `Review ${pr}: a review was ${item.reason}, not of me by name. Summarize what it changes and flag anything I should raise.`
          : `Check ${pr}: I ${item.reason} and nothing was pushed since.${since} Summarize where the discussion stands and whether it needs a nudge.`
  return `${ask} Don't post anything on GitHub; I'll write the review myself.`
}

// What the model and /review-queue read: one line per PR, its URL included.
export function toText(queue: Queue, now: number) {
  const lines: string[] = []
  for (const g of GROUPS) {
    const items = byBucket(queue, g.bucket)
    lines.push(`${g.title} (${items.length})`)
    for (const item of items) lines.push(`- ${item.repo}#${item.number} ${item.title} — ${item.author}, ${item.reason} ${age(now - item.since)} ago — ${item.url}`)
  }
  if (queue.stale) lines.push(`(${queue.stale} stale PRs with no activity hidden)`)
  if (queue.error) lines.push(`Last refresh failed: ${queue.error}`)
  return lines.join('\n')
}

// The bucket's PRs not in `seen`: the ones that just moved in.
export function arrivals(queue: Queue, bucket: Bucket, seen: readonly string[]) {
  const known = new Set(seen)
  return byBucket(queue, bucket).filter(item => !known.has(item.url))
}

// The toast for PRs that just moved into `bucket`: the one by name, or a count.
export function announcement(bucket: 'rereview' | 'review', fresh: readonly Item[]) {
  const [one] = fresh
  if (!one) return undefined
  const icon = GROUPS.find(g => g.bucket === bucket)?.icon ?? ''
  const named = `${shortRepo(one.repo)}#${one.number} ${one.title}`
  if (bucket === 'rereview') return `${icon} ${fresh.length === 1 ? `Re-review: ${named}` : `${fresh.length} PRs ready for re-review`}`
  return `${icon} ${fresh.length === 1 ? `Review requested: ${named}` : `${fresh.length} new review requests`}`
}

// What this session does with the queue in the store: ask GitHub, or show
// what another session asked. The owner asks once a poll is due; anyone takes
// over once the owner has not asked for a poll and a minute (closed, asleep).
export const GRACE_MS = 60_000

export function duty(stored: Shared | undefined, self: string, now: number, pollMs: number): 'fetch' | 'adopt' {
  if (!stored) return 'fetch'
  const quiet = now - stored.checkedAt
  if (stored.owner === self) return quiet >= pollMs ? 'fetch' : 'adopt'
  return quiet > pollMs + GRACE_MS ? 'fetch' : 'adopt'
}

export function isShared(value: unknown): value is Shared {
  const v = value as Partial<Shared> | null
  return !!v && Array.isArray(v.items) && typeof v.owner === 'string' && typeof v.checkedAt === 'number' && typeof v.fetchedAt === 'number'
}

// The pane's row columns, as the dock lays them out: icon, name, detail, age.
export function columns(inner: number) {
  const metaWidth = 7
  const flex = Math.max(10, inner - (2 + metaWidth))
  const nameWidth = Math.ceil(flex * 0.45)
  return { metaWidth, nameWidth, detailWidth: flex - nameWidth }
}

// Padded or cut to exactly `width` columns.
export function fit(text: string, width: number) {
  const chars = [...text]
  if (width <= 0) return ''
  if (chars.length > width) return `${chars.slice(0, Math.max(0, width - 1)).join('')}…`
  return text + ' '.repeat(width - chars.length)
}

export function compileSkip(pattern: string) {
  if (!pattern.trim()) return null
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}
