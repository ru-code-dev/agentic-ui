#!/usr/bin/env bash
# SPEC §13 step 09 (P10-clean-clone): `pnpm check` green from a clean clone of the committed HEAD.
# Clones the repo (local `git clone --no-hardlinks`, so only committed files) into WORKFLOW/tmp/clean-clone, then
# inside the SV-C18 sentinel (scripts/project-local.sh: HOME/XDG on an empty dir, nothing written outside the
# project) runs scripts/setup-workflow.sh, `pnpm install --frozen-lockfile`, `pnpm check`, and requires an empty
# `git status --porcelain` afterwards.
# Reused from this checkout (documented, CLEAN_CLONE_REUSE=0 turns it off and downloads/builds everything):
#   WORKFLOW/tools/<os>-<arch> (uv, Python 3.13, qwen-code build, ruff) and WORKFLOW/cache/xdg/ms-playwright
#   (Chromium) as symlinks; the pnpm content store and the corepack cache as read/write caches.
# Never copied: WORKFLOW/secrets/ (tier 4 is opt-in and not part of pnpm check; it skips there).
# The clone uses the e2e ports (3458, 3459, 8790): do not run another `pnpm e2e` at the same time.
# CLEAN_CLONE_DEST overrides the target dir; CLEAN_CLONE_ONLY=clone stops after the clone (scripts/clean-clone.test.mjs).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
. "$root/scripts/workflow-env.sh"
dest="${CLEAN_CLONE_DEST:-$WORKFLOW_DIR/tmp/clean-clone}"
reuse="${CLEAN_CLONE_REUSE:-1}"

rm -rf "$dest"
git clone --quiet --no-hardlinks "$root" "$dest"
git -C "$dest" clean -xfdq
echo "clean-clone: $dest at $(git -C "$dest" rev-parse --short HEAD)"

if [ "$reuse" = "1" ]; then
  mkdir -p "$dest/WORKFLOW/tools" "$dest/WORKFLOW/cache/xdg"
  ln -s "$WORKFLOW_TOOLS" "$dest/WORKFLOW/tools/$WORKFLOW_PLATFORM"
  [ -d "$XDG_CACHE_HOME/ms-playwright" ] && ln -s "$XDG_CACHE_HOME/ms-playwright" "$dest/WORKFLOW/cache/xdg/ms-playwright"
  store="$(dirname "$(cd "$root" && pnpm store path)")"  # pnpm store path ends in the store version (v10)
  export COREPACK_HOME="$XDG_CACHE_HOME/node/corepack"
  echo "clean-clone: reusing $WORKFLOW_TOOLS, ms-playwright, pnpm store and corepack cache"
else
  store=""
fi
{ [ ! -e "$dest/WORKFLOW/llm.env" ] && [ ! -d "$dest/WORKFLOW/secrets" ]; } || { echo "clean-clone: machine-local secrets in the clone" >&2; exit 1; }
[ "${CLEAN_CLONE_ONLY:-}" != "clone" ] || exit 0

cd "$dest"
inside() { bash "$dest/scripts/project-local.sh" bash -c "$1"; }
inside "bash scripts/setup-workflow.sh"
install="CI=true pnpm install --frozen-lockfile --config.confirmModulesPurge=false"
[ -z "$store" ] || install="$install --store-dir '$store'"
inside ". scripts/workflow-env.sh && $install"
inside ". scripts/workflow-env.sh && pnpm check"

left="$(git -C "$dest" status --porcelain)"
if [ -n "$left" ]; then
  echo "clean-clone: pnpm check left the tree dirty:" >&2
  printf '%s\n' "$left" >&2
  exit 1
fi
echo "clean-clone: pnpm check green, tree clean"
