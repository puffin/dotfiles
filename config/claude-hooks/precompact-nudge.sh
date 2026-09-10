#!/usr/bin/env bash
# PreCompact hook (matcher: auto) — advisory nudge toward /clear.
#
# Local session-log analysis showed 80%+ of token usage happens in turns
# where context has already blown past 150k, driven by sessions that run
# for hours/days across many unrelated tasks without ever being /clear'd.
# Auto-compaction firing is the clearest in-session signal that a session
# has grown large — surface a nudge right then. Advisory only: never
# blocks, never reads sensitive fields, fails open on any parse error.
set -uo pipefail

command -v jq >/dev/null 2>&1 || exit 0
input=$(cat)
trigger=$(jq -r '.trigger // ""' <<<"$input" 2>/dev/null)

# Belt-and-suspenders: the "auto" matcher in settings.json should already
# restrict this to automatic compaction, but don't nudge on a manual
# /compact if this ever gets invoked outside that matcher.
[[ "$trigger" == "manual" ]] && exit 0

cat <<'EOF'
{"systemMessage": "Auto-compaction just kicked in — this session has grown large. If you're about to switch to a new or unrelated task, consider /clear instead of continuing here."}
EOF
exit 0
