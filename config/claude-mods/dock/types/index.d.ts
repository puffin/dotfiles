// One line of a section, drawn in runwatch's columns:
//   icon  tag  label  aside   detail          ━━━━──  meta
// Enter (or a click) opens its details below it; `o` opens `href`.
export type DockRow = {
  key: string
  icon?: string
  iconColor?: string
  // A short kind badge, up to 3 characters ('tk', 'pr').
  tag?: string
  label: string
  // Muted, after the label: a project, an author.
  aside?: string
  detail?: string
  detailColor?: string
  // 0 to 1: a bar, on a pane wide enough for one.
  progress?: number
  // Right-aligned, up to 7 characters: how long, how old.
  meta?: string
  href?: string
  // The details: a muted heading, the link, then these lines.
  title?: string
  lines?: { text: string; color?: string }[]
  // The ids of its section's row actions it offers; all of them when left out.
  actions?: string[]
}

// A titled list inside a section. Folded, it shows its title and count only.
export type DockGroup = {
  key: string
  title: string
  rows: DockRow[]
  isFolded?: boolean
}

// A button in the action bar. `row` acts on the picked row and shows while one
// of its section's rows is picked; `section` shows whenever the section has rows.
export type DockAction = {
  id: string
  label: string
  // One lowercase letter; `o` and `c` are the dock's own.
  hotkey?: string
  scope: 'row' | 'section'
}

// What a feature mod hands the dock: plain data, drawn by the dock.
export type DockSection = {
  id: string
  title: string
  // Lower sorts first; 100 when left out.
  order?: number
  // Short counts for the section heading and the status line: '⟲ 2 re-review'.
  badge?: string
  // How many rows need the person now. A rise opens the pane unasked.
  attention?: number
  groups: DockGroup[]
  actions?: DockAction[]
  // Muted line under the groups: when it last refreshed, what it hid.
  footer?: string
  error?: string
}

// A press of one of a section's actions: `row` is the picked row's key.
export type DockPress = { section: string; action: string; row?: string }

export type Dock = {
  // Adds the section, or replaces the one with the same id.
  publish: (section: DockSection) => Promise<boolean>
  remove: (section: { id: string }) => Promise<boolean>
  open: () => Promise<boolean>
  // Raised by the dock when the person presses a section's action: the mod
  // that owns the section hooks `dock.action` and acts on its own presses.
  action: (press: DockPress) => Promise<boolean>
}

declare module 'claude-code' {
  interface EngineInterface {
    dock: Dock
  }
  interface PluginState {
    dock: {
      sections: DockSection[]
      // Section ids and `<section>/<group>` keys the person folded or unfolded,
      // against each one's default.
      toggled: string[]
      // `<section>:<row>` of each row whose details are open.
      expanded: string[]
      // `<section>:<row>` of the row the focus ring is on.
      selected: string | null
    }
  }
}
