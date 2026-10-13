# runwatch

Watches Terrakube jobs, Jenkins builds, GitHub PR checks and GitHub Actions runs
in a Claude Code pane. You get told when each one finishes or waits for you, and
Claude doesn't burn tokens polling them.

```
◆ runwatch   1 running · 1 waiting · 3 done · 1 failed

RUNNING
⟳ tk  alz-connectivity-prod     running                  ━━━━━━──────   4m12s
‖ gha CI                        waiting for approval                    1m03s
DONE
✗ pr  GE.CloudOps.ALZ.Vending#42  1/5 checks failed                    6m40s
      ✗ terraform-plan
✓ jk  Platform/deploy           #41 SUCCESS                            3m02s

o: open   a: ask Claude   x: remove   d: clear done   c: close
ctrl+x tab: keys here · ↑↓ pick · enter details · every 20s
```

## What it picks up by itself

| You or Claude run | It watches |
| --- | --- |
| `terrakube.sh run <org> … --confirm` | the job, named after its workspace and template |
| `jenkins.sh trigger <path>` | the build, from the queue until it ends |
| `gh pr create` | the PR's checks, until they pass, fail, or it merges or closes |
| `git push` | the open PR for the branch, if there is one |
| `gh workflow run`, `gh run rerun` | the Actions run |

To add one by hand, use `/watch`:

```
/watch                          open the pane
/watch tk <org> <job>           a Terrakube job
/watch jenkins <path> [build]   a Jenkins build (default: newest)
/watch pr [number|url]          PR checks (default: the current branch)
/watch gha <run id|url>         an Actions run
/watch clear                    drop finished runs
```

Claude can also hand a run over through the mod's `watch` tool. When that run
finishes, Claude gets a prompt with the result, the run's link and the failing
lines, so it can carry on without sleep-polling.

## When a run finishes

- A toast in the terminal, with the Terraform plan summary (`plan: +2 ~0 -1`)
  or the failing checks and steps.
- A desktop notification.
- A short chime: rising when it passes, falling when it fails, a double tone
  when it waits for approval.
- Waiting for approval (Terrakube or an Actions environment) gets the same
  treatment, so a job that's waiting on you doesn't sit there unnoticed.

Each of the three has its own setting: `always`, `failures` (failures and
approvals only) or `off`. Set all three to `failures` to hear only about runs
that need you.

## The pane

`ctrl+x tab` (or a click) gives the pane the keys. `↑`/`↓` move between rows,
and `Enter` opens a row's details: its title (PR or run title, Terrakube
template), the link, the plan or failing steps, and when it was last checked.
The keys act on the selected row:

- `o` opens the run in your browser.
- `a` (finished runs) asks Claude to look into it.
- `x` removes it.
- `d` clears every finished run.
- `c` closes the pane.

While the pane is closed, the status line counts what's running, waiting and
failed.

Watches are saved across sessions, on this machine only. Every session shows
every project's runs by default. A run from another project is tagged with its
folder (`alz-mgmt · GE.CloudOps.ALZ.Vending`), and only this project's runs open
the pane by themselves. Set `show` to `project` to see only this project's runs.

The session that started a watch checks it and announces it. If that session
goes quiet for 5 minutes (closed, or its machine asleep), the next session that
shows the watch takes it over, and the first session takes it back if it comes
back. Only the session that started a watch wakes its Claude, even when another
session saw the run finish. Removing a row, or clearing done, applies
in every session; clearing done only clears the rows you can see.

## Settings

All of these are in `/config` under runwatch.

| Setting | Default | |
| --- | --- | --- |
| `pollSeconds` | 20 | how often each running watch is checked |
| `toast` | `always` | in-terminal toast: `always`, `failures` (failures and approvals), `off` |
| `notify` | `always` | desktop notification: `always`, `failures`, `off` |
| `sound` | `always` | chime: `always`, `failures`, `off` |
| `wakeClaude` | on | send Claude the result of runs it handed over |
| `openPane` | on | open the pane when one of this project's watches starts or is running |
| `show` | `all` | `all` projects' runs, or only this `project`'s |
| `keepDoneHours` | 24 | how long finished runs stay listed |
| `toastSeconds` | 10 | how long the toast stays up |
| `terrakubeScript`, `jenkinsScript` | empty | wrapper script paths; empty finds them in the plugin cache |

## Requirements

- **Terrakube and Jenkins:** the `terrakube` and `jenkins` skills (from the
  `ge-cloudops` marketplace, or any marketplace that ships
  `<name>/<version>/scripts/<name>.sh`). runwatch calls their wrapper scripts,
  so your credentials stay in those scripts.
- **PRs and Actions:** `gh`, signed in. With several accounts
  (`gh auth status`), each repo is checked as the account named after its
  owner, if you're signed in to it. Otherwise it uses the active account.

## Install

Until it's in a marketplace, point Claude Code at this folder:

```sh
claude --plugin-dir /path/to/runwatch
# or, for every session:
export CLAUDE_CODE_PLUGIN_DIRS=/path/to/runwatch
```

## Develop

```sh
claude plugin validate .
claude plugin test .
bunx --bun -p typescript@5.6.3 tsc -p .
```

`hooks/watch.ts` holds the parsing, detection and layout, with no engine
calls, so its tests stay small. `hooks/register.tsx` holds the engine side:
polling, the store, announcing, the pane and `/watch`.
