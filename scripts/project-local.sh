#!/usr/bin/env bash
# SV-C18 proof: runs <command> with HOME and every XDG_* dir pointed at an empty sentinel and TMPDIR inside
# WORKFLOW/tmp, then fails when anything was written outside the project: a file in the sentinel (a tool that
# fell back to HOME or an XDG default) or a new /tmp entry with one of our prefixes (a tool that ignored TMPDIR).
# Usage: bash scripts/project-local.sh <command...>     (root `test:server` runs the server tiers through it)
# Exit: the command's exit code; 1 when the command passed but wrote outside the project; 2 = usage error.
set -u
[ $# -ge 1 ] || { echo "usage: bash scripts/project-local.sh <command...>" >&2; exit 2; }

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_root="${PROJECT_LOCAL_TMP_ROOT:-/tmp}"
# Prefixes our tools would use in a system temp dir: Python mkdtemp/mkstemp ("tmp"), our tests and scripts,
# qwen/node/vite/playwright/uv/npm temp dirs.
prefixes='^(tmp|agentic-ui|handover|pyz|qwen|node|vite|playwright|pw-|uv-|npm-|chromium|\.org\.chromium)'

work="$root/WORKFLOW/tmp/project-local"
mkdir -p "$work"
run="$(mktemp -d "$work/run.XXXXXX")" || exit 2
sentinel="$run/sentinel"
mkdir -p "$sentinel/home" "$sentinel/config" "$sentinel/cache" "$sentinel/data" "$sentinel/state" "$run/tmp"

ours() { find "$tmp_root" -mindepth 1 -maxdepth 1 -printf '%f\n' 2>/dev/null | grep -E "$prefixes" | sort; }
before="$(ours)"

HOME="$sentinel/home" XDG_CONFIG_HOME="$sentinel/config" XDG_CACHE_HOME="$sentinel/cache" \
  XDG_DATA_HOME="$sentinel/data" XDG_STATE_HOME="$sentinel/state" TMPDIR="$run/tmp" "$@"
code=$?

after="$(ours)"
written="$(find "$sentinel" -mindepth 2 | sed "s|^$sentinel/||")"
leaked="$(comm -13 <(printf '%s\n' "$before") <(printf '%s\n' "$after") | sed '/^$/d')"
status="ok"
if [ -n "$written" ]; then
  status="violation"
  echo "project-local: written into the sentinel HOME/XDG dirs (outside the project):" >&2
  printf '%s\n' "$written" | head -20 >&2
fi
if [ -n "$leaked" ]; then
  status="violation"
  echo "project-local: new entries in $tmp_root:" >&2
  printf '%s\n' "$leaked" | head -20 >&2
fi
echo "project-local: $status (sentinel files: $(printf '%s' "$written" | grep -c .), new $tmp_root entries: $(printf '%s' "$leaked" | grep -c .), exit $code)"
rm -rf "$run"
[ "$code" -ne 0 ] && exit "$code"
[ "$status" = "ok" ] || exit 1
exit 0
